import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseKonsolSheet, toDbRecords } from '@/lib/xlsx-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file     = formData.get('file')    as File | null
    const unitId   = formData.get('unit_id') as string | null

    if (!file)   return NextResponse.json({ error: 'File XLSX wajib diupload.' }, { status: 400 })
    if (!unitId) return NextResponse.json({ error: 'unit_id wajib diisi.' }, { status: 400 })

    const unitIdNum = parseInt(unitId)
    if (isNaN(unitIdNum)) return NextResponse.json({ error: 'unit_id tidak valid.' }, { status: 400 })

    // Format yang diharapkan (dikirim dari client)
    const expectedFormat = formData.get('expected_format') as string | null

    // Validasi tipe file
    if (!file.name.match(/\.(xlsx|xls)$/i))
      return NextResponse.json({ error: 'File harus berformat .xlsx atau .xls' }, { status: 400 })

    // Parse XLSX — raw:true agar angka tetap angka, cellDates:true agar tanggal jadi Date object
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true, raw: true })

    if (!wb.Sheets['Konsol'])
      return NextResponse.json({ error: "Sheet 'Konsol' tidak ditemukan di file ini." }, { status: 400 })

    const ws  = wb.Sheets['Konsol']
    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1, defval: null, raw: true,
    }) as any[][]

    // Baca sheet Effectiveness dengan raw:false (agar nilai desimal terbaca, bukan formula)
    let rawEffectiveness: any[][] | undefined
    if (wb.Sheets['Effectiveness']) {
      rawEffectiveness = XLSX.utils.sheet_to_json(wb.Sheets['Effectiveness'], {
        header: 1, defval: null, raw: false,   // raw:false → angka desimal tetap terbaca sebagai string angka
      }) as any[][]
      // Debug Effectiveness
      const effG23 = rawEffectiveness[22]?.[6]
      const effK10 = rawEffectiveness[9]?.[10]
      const effG10 = rawEffectiveness[9]?.[6]
      console.log(`[Upload] Effectiveness → G10(avail)=${effG10} K10(perf)=${effK10} G23(capacity)=${effG23} rows=${rawEffectiveness.length}`)
    } else {
      console.log('[Upload] Effectiveness sheet NOT FOUND')
    }

    // Parse ke struktur data
    const result = parseKonsolSheet(raw, rawEffectiveness)

    // Debug log — bisa dihapus setelah verified
    console.log(`[Upload] format=${result.format} bulan=${result.bulan} rows=${result.row_count}`)
    if (result.rows.length > 0) {
      console.log(`[Upload] sample row[0]:`, JSON.stringify(result.rows[0]))
      console.log(`[Upload] sample row[-1]:`, JSON.stringify(result.rows[result.rows.length - 1]))
    }
    console.log(`[Upload] agg → avail=${result.agg_availability?.toFixed(4)} perf=${result.agg_performance?.toFixed(4)} qual=${result.agg_quality?.toFixed(4)} oee=${result.agg_oee?.toFixed(4)}`)

    // Validasi format di server — double check
    if (expectedFormat && result.format !== expectedFormat) {
      return NextResponse.json({
        error: `Format file tidak sesuai. File terdeteksi sebagai '${result.format.toUpperCase()}' tapi unit ini membutuhkan format '${expectedFormat.toUpperCase()}'.`
      }, { status: 400 })
    }

    if (result.row_count === 0)
      return NextResponse.json({ error: 'Tidak ada data valid yang terbaca dari sheet Konsol.' }, { status: 400 })

    // Konversi ke DB records
    const records = toDbRecords(result, unitIdNum)

    // Deduplikasi — ambil baris terakhir jika ada tanggal duplikat dalam file
    const dedupMap = new Map<string, any>()
    for (const rec of records) {
      dedupMap.set((rec as any).tanggal, rec)
    }
    const dedupedRecords = Array.from(dedupMap.values())

    // Upsert ke Supabase dalam batch kecil (50 baris) untuk menghindari timeout
    const BATCH = 50
    for (let i = 0; i < dedupedRecords.length; i += BATCH) {
      const batch = dedupedRecords.slice(i, i + BATCH)
      const { error: upsertError } = await supabase
        .from('oee_daily')
        .upsert(batch, { onConflict: 'unit_id,tanggal' })

      if (upsertError) {
        console.error('Supabase upsert error:', upsertError)
        return NextResponse.json({
          error: `Gagal simpan data (batch ${Math.floor(i / BATCH) + 1}): ${upsertError.message}`
        }, { status: 500 })
      }
    }

    // Catat upload log
    await supabase.from('upload_logs').insert({
      unit_id:   unitIdNum,
      file_name: file.name,
      row_count: result.row_count,
      format:    result.format,
      bulan:     result.bulan,
    })

    return NextResponse.json({
      success:          true,
      format:           result.format,
      bulan:            result.bulan,
      rowCount:         result.row_count,
      totalEsKeluar:    result.total_es_keluar,
      totalRusak:       result.total_rusak,
      agg_availability: result.agg_availability,
      agg_performance:  result.agg_performance,
      agg_quality:      result.agg_quality,
      agg_oee:          result.agg_oee,
    })

  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message ?? 'Terjadi kesalahan server.' }, { status: 500 })
  }
}