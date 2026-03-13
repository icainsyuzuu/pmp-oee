import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

// ─── HELPER: Ambil string YYYY-MM-DD dari nilai tanggal apapun ────────────────
// Supabase DATE column → bisa berupa string "2026-01-01" atau "2026-01-01T00:00:00+00:00"
// JANGAN konversi ke Date object karena akan kena timezone shift (UTC+7 → mundur 1 hari)
function toDateString(tanggal: any): string {
  if (!tanggal) return ''
  const s = String(tanggal)
  // Ambil 10 karakter pertama dari ISO string: "2026-01-01T..." → "2026-01-01"
  // Ini aman untuk semua format: "2026-01-01", "2026-01-01T00:00:00Z", "2026-01-01T17:00:00+07:00"
  return s.slice(0, 10)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const unitId    = searchParams.get('unit_id')
    const plantCode = searchParams.get('plant')
    const startDate = searchParams.get('start')
    const endDate   = searchParams.get('end')
    const monthly   = searchParams.get('monthly') === 'true'

    // ── MONTHLY AGGREGATE ──
    if (monthly) {
      let unitIds: number[] = []

      if (unitId) {
        unitIds = [parseInt(unitId)]
      } else if (plantCode) {
        const { data: unitsData, error: unitsError } = await supabase
          .from('production_units')
          .select('id, plants!inner(code)')
          .eq('plants.code', plantCode)
        if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 })
        unitIds = (unitsData ?? []).map((u: any) => u.id)
      }

      let query = supabase
        .from('oee_daily')
        .select('unit_id, tanggal, es_keluar, total_rusak, availability, performance, quality, oee, agg_availability, agg_performance, agg_quality, agg_oee')
        .order('tanggal', { ascending: false })

      if (unitIds.length > 0) query = query.in('unit_id', unitIds)

      const { data: dailyData, error: dailyError } = await query
      if (dailyError) return NextResponse.json({ error: dailyError.message }, { status: 500 })

      // Group by unit_id + bulan (YYYY-MM)
      const grouped: Record<string, any> = {}
      for (const row of (dailyData ?? [])) {
        // ── FIX: Gunakan toDateString() bukan String(row.tanggal) langsung ──
        // String(Date object) di UTC+7 → "Wed Dec 31 2025 ..." → slice(0,7) = "Wed Dec" ✗
        // toDateString() → selalu "2026-01-01" → slice(0,7) = "2026-01" ✓
        const dateStr = toDateString(row.tanggal)
        const bulan   = dateStr.slice(0, 7)           // "2026-01"
        const key     = `${row.unit_id}__${bulan}`

        if (!grouped[key]) {
          grouped[key] = {
            unit_id:         row.unit_id,
            bulan,
            jumlah_hari:     0,
            total_es_keluar: 0,
            total_rusak:     0,
            agg_avail: null, agg_perf: null, agg_qual: null, agg_oee_val: null,
            _avail_sum: 0, _perf_sum: 0, _qual_sum: 0, _oee_sum: 0, _n: 0,
          }
        }
        const g = grouped[key]
        g.jumlah_hari     += 1
        g.total_es_keluar += Number(row.es_keluar  ?? 0)
        g.total_rusak     += Number(row.total_rusak ?? 0)

        if (g.agg_avail    == null && row.agg_availability != null) g.agg_avail    = row.agg_availability
        if (g.agg_perf     == null && row.agg_performance  != null) g.agg_perf     = row.agg_performance
        if (g.agg_qual     == null && row.agg_quality      != null) g.agg_qual     = row.agg_quality
        if (g.agg_oee_val  == null && row.agg_oee          != null) g.agg_oee_val  = row.agg_oee

        if (row.availability != null) { g._avail_sum += row.availability; g._n += 1 }
        if (row.performance  != null)   g._perf_sum  += row.performance
        if (row.quality      != null)   g._qual_sum  += row.quality
        if (row.oee          != null)   g._oee_sum   += row.oee
      }

      const result = Object.values(grouped).map((g: any) => {
        const avail = g.agg_avail   ?? (g._n > 0 ? g._avail_sum / g._n : null)
        const perf  = g.agg_perf    ?? (g._n > 0 ? g._perf_sum  / g._n : null)
        const qual  = g.agg_qual    ?? (g._n > 0 ? g._qual_sum  / g._n : null)
        const oee   = g.agg_oee_val ?? (g._n > 0 ? g._oee_sum   / g._n : null)
        return {
          unit_id:         g.unit_id,
          bulan:           g.bulan,
          jumlah_hari:     g.jumlah_hari,
          total_es_keluar: g.total_es_keluar,
          total_rusak:     g.total_rusak,
          availability:    avail,
          performance:     perf,
          quality:         qual,
          oee,
        }
      }).sort((a, b) => b.bulan.localeCompare(a.bulan))

      return NextResponse.json(result)
    }

    // ── DATA HARIAN ──
    let query = supabase
      .from('oee_daily')
      .select(`
        *,
        production_units ( id, code, label, format,
          plants ( id, code, name )
        )
      `)
      .order('tanggal', { ascending: true })
      .limit(10000)

    if (unitId)    query = query.eq('unit_id', unitId)
    if (startDate) query = query.gte('tanggal', startDate)
    if (endDate)   query = query.lte('tanggal', endDate)

    if (plantCode && !unitId) {
      const { data: unitsData } = await supabase
        .from('production_units')
        .select('id, plants!inner(code)')
        .eq('plants.code', plantCode)
      const ids = (unitsData ?? []).map((u: any) => u.id)
      if (ids.length > 0) query = query.in('unit_id', ids)
    }

    const { data, error } = await query
    console.log(`[OEE] unit_id=${unitId} start=${startDate} end=${endDate} → ${data?.length ?? 0} rows ${error ? 'ERROR:'+error.message : ''}`)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ── FIX: Normalisasi field tanggal di setiap row sebelum dikirim ke client ──
    // Supabase DATE → string "2026-01-01T00:00:00+00:00" (bisa bervariasi)
    // Normalisasi ke "2026-01-01" agar frontend tidak perlu parse ulang
    const normalized = (data ?? []).map((row: any) => ({
      ...row,
      tanggal: toDateString(row.tanggal),
    }))

    return NextResponse.json(normalized)

  } catch (err: any) {
    console.error('OEE route error:', err)
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}