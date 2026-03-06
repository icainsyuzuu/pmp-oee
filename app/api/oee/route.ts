import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const unitId    = searchParams.get('unit_id')
    const plantCode = searchParams.get('plant')
    const startDate = searchParams.get('start')
    const endDate   = searchParams.get('end')
    const monthly   = searchParams.get('monthly') === 'true'

    // ── MONTHLY AGGREGATE ──
    // Jika monthly=true, hitung aggregate dari oee_daily langsung
    // (tidak pakai view agar tidak tergantung apakah view sudah dibuat)
    if (monthly) {
      // Ambil semua unit_id yang relevan
      let unitIds: number[] = []

      if (unitId) {
        unitIds = [parseInt(unitId)]
      } else if (plantCode) {
        // Cari unit_id dari plant code
        const { data: unitsData, error: unitsError } = await supabase
          .from('production_units')
          .select('id, plants!inner(code)')
          .eq('plants.code', plantCode)
        if (unitsError) return NextResponse.json({ error: unitsError.message }, { status: 500 })
        unitIds = (unitsData ?? []).map((u: any) => u.id)
      }

      // Query oee_daily — ambil semua kolom OEE (agg_ dan per-baris)
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
        const bulan = String(row.tanggal).slice(0, 7)
        const key   = `${row.unit_id}__${bulan}`
        if (!grouped[key]) {
          grouped[key] = {
            unit_id:         row.unit_id,
            bulan,
            jumlah_hari:     0,
            total_es_keluar: 0,
            total_rusak:     0,
            // Untuk agg_ (Balok & Kristal): simpan nilai dari baris manapun (seharusnya sama per bulan)
            agg_avail: null, agg_perf: null, agg_qual: null, agg_oee_val: null,
            // Untuk per-baris (Balok daily OEE): akumulasi untuk rata-rata
            _avail_sum: 0, _perf_sum: 0, _qual_sum: 0, _oee_sum: 0, _n: 0,
          }
        }
        const g = grouped[key]
        g.jumlah_hari     += 1
        g.total_es_keluar += Number(row.es_keluar  ?? 0)
        g.total_rusak     += Number(row.total_rusak ?? 0)

        // Simpan agg_ (ambil nilai non-null pertama — nilainya sama setiap baris dalam 1 bulan)
        if (g.agg_avail == null && row.agg_availability != null) g.agg_avail    = row.agg_availability
        if (g.agg_perf  == null && row.agg_performance  != null) g.agg_perf     = row.agg_performance
        if (g.agg_qual  == null && row.agg_quality       != null) g.agg_qual    = row.agg_quality
        if (g.agg_oee_val == null && row.agg_oee         != null) g.agg_oee_val = row.agg_oee

        // Akumulasi per-baris (untuk fallback jika agg_ null)
        if (row.availability != null) { g._avail_sum += row.availability; g._n += 1 }
        if (row.performance  != null)   g._perf_sum  += row.performance
        if (row.quality      != null)   g._qual_sum  += row.quality
        if (row.oee          != null)   g._oee_sum   += row.oee
      }

      const result = Object.values(grouped).map((g: any) => {
        // Prioritaskan agg_ (lebih akurat); fallback ke rata-rata per-baris
        const avail = g.agg_avail    ?? (g._n > 0 ? g._avail_sum / g._n : null)
        const perf  = g.agg_perf     ?? (g._n > 0 ? g._perf_sum  / g._n : null)
        const qual  = g.agg_qual     ?? (g._n > 0 ? g._qual_sum  / g._n : null)
        const oee   = g.agg_oee_val  ?? (g._n > 0 ? g._oee_sum   / g._n : null)
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

    if (unitId)    query = query.eq('unit_id', unitId)
    if (startDate) query = query.gte('tanggal', startDate)
    if (endDate)   query = query.lte('tanggal', endDate)

    // Filter by plant code — lookup unit ids dulu
    if (plantCode && !unitId) {
      const { data: unitsData } = await supabase
        .from('production_units')
        .select('id, plants!inner(code)')
        .eq('plants.code', plantCode)
      const ids = (unitsData ?? []).map((u: any) => u.id)
      if (ids.length > 0) query = query.in('unit_id', ids)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])

  } catch (err: any) {
    console.error('OEE route error:', err)
    return NextResponse.json({ error: err.message ?? 'Server error' }, { status: 500 })
  }
}