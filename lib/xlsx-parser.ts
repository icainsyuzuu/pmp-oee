import * as XLSX from 'xlsx'
import { clamp01 } from './oee-calculator'

export type PlantFormat = 'balok' | 'kristal'

export interface DailyRowParsed {
  tanggal:          string
  es_keluar:        number
  es_keluar_5kg?:   number
  es_keluar_10kg?:  number
  total_rusak:      number
  bak1?:            number
  bak2?:            number
  bak3?:            number
  rusak_p5k?:       number
  rusak_p10k?:      number
  rusak_kt?:        number
  beban_normal?:    number
  beban_puncak?:    number
  total_beban?:     number
  jumlah_mesin?:    number
  prod_jam?:        number
  kapasitas?:       number
  es_tidak_terjual?:number
  realisasi_order?: number
  selisih_order?:   number
  tenaga_kerja?:    number
  output_tk?:       number
  kwh_wbp?:         number
  kwh_lwbp?:        number
  availability:     number | null
  performance:      number | null
  quality:          number | null
  oee:              number | null
}

export interface ParseResult {
  format:           PlantFormat
  bulan:            string
  rows:             DailyRowParsed[]
  agg_availability: number | null
  agg_performance:  number | null
  agg_quality:      number | null
  agg_oee:          number | null
  total_es_keluar:  number
  total_rusak:      number
  row_count:        number
}

/* ─── HELPERS ─── */
function toNum(v: any): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'string') {
    if (v.startsWith('#') || v.toUpperCase() === 'TOTAL') return null
    v = v.replace(/,/g, '').replace(/\s/g, '')
  }
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}

function toDate(v: any): Date | null {
  if (!v) return null
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    // Ambil komponen UTC untuk hindari timezone shift (server WIB = UTC+7)
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()))
  }
  // Excel serial number — parse lalu pakai Date.UTC
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d))
    return null
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s || s.startsWith('#')) return null
    // ISO: 2026-01-01
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
    // DD/MM/YYYY atau D/M/YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (dmy) {
      const yr = dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3]
      return new Date(Date.UTC(yr, +dmy[2] - 1, +dmy[1]))
    }
    // M/D/YYYY (format US dari XLSX raw:false) e.g. "1/1/2026"
    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (mdy) return new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2]))
  }
  return null
}

function isoDate(d: Date): string {
  // Gunakan UTC methods agar tidak kena timezone shift
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ─── DETECT FORMAT ─── */
function detectFormat(raw: any[][]): PlantFormat {
  const r1 = raw[1] ?? []   // header kolom (row 2)
  const r2 = raw[2] ?? []   // sub-header (row 3)

  const f5 = String(r1[5] ?? '').trim().toLowerCase()
  const f6 = String(r1[6] ?? '').trim().toLowerCase()
  const f7 = String(r1[7] ?? '').trim().toLowerCase()

  // Cek row[1]
  if (f5 === 'tgl') return 'kristal'
  if (f6.includes('5kg') || f6.includes('5 kg')) return 'kristal'
  if (f7.includes('10kg') || f7.includes('10 kg')) return 'kristal'
  if (f5 === 'bulan' && f7.includes('bak')) return 'balok'

  // Pembeda utama ada di row[2] sub-header:
  // Kristal: col G = '5kg', col H = '10kg'
  // Balok  : col H = 'Es Rusak Bak 1' atau sejenisnya
  const s6 = String(r2[6] ?? '').trim().toLowerCase()
  const s7 = String(r2[7] ?? '').trim().toLowerCase()
  const s8 = String(r2[8] ?? '').trim().toLowerCase()

  if (s6 === '5kg' || s6.includes('5 kg')) return 'kristal'
  if (s7 === '10kg' || s7.includes('10 kg')) return 'kristal'
  if (s6 === '5kg' && s7 === '10kg' && s8 === 'total') return 'kristal'

  if (s6.includes('bak') || s7.includes('bak') || s8.includes('bak')) return 'balok'

  // Default: balok
  return 'balok'
}


/* ─── FORMAT A: BALOK ─── */
function parseBalok(raw: any[][]): Omit<ParseResult, 'format'> {
  // Struktur aktual:
  // Row 0 (index 0): header umum
  // Row 1 (index 1): header kolom — F=Bulan, G=EsKeluar, H=Bak1, I=Bak2, J=Bak3, K=TotalRusak,
  //                  L=RealisasiOrder, M=BebanNormal, N=BebanPuncak, O=TotalBeban,
  //                  P=JumlahMesin, Q=ProdJam, S=Kapasitas, T=EsTidakTerjual,
  //                  U=PersenPenjualan, V=Order, W=Selisih, X=TK, Y=OutputTK
  // Row 2 (index 2): sub-header + tanggal pertama di col[5]
  // Row 3+ (index 3+): data harian — tanggal di col[5] (Date object)

  // Ambil label bulan dari row index 2 col[5] (tanggal hari pertama bulan tsb)
  let bulan = ''
  const bulanRaw = raw[2]?.[5]
  const bulanDate = toDate(bulanRaw)
  if (bulanDate) {
    bulan = bulanDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  } else if (bulanRaw) {
    bulan = String(bulanRaw)
  }

  const rows: DailyRowParsed[] = []

  for (let i = 3; i < raw.length; i++) {
    const r = raw[i] ?? []

    // Tanggal ada di col[5] (kolom F)
    const dateVal = r[5]
    if (!dateVal) continue

    // Stop di baris TOTAL atau WARNA
    const dateStr = String(dateVal).toUpperCase()
    if (dateStr.includes('TOTAL') || dateStr.includes('WARNA') || dateStr.includes('KUNING')) break

    const date = toDate(dateVal)
    if (!date) continue

    // Kolom sesuai mapping aktual file
    const esKeluar    = toNum(r[6])  ?? 0          // G: Es Keluar
    const bak1        = toNum(r[7])  ?? 0          // H: Rusak Bak 1
    const bak2        = toNum(r[8])  ?? 0          // I: Rusak Bak 2
    const bak3        = toNum(r[9])  ?? 0          // J: Rusak Bak 3
    const totalRusak  = toNum(r[10]) ?? (bak1 + bak2 + bak3)  // K: Total Rusak
    const realisasi   = toNum(r[11]) ?? 0          // L: Realisasi Order
    const bebanNormal = toNum(r[12]) ?? 0          // M: Beban Normal
    const bebanPuncak = toNum(r[13]) ?? 0          // N: Beban Puncak
    const totalBeban  = toNum(r[14]) ?? (bebanNormal + bebanPuncak)  // O: Total Beban
    const jumlahMesin = toNum(r[15]) ?? 2          // P: Jumlah Mesin
    const prodJam     = toNum(r[16]) ?? 0          // Q: Prod/Jam
    const kapasitas   = toNum(r[18]) ?? 3896       // S: Kapasitas
    const esTidak     = toNum(r[19]) ?? Math.max(0, kapasitas - esKeluar)  // T: Es Tidak Terjual
    const order       = toNum(r[21]) ?? 0          // V: Order
    const selisih     = toNum(r[22]) ?? 0          // W: Selisih Order
    const tk          = toNum(r[23]) ?? 0          // X: Tenaga Kerja
    const outputTK    = toNum(r[24]) ?? 0          // Y: Output TK

    const availability = totalBeban > 0 && jumlahMesin > 0
      ? clamp01(totalBeban / (jumlahMesin * 24)) : null
    const performance  = totalBeban > 0 && prodJam > 0
      ? clamp01(esKeluar / (totalBeban * prodJam)) : null
    const quality      = esKeluar > 0
      ? clamp01((esKeluar - totalRusak) / esKeluar) : null
    const oee          = availability != null && performance != null && quality != null
      ? availability * performance * quality : null

    rows.push({
      tanggal: isoDate(date),
      es_keluar: esKeluar,
      bak1, bak2, bak3,
      total_rusak: totalRusak,
      realisasi_order: realisasi,
      beban_normal: bebanNormal,
      beban_puncak: bebanPuncak,
      total_beban: totalBeban,
      jumlah_mesin: jumlahMesin,
      prod_jam: prodJam,
      kapasitas,
      es_tidak_terjual: esTidak,
      selisih_order: selisih,
      tenaga_kerja: tk,
      output_tk: outputTK,
      availability, performance, quality, oee,
    })
  }

  // Deduplikasi — jika ada tanggal sama dalam file, ambil yang terakhir
  const dedupMap = new Map<string, DailyRowParsed>()
  for (const row of rows) dedupMap.set(row.tanggal, row)
  const dedupedRows = Array.from(dedupMap.values()).sort((a, b) => a.tanggal.localeCompare(b.tanggal))

  // Aggregate OEE — formula sesuai sheet Effectiveness:
  // Availability = (capacity - rasio_beban_normal) / capacity
  //   dimana rasio_beban_normal = total_beban_normal / total_beban
  // Performance  = avg_achiev / capacity
  //   dimana avg_achiev = total_es_keluar / n_hari
  // Quality      = (total_es_keluar - total_rusak) / total_es_keluar
  // capacity disimpan saat parseKonsolSheet menerima rawEffectiveness
  // Untuk sekarang hitung tanpa capacity — akan di-override di parseKonsolSheet
  const n = dedupedRows.length
  let aggAvail: number | null = null, aggPerf: number | null = null
  let aggQual: number | null = null,  aggOEE: number | null = null

  if (n > 0) {
    const totalProd    = dedupedRows.reduce((s, r) => s + r.es_keluar, 0)
    const totalRusak2  = dedupedRows.reduce((s, r) => s + r.total_rusak, 0)
    const totalBeban   = dedupedRows.reduce((s, r) => s + (r.total_beban   ?? 0), 0)
    const totalBN      = dedupedRows.reduce((s, r) => s + (r.beban_normal  ?? 0), 0)

    // Quality selalu bisa dihitung tanpa capacity
    if (totalProd > 0) {
      aggQual = clamp01((totalProd - totalRusak2) / totalProd)
    }
    // Availability & Performance butuh capacity — akan di-override dari Effectiveness sheet
    // Simpan nilai sementara untuk fallback jika sheet Effectiveness tidak ada
    if (totalBeban > 0 && totalProd > 0) {
      const rasioBeban = totalBeban > 0 ? totalBN / totalBeban : 0
      // Fallback: gunakan kapasitas kolom S (per baris pertama)
      const kapFallback = dedupedRows[0]?.kapasitas ?? 3896
      aggAvail = clamp01((kapFallback - rasioBeban) / kapFallback)
      const avgAchiev = totalProd / n
      aggPerf  = clamp01(avgAchiev / kapFallback)
      aggOEE   = aggAvail * aggPerf * (aggQual ?? 1)
    }
  }

  return {
    bulan, rows: dedupedRows,
    agg_availability: aggAvail, agg_performance: aggPerf,
    agg_quality: aggQual, agg_oee: aggOEE,
    total_es_keluar: dedupedRows.reduce((s, r) => s + r.es_keluar, 0),
    total_rusak:     dedupedRows.reduce((s, r) => s + r.total_rusak, 0),
    row_count:       dedupedRows.length,
  }
}

/* ─── FORMAT B: KRISTAL ─── */
function parseKristal(raw: any[][]): Omit<ParseResult, 'format'> {
  // Struktur aktual Konsol Kristal:
  // Row 0 (index 0): header umum
  // Row 1 (index 1): header kolom — F=Bulan, G=Es Keluar, J=Retur, M=Realisasi, P=Mesin, X=Listrik
  // Row 2 (index 2): sub-header + F=tanggal bulan, G=5kg, H=10kg, I=Total, J=5kg retur, K=10kg retur, L=Total retur
  //                  M=5kg realisasi, N=10kg realisasi, O=Total real, P=Prod/Jam, Q=Kapasitas, R=EsTidakTerjual
  //                  X=kWh WBP, Y=kWh LWBP
  // Row 3+ (index 3+): data harian — F=tanggal, G=es5kg, H=es10kg, I=total_es, J=retur5, K=retur10, L=total_retur
  //                    M=real5, N=real10, O=total_real, P=prod_jam, Q=kapasitas, X=kwh_wbp, Y=kwh_lwbp
  // BARIS TOTAL: F='TOTAL'

  let bulan = ''
  const bulanRaw = raw[2]?.[5]   // sub-header row, col F = tanggal bulan
  const bulanDate = toDate(bulanRaw)
  if (bulanDate) {
    bulan = bulanDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  } else if (raw[1]?.[5]) {
    bulan = String(raw[1][5])
  }

  const rows: DailyRowParsed[] = []
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i] ?? []

    // Stop di baris TOTAL atau WARNA
    const f5 = String(r[5] ?? '').toUpperCase()
    if (f5.includes('TOTAL') || f5.includes('WARNA')) break

    const date = r[5] instanceof Date ? r[5] : toDate(r[5])
    if (!date) continue

    const es5kg      = toNum(r[6])  ?? 0   // G: Es Keluar 5kg
    const es10kg     = toNum(r[7])  ?? 0   // H: Es Keluar 10kg
    const esKeluar   = toNum(r[8])  ?? (es5kg + es10kg)  // I: Total Es Keluar
    const retur5     = toNum(r[9])  ?? 0   // J: Retur 5kg
    const retur10    = toNum(r[10]) ?? 0   // K: Retur 10kg
    const totalRetur = toNum(r[11]) ?? (retur5 + retur10) // L: Total Retur
    const real5      = toNum(r[12]) ?? 0   // M: Realisasi 5kg
    const real10     = toNum(r[13]) ?? 0   // N: Realisasi 10kg
    const totalReal  = toNum(r[14]) ?? (real5 + real10)  // O: Total Realisasi
    const prodJam    = toNum(r[15]) ?? 0   // P: Produktivitas Mesin/Jam (kg)
    const kapasitas  = toNum(r[16]) ?? 0   // Q: Kapasitas Produksi
    const esTidak    = toNum(r[17]) ?? 0   // R: Es Tidak Terjual
    const order5     = toNum(r[19]) ?? 0   // T: Order 5kg
    const order10    = toNum(r[20]) ?? 0   // U: Order 10kg
    const totalOrder = toNum(r[21]) ?? (order5 + order10) // V: Total Order
    const selisih    = toNum(r[22]) ?? 0   // W: Selisih Order
    const kwhWBP     = toNum(r[23]) ?? 0   // X: kWh WBP
    const kwhLWBP    = toNum(r[24]) ?? 0   // Y: kWh LWBP

    rows.push({
      tanggal:          isoDate(date),
      es_keluar:        esKeluar,
      es_keluar_5kg:    es5kg,
      es_keluar_10kg:   es10kg,
      total_rusak:      totalRetur,
      rusak_p5k:        retur5,
      rusak_p10k:       retur10,
      rusak_kt:         0,
      realisasi_order:  totalReal,
      selisih_order:    selisih,
      prod_jam:         prodJam,
      kapasitas:        kapasitas,
      es_tidak_terjual: esTidak,
      kwh_wbp:          kwhWBP,
      kwh_lwbp:         kwhLWBP,
      availability: null, performance: null, quality: null, oee: null,
    })
  }

  // Deduplikasi
  const dedupMap = new Map<string, DailyRowParsed>()
  for (const row of rows) dedupMap.set(row.tanggal, row)
  const dedupedRows = Array.from(dedupMap.values()).sort((a, b) => a.tanggal.localeCompare(b.tanggal))

  // Aggregate OEE — akan di-override dari Effectiveness sheet di parseKonsolSheet
  // Hitung fallback dari data Konsol
  const n          = dedupedRows.length
  let aggAvail: number | null = null
  let aggPerf:  number | null = null
  let aggQual:  number | null = null
  let aggOEE:   number | null = null

  if (n > 0) {
    const totalEs    = dedupedRows.reduce((s, r) => s + r.es_keluar,   0)
    const totalRusak = dedupedRows.reduce((s, r) => s + r.total_rusak, 0)
    if (totalEs > 0) aggQual = clamp01((totalEs - totalRusak) / totalEs)
    // Avail & Perf di-override dari Effectiveness — default null jika tidak ada
  }

  return {
    bulan, rows: dedupedRows,
    agg_availability: aggAvail, agg_performance: aggPerf,
    agg_quality: aggQual, agg_oee: aggOEE,
    total_es_keluar: dedupedRows.reduce((s, r) => s + r.es_keluar,   0),
    total_rusak:     dedupedRows.reduce((s, r) => s + r.total_rusak, 0),
    row_count:       dedupedRows.length,
  }
}

/* ─── BACA SHEET EFFECTIVENESS ─── */
function parseEffectiveness(rawEff: any[][]): {
  availability: number | null, performance: number | null,
  quality: number | null, oee: number | null,
  capacity: number | null, k23: number | null
} {
  // raw:false → nilai bisa berupa string angka, pakai toNum() untuk konversi
  // G10=Availability, K10=Performance, O10=Quality, O23=OEE, G23=Capacity, K23=RasioBN/nilai khusus
  const avail    = toNum(rawEff[9]?.[6])    // G10
  const perf     = toNum(rawEff[9]?.[10])   // K10 (bisa #REF! → null)
  const qual     = toNum(rawEff[9]?.[14])   // O10 (bisa #REF! → null)
  const oee      = toNum(rawEff[22]?.[14])  // O23 (bisa #REF! → null)
  const capacity = toNum(rawEff[22]?.[6])   // G23
  const k23      = toNum(rawEff[22]?.[10])  // K23 — Balok=rasio_bn, Kristal=nilai langsung
  console.log(`[parseEffectiveness] avail=${avail} perf=${perf} qual=${qual} oee=${oee} capacity=${capacity} k23=${k23}`)
  return { availability: avail, performance: perf, quality: qual, oee, capacity, k23 }
}

/* ─── MAIN EXPORT ─── */
export function parseKonsolSheet(raw: any[][], rawEffectiveness?: any[][]): ParseResult {
  if (!raw || raw.length < 4) throw new Error("Sheet 'Konsol' kosong atau terlalu pendek.")
  const format = detectFormat(raw)

  const result = format === 'kristal' ? parseKristal(raw) : parseBalok(raw)

  // Override agg_ dari sheet Effectiveness (berlaku untuk Balok & Kristal)
  if (rawEffectiveness && rawEffectiveness.length >= 23) {
    const eff = parseEffectiveness(rawEffectiveness)

    if (eff.capacity && eff.capacity > 0 && result.rows.length > 0) {
      const rows       = result.rows
      const n          = rows.length
      const totalProd  = rows.reduce((s, r) => s + r.es_keluar,   0)
      const totalRusak = rows.reduce((s, r) => s + r.total_rusak, 0)

      // Performance = avg_achiev / capacity (sama untuk Balok & Kristal)
      const avgAchiev = n > 0 ? totalProd / n : 0
      const aggPerf   = clamp01(avgAchiev / eff.capacity)

      // Quality = (total_es - total_rusak) / total_es (sama untuk Balok & Kristal)
      const aggQual = totalProd > 0 ? clamp01((totalProd - totalRusak) / totalProd) : null

      let aggAvail: number | null = null

      if (format === 'balok') {
        // Balok: Availability = (capacity - rasio_beban_normal) / capacity
        // rasio_beban_normal = total_beban_normal / total_beban (dihitung dari Konsol)
        const totalBeban = rows.reduce((s, r) => s + (r.total_beban  ?? 0), 0)
        const totalBN    = rows.reduce((s, r) => s + (r.beban_normal ?? 0), 0)
        const rasioBeban = totalBeban > 0 ? totalBN / totalBeban : 0
        aggAvail = clamp01((eff.capacity - rasioBeban) / eff.capacity)
      } else {
        // Kristal: Availability = (capacity - K23) / capacity
        // K23 adalah nilai rasio yang sudah dihitung di sheet Effectiveness
        if (eff.k23 != null && eff.capacity > 0) {
          aggAvail = clamp01((eff.capacity - eff.k23) / eff.capacity)
        } else if (eff.availability != null && eff.availability > 0 && eff.availability <= 1) {
          // Fallback: ambil G10 langsung jika K23 tidak valid
          aggAvail = eff.availability
        }
      }

      const aggOEE = aggAvail != null && aggQual != null ? aggAvail * aggPerf * aggQual : null

      result.agg_availability = aggAvail
      result.agg_performance  = aggPerf
      result.agg_quality      = aggQual
      result.agg_oee          = aggOEE

      console.log(`[OEE Calc] format=${format} avail=${aggAvail?.toFixed(4)} perf=${aggPerf?.toFixed(4)} qual=${aggQual?.toFixed(4)} oee=${aggOEE?.toFixed(4)}`)
    } else {
      // Fallback: pakai nilai langsung dari sel Effectiveness
      const valid = (v: number | null) => v != null && v >= 0 && v <= 1
      if (valid(eff.availability)) result.agg_availability = eff.availability
      if (valid(eff.performance))  result.agg_performance  = eff.performance
      if (valid(eff.quality))      result.agg_quality      = eff.quality
      if (valid(eff.oee))          result.agg_oee          = eff.oee
    }
  }

  return { format, ...result }
}

export function toDbRecords(result: ParseResult, unitId: number): object[] {
  return result.rows.map(row => ({
    unit_id: unitId,
    tanggal: row.tanggal,
    es_keluar: row.es_keluar,
    es_keluar_5kg:    row.es_keluar_5kg    ?? null,
    es_keluar_10kg:   row.es_keluar_10kg   ?? null,
    bak1:             row.bak1             ?? null,
    bak2:             row.bak2             ?? null,
    bak3:             row.bak3             ?? null,
    total_rusak:      row.total_rusak,
    rusak_p5k:        row.rusak_p5k        ?? null,
    rusak_p10k:       row.rusak_p10k       ?? null,
    rusak_kt:         row.rusak_kt         ?? null,
    beban_normal:     row.beban_normal     ?? null,
    beban_puncak:     row.beban_puncak     ?? null,
    total_beban:      row.total_beban      ?? null,
    jumlah_mesin:     row.jumlah_mesin     ?? null,
    prod_jam:         row.prod_jam         ?? null,
    kapasitas:        row.kapasitas        ?? null,
    es_tidak_terjual: row.es_tidak_terjual ?? null,
    realisasi_order:  row.realisasi_order  ?? null,
    selisih_order:    row.selisih_order    ?? null,
    tenaga_kerja:     row.tenaga_kerja     ?? null,
    output_tk:        row.output_tk        ?? null,
    kwh_wbp:          row.kwh_wbp          ?? null,
    kwh_lwbp:         row.kwh_lwbp         ?? null,
    availability:     row.availability,
    performance:      row.performance,
    quality:          row.quality,
    oee:              row.oee,
    agg_availability: result.agg_availability,
    agg_performance:  result.agg_performance,
    agg_quality:      result.agg_quality,
    agg_oee:          result.agg_oee,
  }))
}