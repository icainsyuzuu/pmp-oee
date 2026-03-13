import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseKonsolSheet, parseKristalNew, toDbRecords } from '@/lib/xlsx-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    const file           = formData.get('file')           as File   | null
    const unitId         = formData.get('unit_id')        as string | null
    const expectedFormat = formData.get('expected_format') as string | null

    if (!file)
      return NextResponse.json({ error: 'File XLSX wajib diupload.' }, { status: 400 })

    if (!unitId)
      return NextResponse.json({ error: 'unit_id wajib diisi.' }, { status: 400 })

    const unitIdNum = parseInt(unitId)
    if (isNaN(unitIdNum))
      return NextResponse.json({ error: 'unit_id tidak valid.' }, { status: 400 })

    if (!file.name.match(/\.(xlsx|xls)$/i))
      return NextResponse.json({ error: 'File harus berformat .xlsx atau .xls' }, { status: 400 })


    /* ─────────────────────────────────────────────
       READ XLSX
       ── PENTING: selalu gunakan wbNoDate untuk sheet yang mengandung date ──
       Dengan cellDates:true, XLSX.js membuat JavaScript Date object menggunakan
       local time server. Di server Node.js (Vercel dll.), timezone bisa UTC atau
       Asia/Jakarta — hasilnya berbeda dan tidak bisa diprediksi.
       Contoh: cell "2026-01-01 00:00 WIB" dengan cellDates:true di timezone UTC
       menghasilkan Date("2025-12-31T17:00:00Z") → tanggal terbaca 2025-12-31 (SALAH).
       Dengan cellDates:false, date cell dikirim sebagai SERIAL NUMBER (misal 46023)
       yang di-parse oleh toDate() via XLSX.SSF.parse_date_code → hasilnya selalu benar
       tanpa bergantung pada timezone server.
       wb (cellDates:true)  → hanya dipakai untuk deteksi nama sheet
       wbNoDate (cellDates:false) → dipakai untuk SEMUA sheet_to_json
    ───────────────────────────────────────────── */

    const buffer = await file.arrayBuffer()

    const wb = XLSX.read(buffer, {
      type:      'array',
      cellDates: true,
      raw:       true,
    })

    const wbNoDate = XLSX.read(buffer, {
      type:      'array',
      cellDates: false,
      raw:       true,
    })


    let result: ReturnType<typeof parseKonsolSheet>


    /* ─────────────────────────────────────────────
       FORMAT KRISTAL BARU
       Sheet: Data Harian & OEE
    ───────────────────────────────────────────── */

    if (wb.Sheets['Data Harian & OEE']) {

      console.log('[Upload] Detected format: KRISTAL')

      const rawData = XLSX.utils.sheet_to_json(
        wbNoDate.Sheets['Data Harian & OEE'],
        { header: 1, defval: null, raw: true },
      ) as any[][]

      let rawRingkasan: any[][] | undefined

      if (wb.Sheets['Ringkasan OEE']) {
        rawRingkasan = XLSX.utils.sheet_to_json(
          wbNoDate.Sheets['Ringkasan OEE'],
          { header: 1, defval: null, raw: true },
        ) as any[][]
      }

      result = {
        format: 'kristal' as const,
        ...parseKristalNew(rawData, rawRingkasan),
      }

      if (expectedFormat && expectedFormat !== 'kristal') {
        return NextResponse.json({
          error: `Format tidak sesuai. File ini KRISTAL tetapi unit membutuhkan ${expectedFormat.toUpperCase()}.`,
        }, { status: 400 })
      }

    }


    /* ─────────────────────────────────────────────
       FORMAT BALOK / PAKIS / TUBAN
       Sheet: Konsol
    ───────────────────────────────────────────── */

    else if (wb.Sheets['Konsol']) {

      // Gunakan wbNoDate agar date cell dikirim sebagai serial number (timezone-safe)
      const raw = XLSX.utils.sheet_to_json(
        wbNoDate.Sheets['Konsol'],
        { header: 1, defval: null, raw: true },
      ) as any[][]


      /* OEE sheet detection */

      let rawOEESheet: any[][] | undefined

      const oeeSheetName =
        wbNoDate.Sheets['OEE']            ? 'OEE'
        : wbNoDate.Sheets['Effectiveness'] ? 'Effectiveness'
        : null

      if (oeeSheetName) {

        rawOEESheet = XLSX.utils.sheet_to_json(
          wbNoDate.Sheets[oeeSheetName],
          { header: 1, defval: null, raw: true },
        ) as any[][]

        const r9  = rawOEESheet[9]  ?? []
        const r22 = rawOEESheet[22] ?? []

        console.log(
          `[Upload] Sheet '${oeeSheetName}' → G10=${r9[6]} K10=${r9[10]} O10=${r9[14]}`
        )
      }


      /* PARSE FILE */

      result = parseKonsolSheet(raw, rawOEESheet)


      /* ─────────────────────────────────────────
         VALIDASI FORMAT UNIT
      ───────────────────────────────────────── */

      if (expectedFormat && result.format !== expectedFormat) {

        return NextResponse.json({
          error:
`Format file tidak sesuai.

File terdeteksi sebagai:
${result.format.toUpperCase()}

Tetapi unit ini hanya menerima:
${expectedFormat.toUpperCase()}`,
        }, { status: 400 })

      }

    }


    /* ─────────────────────────────────────────────
       ERROR JIKA SHEET TIDAK DITEMUKAN
    ───────────────────────────────────────────── */

    else {

      return NextResponse.json({
        error: "Sheet 'Konsol' atau 'Data Harian & OEE' tidak ditemukan.",
      }, { status: 400 })

    }


    /* ─────────────────────────────────────────────
       DEBUG LOG
    ───────────────────────────────────────────── */

    console.log(`[Upload] format=${result.format}`)
    console.log(`[Upload] bulan=${result.bulan}`)
    console.log(`[Upload] rows=${result.row_count}`)


    if (result.row_count === 0)
      return NextResponse.json({
        error: 'Tidak ada data valid yang terbaca dari file.',
      }, { status: 400 })


    /* ─────────────────────────────────────────────
       CEK DUPLIKAT — Apakah bulan ini sudah ada di DB?
    ───────────────────────────────────────────── */

    const sortedDates = result.rows.map(r => r.tanggal).sort()
    const firstDate   = sortedDates[0]
    const lastDate    = sortedDates[sortedDates.length - 1]

    const { count: existingCount, error: countError } = await supabase
      .from('oee_daily')
      .select('tanggal', { count: 'exact', head: true })
      .eq('unit_id', unitIdNum)
      .gte('tanggal', firstDate)
      .lte('tanggal', lastDate)

    if (countError) {
      console.error('[Upload] Duplicate check error:', countError)
    }

    const bulanLabel = result.bulan || `${firstDate.slice(0, 7)}`

    if (!countError && existingCount && existingCount > 0) {

      return NextResponse.json({
        duplicate:    true,
        bulan:        bulanLabel,
        format:       result.format,
        existingRows: existingCount,
        newRows:      result.row_count,
        firstDate,
        lastDate,
        confirmToken: Buffer.from(`${unitIdNum}|${firstDate}|${lastDate}`).toString('base64'),
        error:
`Data untuk bulan ${bulanLabel} sudah ada di database (${existingCount} baris).

Apakah Anda ingin menimpa data yang sudah ada?`,
      }, { status: 409 })

    }


    /* ─────────────────────────────────────────────
       PREPARE DB RECORDS
    ───────────────────────────────────────────── */

    const records = toDbRecords(result, unitIdNum)

    const dedupMap = new Map<string, any>()
    for (const rec of records) dedupMap.set((rec as any).tanggal, rec)
    const dedupedRecords = Array.from(dedupMap.values())


    /* ─────────────────────────────────────────────
       UPSERT DATABASE
    ───────────────────────────────────────────── */

    const BATCH = 50

    for (let i = 0; i < dedupedRecords.length; i += BATCH) {

      const { error: upsertError } = await supabase
        .from('oee_daily')
        .upsert(
          dedupedRecords.slice(i, i + BATCH),
          { onConflict: 'unit_id,tanggal' },
        )

      if (upsertError) {
        console.error('Supabase upsert error:', upsertError)
        return NextResponse.json({
          error: `Gagal simpan data: ${upsertError.message}`,
        }, { status: 500 })
      }

    }


    /* ─────────────────────────────────────────────
       LOG UPLOAD
    ───────────────────────────────────────────── */

    await supabase
      .from('upload_logs')
      .insert({
        unit_id:   unitIdNum,
        file_name: file.name,
        row_count: result.row_count,
        format:    result.format,
        bulan:     result.bulan,
      })


    /* ─────────────────────────────────────────────
       SUCCESS RESPONSE
    ───────────────────────────────────────────── */

    return NextResponse.json({
      success: true,

      format: result.format,
      bulan:  result.bulan,

      rowCount: result.row_count,

      totalEsKeluar: result.total_es_keluar,
      totalRusak:    result.total_rusak,

      agg_availability: result.agg_availability,
      agg_performance:  result.agg_performance,
      agg_quality:      result.agg_quality,
      agg_oee:          result.agg_oee,
    })

  }

  catch (err: any) {

    console.error('Upload error:', err)

    return NextResponse.json({
      error: err.message ?? 'Terjadi kesalahan server.',
    }, { status: 500 })

  }
}


/* ═══════════════════════════════════════════════════════════════════════════
   PATCH  /api/upload
   Endpoint untuk konfirmasi overwrite data duplikat.
═══════════════════════════════════════════════════════════════════════════ */

export async function PATCH(req: NextRequest) {
  try {
    const formData = await req.formData()

    const file           = formData.get('file')           as File   | null
    const unitId         = formData.get('unit_id')        as string | null
    const confirmToken   = formData.get('confirm_token')  as string | null
    const expectedFormat = formData.get('expected_format') as string | null

    if (!file || !unitId || !confirmToken)
      return NextResponse.json({
        error: 'File, unit_id, dan confirm_token wajib diisi.',
      }, { status: 400 })

    const unitIdNum = parseInt(unitId)
    if (isNaN(unitIdNum))
      return NextResponse.json({ error: 'unit_id tidak valid.' }, { status: 400 })

    let tokenUnitId: number, tokenFirst: string, tokenLast: string
    try {
      const decoded    = Buffer.from(confirmToken, 'base64').toString('utf-8')
      const parts      = decoded.split('|')
      tokenUnitId      = parseInt(parts[0])
      tokenFirst       = parts[1]
      tokenLast        = parts[2]

      if (tokenUnitId !== unitIdNum || !tokenFirst || !tokenLast)
        throw new Error('Token tidak valid')

    } catch {
      return NextResponse.json({ error: 'Token konfirmasi tidak valid.' }, { status: 400 })
    }


    /* ─── READ & PARSE ─── */

    const buffer = await file.arrayBuffer()

    // Sama seperti POST: gunakan wbNoDate untuk sheet_to_json (timezone-safe)
    const wb       = XLSX.read(buffer, { type: 'array', cellDates: true,  raw: true })
    const wbNoDate = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true })

    let result: ReturnType<typeof parseKonsolSheet>

    if (wb.Sheets['Data Harian & OEE']) {

      const rawData = XLSX.utils.sheet_to_json(
        wbNoDate.Sheets['Data Harian & OEE'],
        { header: 1, defval: null, raw: true },
      ) as any[][]

      let rawRingkasan: any[][] | undefined
      if (wb.Sheets['Ringkasan OEE']) {
        rawRingkasan = XLSX.utils.sheet_to_json(
          wbNoDate.Sheets['Ringkasan OEE'],
          { header: 1, defval: null, raw: true },
        ) as any[][]
      }

      result = { format: 'kristal' as const, ...parseKristalNew(rawData, rawRingkasan) }

      if (expectedFormat && expectedFormat !== 'kristal')
        return NextResponse.json({
          error: `Format tidak sesuai. File ini KRISTAL tetapi unit membutuhkan ${expectedFormat.toUpperCase()}.`,
        }, { status: 400 })

    } else if (wb.Sheets['Konsol']) {

      // Gunakan wbNoDate agar date cell dikirim sebagai serial number (timezone-safe)
      const raw = XLSX.utils.sheet_to_json(
        wbNoDate.Sheets['Konsol'],
        { header: 1, defval: null, raw: true },
      ) as any[][]

      let rawOEESheet: any[][] | undefined
      const oeeSheetName =
        wbNoDate.Sheets['OEE']            ? 'OEE'
        : wbNoDate.Sheets['Effectiveness'] ? 'Effectiveness'
        : null
      if (oeeSheetName) {
        rawOEESheet = XLSX.utils.sheet_to_json(
          wbNoDate.Sheets[oeeSheetName],
          { header: 1, defval: null, raw: true },
        ) as any[][]
      }

      result = parseKonsolSheet(raw, rawOEESheet)

      if (expectedFormat && result.format !== expectedFormat)
        return NextResponse.json({
          error: `Format file tidak sesuai. Terdeteksi: ${result.format.toUpperCase()}, dibutuhkan: ${expectedFormat.toUpperCase()}`,
        }, { status: 400 })

    } else {
      return NextResponse.json({
        error: "Sheet 'Konsol' atau 'Data Harian & OEE' tidak ditemukan.",
      }, { status: 400 })
    }

    if (result.row_count === 0)
      return NextResponse.json({
        error: 'Tidak ada data valid yang terbaca dari file.',
      }, { status: 400 })


    /* ─── UPSERT (overwrite) ─── */

    const records      = toDbRecords(result, unitIdNum)
    const dedupMap     = new Map<string, any>()
    for (const rec of records) dedupMap.set((rec as any).tanggal, rec)
    const dedupedRecords = Array.from(dedupMap.values())

    const BATCH = 50
    for (let i = 0; i < dedupedRecords.length; i += BATCH) {
      const { error: upsertError } = await supabase
        .from('oee_daily')
        .upsert(dedupedRecords.slice(i, i + BATCH), { onConflict: 'unit_id,tanggal' })

      if (upsertError) {
        console.error('Supabase upsert error (overwrite):', upsertError)
        return NextResponse.json({
          error: `Gagal simpan data: ${upsertError.message}`,
        }, { status: 500 })
      }
    }

    await supabase
      .from('upload_logs')
      .insert({
        unit_id:   unitIdNum,
        file_name: file.name,
        row_count: result.row_count,
        format:    result.format,
        bulan:     result.bulan,
      })

    return NextResponse.json({
      success:   true,
      overwrite: true,

      format:   result.format,
      bulan:    result.bulan,
      rowCount: result.row_count,

      totalEsKeluar: result.total_es_keluar,
      totalRusak:    result.total_rusak,

      agg_availability: result.agg_availability,
      agg_performance:  result.agg_performance,
      agg_quality:      result.agg_quality,
      agg_oee:          result.agg_oee,
    })

  } catch (err: any) {
    console.error('Overwrite error:', err)
    return NextResponse.json({
      error: err.message ?? 'Terjadi kesalahan server.',
    }, { status: 500 })
  }
}