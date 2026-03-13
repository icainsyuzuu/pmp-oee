import * as XLSX from "xlsx";
import { clamp01 } from "./oee-calculator";

// ─── TIPE ─────────────────────────────────────────────────────────────────────
export type PlantFormat = "balok" | "pakis" | "tuban" | "kristal";

export interface DailyRowParsed {
  tanggal: string;
  es_keluar: number;
  es_keluar_5kg?: number;
  es_keluar_10kg?: number;
  total_rusak: number;
  bak1?: number;
  bak2?: number;
  bak3?: number;
  bak3bb?: number;
  bak3bk?: number;
  bak4?: number;
  bak5?: number;
  rusak_p5k?: number;
  rusak_p10k?: number;
  rusak_kt?: number;
  beban_normal?: number;
  beban_puncak?: number;
  total_beban?: number;
  jumlah_mesin?: number;
  prod_jam?: number;
  kapasitas?: number;
  es_tidak_terjual?: number;
  realisasi_order?: number;
  selisih_order?: number;
  tenaga_kerja?: number;
  output_tk?: number;
  kwh_wbp?: number;
  kwh_lwbp?: number;
  kwh_total?: number;
  downtime_jam?: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
}

export interface ParseResult {
  format: PlantFormat;
  bulan: string;
  rows: DailyRowParsed[];
  agg_availability: number | null;
  agg_performance: number | null;
  agg_quality: number | null;
  agg_oee: number | null;
  total_es_keluar: number;
  total_rusak: number;
  row_count: number;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    if (v.startsWith("#") || v.toUpperCase() === "TOTAL") return null;
    v = v.replace(/,/g, "").replace(/\s/g, "");
  }
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function toDate(v: any): Date | null {
  if (v == null || v === "") return null;

  // ── instanceof Date (XLSX.js cellDates:true menghasilkan Date object) ──
  // PENTING: Selalu gunakan LOCAL time (getFullYear/Month/Date), bukan getUTC*.
  // Di browser UTC+7: Excel "2026-01-01 00:00 WIB" → Date internal = "2025-12-31T17:00Z"
  // getUTCDate() = 31 (SALAH) | getDate() = 1 (BENAR karena local = WIB)
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }

  // ── Angka serial Excel (sheet_to_json tanpa cellDates) ──
  if (typeof v === "number") {
    if (v < 1000) return null;
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d);
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s || s.startsWith("#")) return null;

    // ISO timestamp dengan T → misal "2025-12-31T17:00:00.000Z" (UTC string dari XLSX.js)
    // Di UTC+7 string ini = 2026-01-01 → pakai getFullYear/Month/Date (local), BUKAN slice(0,10)
    if (s.includes("T")) {
      const d = new Date(s);
      if (!isNaN(d.getTime()))
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return null;
    }

    // YYYY-MM-DD tanpa waktu → aman dibaca sebagai local date langsung
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1]);

    const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);

    const dmy_str = s.match(
      /^(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{2,4})$/i,
    );
    if (dmy_str) {
      const monthMapID: Record<string, number> = {
        januari: 1,
        februari: 2,
        maret: 3,
        april: 4,
        mei: 5,
        juni: 6,
        juli: 7,
        agustus: 8,
        september: 9,
        oktober: 10,
        november: 11,
        desember: 12,
      };
      const monthMapEN: Record<string, number> = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12,
      };
      const mo =
        monthMapID[dmy_str[2].toLowerCase()] ??
        monthMapEN[dmy_str[2].toLowerCase()];
      if (mo) {
        let yr = +dmy_str[3];
        if (yr < 100) yr += 2000;
        return new Date(yr, mo - 1, +dmy_str[1]);
      }
    }
  }

  return null;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ─── DETECT FORMAT ─────────────────────────────────────────────────────────────
function detectFormat(raw: any[][]): PlantFormat {
  const r1 = raw[1] ?? [];
  const r2 = raw[2] ?? [];

  const f5 = String(r1[5] ?? "")
    .trim()
    .toLowerCase();
  const f6 = String(r1[6] ?? "")
    .trim()
    .toLowerCase();
  const f7 = String(r1[7] ?? "")
    .trim()
    .toLowerCase();
  const f8 = String(r1[8] ?? "")
    .trim()
    .toLowerCase();
  const f9 = String(r1[9] ?? "")
    .trim()
    .toLowerCase();
  const f10 = String(r1[10] ?? "")
    .trim()
    .toLowerCase();
  const f11 = String(r1[11] ?? "")
    .trim()
    .toLowerCase();
  const f12 = String(r1[12] ?? "")
    .trim()
    .toLowerCase();

  if (f5 === "tgl") return "kristal";
  if (f6.includes("5kg") || f6.includes("5 kg")) return "kristal";
  if (f7.includes("10kg") || f7.includes("10 kg")) return "kristal";
  if (
    String(r2[6] ?? "")
      .trim()
      .toLowerCase()
      .includes("5kg")
  )
    return "kristal";
  if (
    String(r2[7] ?? "")
      .trim()
      .toLowerCase()
      .includes("10kg")
  )
    return "kristal";

  if (
    f10.includes("bak 4") ||
    f10.includes("bak 5") ||
    f11.includes("bak 4") ||
    f11.includes("bak 5") ||
    f12.includes("bak 4") ||
    f12.includes("bak 5")
  )
    return "tuban";

  if (
    f7.includes("bak 1") &&
    f8.includes("bak 2") &&
    f9.includes("total") &&
    !f9.includes("bak")
  ) {
    return "pakis";
  }

  return "balok";
}

// ─── KALKULASI OEE HARIAN (Balok & Tuban) ────────────────────────────────────
function calcDailyBalok(
  esKeluar: number,
  totalRusak: number,
  totalBeban: number,
  jumlahMesin: number,
  prodJam: number,
): {
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
} {
  const availability =
    totalBeban > 0 && jumlahMesin > 0
      ? clamp01(totalBeban / (jumlahMesin * 24))
      : null;
  const performance =
    totalBeban > 0 && prodJam > 0
      ? clamp01(esKeluar / (totalBeban * prodJam))
      : null;
  const quality =
    esKeluar > 0 ? clamp01((esKeluar - totalRusak) / esKeluar) : null;
  const oee =
    availability != null && performance != null && quality != null
      ? availability * performance * quality
      : null;
  return { availability, performance, quality, oee };
}

// ─── KALKULASI OEE HARIAN (Pakis) ────────────────────────────────────────────
const PAKIS_PPT_JAM = 23;
const KAPASITAS_PAKIS_OEE_DEFAULT = 3680;

function calcDailyPakis(
  esKeluar: number,
  totalRusak: number,
  totalBeban: number,
  jumlahMesin: number,
  kapasitas: number,
): {
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
} {
  const availability =
    totalBeban > 0 && jumlahMesin > 0
      ? clamp01(totalBeban / (jumlahMesin * PAKIS_PPT_JAM))
      : null;
  const performance = kapasitas > 0 ? clamp01(esKeluar / kapasitas) : null;
  const quality =
    esKeluar > 0 ? clamp01((esKeluar - totalRusak) / esKeluar) : null;
  const oee =
    availability != null && performance != null && quality != null
      ? availability * performance * quality
      : null;
  return { availability, performance, quality, oee };
}

// ─── FORMAT A: BALOK ──────────────────────────────────────────────────────────
function parseBalok(raw: any[][]): Omit<ParseResult, "format"> {
  const bulanDate = toDate(raw[2]?.[5]);
  const bulan = bulanDate
    ? bulanDate.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : String(raw[2]?.[5] ?? "");

  const rows: DailyRowParsed[] = [];
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const dv = r[5];
    if (!dv) continue;
    if (
      String(dv)
        .toUpperCase()
        .match(/TOTAL|WARNA|KUNING/)
    )
      break;
    const date = toDate(dv);
    if (!date) continue;

    const esKeluar = toNum(r[6]) ?? 0;
    const bak1 = toNum(r[7]) ?? 0;
    const bak2 = toNum(r[8]) ?? 0;
    const bak3 = toNum(r[9]) ?? 0;
    const totalRusak = toNum(r[10]) ?? bak1 + bak2 + bak3;
    const realisasi = toNum(r[11]) ?? 0;
    const bebanNormal = toNum(r[12]) ?? 0;
    const bebanPuncak = toNum(r[13]) ?? 0;
    const totalBeban = toNum(r[14]) ?? bebanNormal + bebanPuncak;
    const jumlahMesin = toNum(r[15]) ?? 2;
    const prodJam = toNum(r[16]) ?? 0;
    const kapasitas = toNum(r[18]) ?? 3896;
    const esTidak = toNum(r[19]) ?? Math.max(0, kapasitas - esKeluar);
    const selisih = toNum(r[22]) ?? 0;
    const tk = toNum(r[23]) ?? 0;
    const outputTK = toNum(r[24]) ?? 0;

    if (esKeluar === 0 && totalBeban === 0 && jumlahMesin === 0) continue;

    rows.push({
      tanggal: isoDate(date),
      es_keluar: esKeluar,
      bak1,
      bak2,
      bak3,
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
      ...calcDailyBalok(esKeluar, totalRusak, totalBeban, jumlahMesin, prodJam),
    });
  }

  const dedup = deduplicateRows(rows);
  return {
    bulan,
    rows: dedup,
    agg_availability: null,
    agg_performance: null,
    agg_quality: null,
    agg_oee: null,
    total_es_keluar: dedup.reduce((s, r) => s + r.es_keluar, 0),
    total_rusak: dedup.reduce((s, r) => s + r.total_rusak, 0),
    row_count: dedup.length,
  };
}

// ─── FORMAT B: PAKIS ──────────────────────────────────────────────────────────
function parsePakis(
  raw: any[][],
  kapasitasOEE?: number,
): Omit<ParseResult, "format"> {
  const bulanDate = toDate(raw[2]?.[5]);
  const bulan = bulanDate
    ? bulanDate.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : String(raw[2]?.[5] ?? "");

  const kapOEE =
    kapasitasOEE && kapasitasOEE > 0
      ? kapasitasOEE
      : KAPASITAS_PAKIS_OEE_DEFAULT;

  const rows: DailyRowParsed[] = [];
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const dv = r[5];
    if (!dv) continue;
    if (
      String(dv)
        .toUpperCase()
        .match(/TOTAL|WARNA|KUNING/)
    )
      break;
    const date = toDate(dv);
    if (!date) continue;

    const esKeluar = toNum(r[6]) ?? 0;
    const bak1 = toNum(r[7]) ?? 0;
    const bak2 = toNum(r[8]) ?? 0;
    const totalRusak = toNum(r[9]) ?? bak1 + bak2;
    const realisasi = toNum(r[10]) ?? 0;
    const bebanNormal = toNum(r[11]) ?? 0;
    const bebanPuncak = toNum(r[12]) ?? 0;
    const totalBeban = toNum(r[13]) ?? bebanNormal + bebanPuncak;
    const jumlahMesin = toNum(r[14]) ?? 2;
    const prodJam = toNum(r[15]) ?? 0;
    const kapasitas = toNum(r[17]) ?? 4806;
    const esTidak = toNum(r[18]) ?? Math.max(0, kapasitas - esKeluar);
    const selisih = toNum(r[21]) ?? 0;
    const tk = toNum(r[22]) ?? 0;
    const outputTK = toNum(r[23]) ?? 0;

    if (esKeluar === 0 && totalBeban === 0 && jumlahMesin === 0) continue;

    rows.push({
      tanggal: isoDate(date),
      es_keluar: esKeluar,
      bak1,
      bak2,
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
      ...calcDailyPakis(esKeluar, totalRusak, totalBeban, jumlahMesin, kapOEE),
    });
  }

  const dedup = deduplicateRows(rows);
  return {
    bulan,
    rows: dedup,
    agg_availability: null,
    agg_performance: null,
    agg_quality: null,
    agg_oee: null,
    total_es_keluar: dedup.reduce((s, r) => s + r.es_keluar, 0),
    total_rusak: dedup.reduce((s, r) => s + r.total_rusak, 0),
    row_count: dedup.length,
  };
}

// ─── FORMAT C: TUBAN ──────────────────────────────────────────────────────────
//
// MAPPING KOLOM (TERVERIFIKASI dari 01_Jan_26_OEE_PMP_PLANT_PMP_TUBAN_.xlsx):
//
//   [0]  kosong
//   [1]  TGL angka (1-28 saja; baris 29-31 KOSONG di kolom ini!)
//   [2]  Penjualan
//   [3]  Kekurangan Target
//   [4]  Kekurangan Per Hari  ("#REF!")
//   [5]  TANGGAL (datetime)   ← dateCol = 5, SELALU ADA untuk semua 31 baris
//   [6]  Es Keluar
//   [7]  Es Rusak Bak 1
//   [8]  Es Rusak Bak 2
//   [9]  Es Rusak Bak 3 BB
//   [10] Es Rusak Bak 3 BK
//   [11] Es Rusak Bak 4
//   [12] Es Rusak Bak 5
//   [13] Total Es Rusak
//   [14] % Kerusakan          ← skip
//   [15] Realisasi Order
//   [16] Beban Normal
//   [17] Beban Puncak
//   [18] Total Beban
//   [19] Jumlah Mesin
//   [20] Prod/Jam (bersih)
//   [21] Prod/Jam KOTOR        ← skip
//   [22] Kapasitas Produksi
//   [23] Es Tidak Terjual
//   [24] % Penjualan           ← skip
//   [25] Order                 ← skip
//   [26] Selisih Order
//   [27] Tenaga Kerja
//   [28] Output Tenaga Kerja
//
// BUG LAMA: Kode sebelumnya memakai offset dinamis (dateCol=4 atau 5) dan
//   membaca data via r[c(5)]..r[c(28)] dengan c=(base)=>base+offset.
//   Akibatnya ketika dateCol=4, semua kolom data bergeser -1 sehingga
//   Bak1 terbaca dari kolom Bak2, dsb. Dan karena kolom TGL angka [1]
//   kosong untuk baris 29-31, baris-baris itu terlewat.
//
// FIX: dateCol di-hardcode ke 5 (terverifikasi), semua indeks kolom data
//   langsung (tanpa offset). Baris 29-31 kini terbaca karena kondisi
//   skip hanya memeriksa kolom [5] (TANGGAL), bukan kolom [1] (TGL angka).
//
function parseTuban(raw: any[][]): Omit<ParseResult, "format"> {
  const dateCol = 5; // fixed, verified from actual file

  console.log(`[Tuban] dateCol=${dateCol} (fixed)`);

  let bulan = "";
  for (let i = 3; i < Math.min(raw.length, 40); i++) {
    const d = toDate(raw[i]?.[dateCol]);
    if (d) {
      bulan = d.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      });
      break;
    }
  }

  const rows: DailyRowParsed[] = [];
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i] ?? [];

    const dv = r[dateCol];
    if (dv == null) continue;
    const dvStr = String(dv).toUpperCase().trim();
    if (dvStr.match(/TOTAL|WARNA|KUNING/)) break;
    const date = toDate(dv);
    if (!date) continue;

    const esKeluar = toNum(r[6]) ?? 0;
    const bak1 = toNum(r[7]) ?? 0;
    const bak2 = toNum(r[8]) ?? 0;
    const bak3bb = toNum(r[9]) ?? 0;
    const bak3bk = toNum(r[10]) ?? 0;
    const bak3 = bak3bb + bak3bk;
    const bak4 = toNum(r[11]) ?? 0;
    const bak5 = toNum(r[12]) ?? 0;
    const totalRusak = toNum(r[13]) ?? bak1 + bak2 + bak3 + bak4 + bak5;
    // r[14] = % Kerusakan → skip
    const realisasi = toNum(r[15]) ?? 0;
    const bebanNormal = toNum(r[16]) ?? 0;
    const bebanPuncak = toNum(r[17]) ?? 0;
    const totalBeban = toNum(r[18]) ?? bebanNormal + bebanPuncak;
    const jumlahMesin = toNum(r[19]) ?? 3;
    const prodJam = toNum(r[20]) ?? 0;
    // r[21] = Prod/Jam KOTOR → skip
    const kapasitas = toNum(r[22]) ?? 12426;
    const esTidak = toNum(r[23]) ?? Math.max(0, kapasitas - esKeluar);
    // r[24] = % Penjualan → skip
    // r[25] = Order       → skip
    const selisih = toNum(r[26]) ?? 0;
    const tk = toNum(r[27]) ?? 0;
    const outputTK = toNum(r[28]) ?? 0;

    if (esKeluar === 0 && totalBeban === 0) continue;

    rows.push({
      tanggal: isoDate(date),
      es_keluar: esKeluar,
      bak1,
      bak2,
      bak3,
      bak3bb,
      bak3bk,
      bak4,
      bak5,
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
      ...calcDailyBalok(esKeluar, totalRusak, totalBeban, jumlahMesin, prodJam),
    });
  }

  const dedup = deduplicateRows(rows);
  return {
    bulan,
    rows: dedup,
    agg_availability: null,
    agg_performance: null,
    agg_quality: null,
    agg_oee: null,
    total_es_keluar: dedup.reduce((s, r) => s + r.es_keluar, 0),
    total_rusak: dedup.reduce((s, r) => s + r.total_rusak, 0),
    row_count: dedup.length,
  };
}

// ─── FORMAT D: KRISTAL LAMA ────────────────────────────────────────────────
function parseKristal(raw: any[][]): Omit<ParseResult, "format"> {
  const bulanDate = toDate(raw[2]?.[5]);
  const bulan = bulanDate
    ? bulanDate.toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : String(raw[1]?.[5] ?? "");

  const rows: DailyRowParsed[] = [];
  for (let i = 3; i < raw.length; i++) {
    const r = raw[i] ?? [];
    if (
      String(r[5] ?? "")
        .toUpperCase()
        .match(/TOTAL|WARNA/)
    )
      break;
    const date = r[5] instanceof Date ? r[5] : toDate(r[5]);
    if (!date) continue;

    const es5kg = toNum(r[6]) ?? 0;
    const es10kg = toNum(r[7]) ?? 0;
    const esKeluar = toNum(r[8]) ?? es5kg + es10kg;
    const retur5 = toNum(r[9]) ?? 0;
    const retur10 = toNum(r[10]) ?? 0;
    const totalRetur = toNum(r[11]) ?? retur5 + retur10;
    const real5 = toNum(r[12]) ?? 0;
    const real10 = toNum(r[13]) ?? 0;
    const totalReal = toNum(r[14]) ?? real5 + real10;
    const prodJam = toNum(r[15]) ?? 0;
    const kapasitas = toNum(r[16]) ?? 0;
    const esTidak = toNum(r[17]) ?? 0;
    const selisih = toNum(r[22]) ?? 0;
    const kwhWBP = toNum(r[23]) ?? 0;
    const kwhLWBP = toNum(r[24]) ?? 0;

    rows.push({
      tanggal: isoDate(date),
      es_keluar: esKeluar,
      es_keluar_5kg: es5kg,
      es_keluar_10kg: es10kg,
      total_rusak: totalRetur,
      rusak_p5k: retur5,
      rusak_p10k: retur10,
      rusak_kt: 0,
      realisasi_order: totalReal,
      selisih_order: selisih,
      prod_jam: prodJam,
      kapasitas,
      es_tidak_terjual: esTidak,
      kwh_wbp: kwhWBP,
      kwh_lwbp: kwhLWBP,
      availability: null,
      performance: null,
      quality: null,
      oee: null,
    });
  }

  const dedup = deduplicateRows(rows);
  const totalEs = dedup.reduce((s, r) => s + r.es_keluar, 0);
  const totalRsak = dedup.reduce((s, r) => s + r.total_rusak, 0);
  const aggQual = totalEs > 0 ? clamp01((totalEs - totalRsak) / totalEs) : null;
  return {
    bulan,
    rows: dedup,
    agg_availability: null,
    agg_performance: null,
    agg_quality: aggQual,
    agg_oee: null,
    total_es_keluar: totalEs,
    total_rusak: totalRsak,
    row_count: dedup.length,
  };
}

// ─── FORMAT KRISTAL BARU ──────────────────────────────────────────────────────
export function parseKristalNew(
  rawData: any[][],
  rawRingkasan?: any[][],
): Omit<ParseResult, "format"> {
  let bulan = "";
  const judul = String(rawData[0]?.[0] ?? "");
  const m = judul.match(
    /(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i,
  );
  if (m)
    bulan =
      m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + " " + m[2];

  const rows: DailyRowParsed[] = [];
  for (let i = 4; i < rawData.length; i++) {
    const r = rawData[i] ?? [];
    const date = toDate(r[0]);
    if (!date) continue;

    const es5kg = toNum(r[1]) ?? 0;
    const es10kg = toNum(r[2]) ?? 0;
    const totalEs = toNum(r[3]) ?? es5kg * 0.5 + es10kg;
    const retur5 = toNum(r[4]) ?? 0;
    const retur10 = toNum(r[5]) ?? 0;
    const totalRetur = toNum(r[6]) ?? retur5 * 0.5 + retur10;
    const totalReal = toNum(r[9]) ?? 0;
    const prodJam = toNum(r[10]) ?? 0;
    const kapasitas = toNum(r[11]) ?? 0;
    const esTidak = toNum(r[12]) ?? 0;
    const selisih = toNum(r[17]) ?? 0;
    const kwhWBP = toNum(r[18]) ?? 0;
    const kwhLWBP = toNum(r[19]) ?? 0;
    const kwhTotal = toNum(r[20]) ?? kwhWBP + kwhLWBP;
    const downtime = toNum(r[21]) ?? 0;
    const avail = toNum(r[22]);
    const perf = toNum(r[23]);
    const qual = toNum(r[24]);
    const oee = toNum(r[25]);

    rows.push({
      tanggal: isoDate(date),
      es_keluar: totalEs,
      es_keluar_5kg: es5kg,
      es_keluar_10kg: es10kg,
      total_rusak: totalRetur,
      rusak_p5k: retur5,
      rusak_p10k: retur10,
      rusak_kt: 0,
      realisasi_order: totalReal,
      selisih_order: selisih,
      prod_jam: prodJam,
      kapasitas,
      es_tidak_terjual: esTidak,
      kwh_wbp: kwhWBP,
      kwh_lwbp: kwhLWBP,
      kwh_total: kwhTotal,
      downtime_jam: downtime,
      availability: avail,
      performance: perf,
      quality: qual,
      oee,
    });
  }

  const dedup = deduplicateRows(rows);
  let aggAvail: number | null = null,
    aggPerf: number | null = null,
    aggQual: number | null = null,
    aggOEE: number | null = null;
  if (rawRingkasan) {
    aggAvail = toNum(rawRingkasan[13]?.[1]);
    aggPerf = toNum(rawRingkasan[16]?.[1]);
    aggQual = toNum(rawRingkasan[19]?.[1]);
    aggOEE = toNum(rawRingkasan[22]?.[1]);
  }

  return {
    bulan,
    rows: dedup,
    agg_availability: aggAvail,
    agg_performance: aggPerf,
    agg_quality: aggQual,
    agg_oee: aggOEE,
    total_es_keluar: dedup.reduce((s, r) => s + r.es_keluar, 0),
    total_rusak: dedup.reduce((s, r) => s + r.total_rusak, 0),
    row_count: dedup.length,
  };
}

// ─── BACA SHEET OEE / EFFECTIVENESS ──────────────────────────────────────────
function parseOEESheet(rawEff: any[][]): {
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
  capacity: number | null;
  rasio_bn: number | null;
} {
  let availCol = -1,
    perfCol = -1,
    qualCol = -1;

  for (let ri = 0; ri < Math.min(rawEff.length, 10); ri++) {
    const r = rawEff[ri] ?? [];
    for (let ci = 0; ci < r.length; ci++) {
      const v = String(r[ci] ?? "")
        .toLowerCase()
        .trim();
      if (v.startsWith("avail")) {
        availCol = ci;
        for (let cj = ci + 1; cj < r.length; cj++) {
          const vj = String(r[cj] ?? "")
            .toLowerCase()
            .trim();
          if (vj.startsWith("perf") && perfCol === -1) perfCol = cj;
          if (vj.startsWith("qual") && qualCol === -1) qualCol = cj;
        }
        break;
      }
    }
    if (availCol !== -1) break;
  }

  if (availCol === -1) availCol = 6;
  if (perfCol === -1) perfCol = availCol + 4;
  if (qualCol === -1) qualCol = availCol + 8;

  let valRow = -1;
  for (let ri = 4; ri < Math.min(rawEff.length, 16); ri++) {
    const v = toNum(rawEff[ri]?.[availCol]);
    if (v !== null && v >= 0 && v <= 1) {
      valRow = ri;
      break;
    }
  }
  if (valRow === -1) valRow = 9;

  let sumRow = -1;
  for (let ri = valRow + 4; ri < Math.min(rawEff.length, 30); ri++) {
    const v = toNum(rawEff[ri]?.[availCol]);
    if (v !== null && v > 1) {
      sumRow = ri;
      break;
    }
  }
  if (sumRow === -1) sumRow = valRow + 13;

  const avail = toNum(rawEff[valRow]?.[availCol]);
  const perf = toNum(rawEff[valRow]?.[perfCol]);
  const qual = toNum(rawEff[valRow]?.[qualCol]);
  const oee = toNum(rawEff[sumRow]?.[qualCol]);
  const capacity = toNum(rawEff[sumRow]?.[availCol]);
  const rasio_bn = toNum(rawEff[sumRow]?.[perfCol]);

  console.log(
    `[OEESheet] cols=${availCol},${perfCol},${qualCol} rows=${valRow},${sumRow} ` +
      `avail=${avail?.toFixed(6)} perf=${perf?.toFixed(6)} qual=${qual?.toFixed(6)} ` +
      `oee=${oee?.toFixed(6)} cap=${capacity} rasio_bn=${rasio_bn?.toFixed(6)}`,
  );
  return {
    availability: avail,
    performance: perf,
    quality: qual,
    oee,
    capacity,
    rasio_bn,
  };
}

// ─── DEDUPLICATE ROWS ─────────────────────────────────────────────────────────
function deduplicateRows(rows: DailyRowParsed[]): DailyRowParsed[] {
  const m = new Map<string, DailyRowParsed>();
  for (const r of rows) m.set(r.tanggal, r);
  return Array.from(m.values()).sort((a, b) =>
    a.tanggal.localeCompare(b.tanggal),
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export function parseKonsolSheet(
  raw: any[][],
  rawEffectiveness?: any[][],
): ParseResult {
  if (!raw || raw.length < 4)
    throw new Error("Sheet 'Konsol' kosong atau terlalu pendek.");

  const format = detectFormat(raw);

  let pakisKapasitasOEE: number | undefined;
  if (format === "pakis" && rawEffectiveness && rawEffectiveness.length >= 5) {
    const effPakis = parseOEESheet(rawEffectiveness);
    if (effPakis.capacity && effPakis.capacity > 0)
      pakisKapasitasOEE = effPakis.capacity;
  }

  const result =
    format === "kristal"
      ? parseKristal(raw)
      : format === "pakis"
        ? parsePakis(raw, pakisKapasitasOEE)
        : format === "tuban"
          ? parseTuban(raw)
          : parseBalok(raw);

  if (rawEffectiveness && rawEffectiveness.length >= 5) {
    const eff = parseOEESheet(rawEffectiveness);
    const valid = (v: number | null) => v != null && v >= 0 && v <= 1;

    if (format === "balok" || format === "tuban") {
      if (
        valid(eff.availability) &&
        valid(eff.performance) &&
        valid(eff.quality)
      ) {
        result.agg_availability = eff.availability;
        result.agg_performance = eff.performance;
        result.agg_quality = eff.quality;
        result.agg_oee =
          eff.oee && valid(eff.oee)
            ? eff.oee
            : eff.availability! * eff.performance! * eff.quality!;
      } else if (eff.capacity && eff.capacity > 0 && result.rows.length > 0) {
        const rows = result.rows.filter((r) => r.es_keluar > 0);
        const n = rows.length;
        if (n > 0) {
          const tp = rows.reduce((s, r) => s + r.es_keluar, 0);
          const tr = rows.reduce((s, r) => s + r.total_rusak, 0);
          const tb = rows.reduce((s, r) => s + (r.total_beban ?? 0), 0);
          const tbn = rows.reduce((s, r) => s + (r.beban_normal ?? 0), 0);
          const avail = clamp01(
            (eff.capacity - (tb > 0 ? tbn / tb : 0)) / eff.capacity,
          );
          const perf = clamp01(tp / n / eff.capacity);
          const qual = tp > 0 ? clamp01((tp - tr) / tp) : null;
          result.agg_availability = avail;
          result.agg_performance = perf;
          result.agg_quality = qual;
          result.agg_oee = qual != null ? avail * perf * qual : null;
        }
      }
    } else if (format === "pakis") {
      if (
        valid(eff.availability) &&
        valid(eff.performance) &&
        valid(eff.quality)
      ) {
        result.agg_availability = eff.availability;
        result.agg_performance = eff.performance;
        result.agg_quality = eff.quality;
        result.agg_oee =
          eff.oee && valid(eff.oee)
            ? eff.oee
            : eff.availability! * eff.performance! * eff.quality!;
      } else {
        const rows = result.rows.filter((r) => r.es_keluar > 0);
        const n = rows.length;
        if (n > 0 && eff.capacity && eff.capacity > 0) {
          const tp = rows.reduce((s, r) => s + r.es_keluar, 0);
          const tr = rows.reduce((s, r) => s + r.total_rusak, 0);
          const aggAvail = 1.0;
          const aggPerf = clamp01(tp / n / eff.capacity);
          const aggQual = tp > 0 ? clamp01((tp - tr) / tp) : null;
          result.agg_availability = aggAvail;
          result.agg_performance = aggPerf;
          result.agg_quality = aggQual;
          result.agg_oee =
            aggQual != null ? aggAvail * aggPerf * aggQual : null;
        }
      }
    } else {
      if (
        valid(eff.availability) &&
        valid(eff.performance) &&
        valid(eff.quality)
      ) {
        result.agg_availability = eff.availability;
        result.agg_performance = eff.performance;
        result.agg_quality = eff.quality;
        result.agg_oee =
          eff.oee && valid(eff.oee)
            ? eff.oee
            : eff.availability! * eff.performance! * eff.quality!;
      } else if (eff.capacity && eff.capacity > 0) {
        const rows = result.rows,
          n = rows.length;
        const tp = rows.reduce((s, r) => s + r.es_keluar, 0);
        const tr = rows.reduce((s, r) => s + r.total_rusak, 0);
        const perf = clamp01((n > 0 ? tp / n : 0) / eff.capacity);
        const qual = tp > 0 ? clamp01((tp - tr) / tp) : null;
        let avail: number | null = null;
        if (valid(eff.rasio_bn))
          avail = clamp01((eff.capacity! - eff.rasio_bn!) / eff.capacity!);
        else if (valid(eff.availability)) avail = eff.availability;
        result.agg_availability = avail;
        result.agg_performance = perf;
        result.agg_quality = qual;
        result.agg_oee =
          avail != null && qual != null ? avail * perf * qual : null;
      }
    }
  }

  return { format, ...result };
}

export function toDbRecords(result: ParseResult, unitId: number): object[] {
  return result.rows.map((row) => ({
    unit_id: unitId,
    tanggal: row.tanggal,
    es_keluar: row.es_keluar,
    es_keluar_5kg: row.es_keluar_5kg ?? null,
    es_keluar_10kg: row.es_keluar_10kg ?? null,
    bak1: row.bak1 ?? null,
    bak2: row.bak2 ?? null,
    bak3: row.bak3 ?? null,
    bak3bb: row.bak3bb ?? null,
    bak3bk: row.bak3bk ?? null,
    bak4: row.bak4 ?? null,
    bak5: row.bak5 ?? null,
    total_rusak: row.total_rusak,
    rusak_p5k: row.rusak_p5k ?? null,
    rusak_p10k: row.rusak_p10k ?? null,
    rusak_kt: row.rusak_kt ?? null,
    beban_normal: row.beban_normal ?? null,
    beban_puncak: row.beban_puncak ?? null,
    total_beban: row.total_beban ?? null,
    jumlah_mesin: row.jumlah_mesin ?? null,
    prod_jam: row.prod_jam ?? null,
    kapasitas: row.kapasitas ?? null,
    es_tidak_terjual: row.es_tidak_terjual ?? null,
    realisasi_order: row.realisasi_order ?? null,
    selisih_order: row.selisih_order ?? null,
    tenaga_kerja: row.tenaga_kerja ?? null,
    output_tk: row.output_tk ?? null,
    kwh_wbp: row.kwh_wbp ?? null,
    kwh_lwbp: row.kwh_lwbp ?? null,
    kwh_total: row.kwh_total ?? null,
    downtime_jam: row.downtime_jam ?? null,
    availability: row.availability,
    performance: row.performance,
    quality: row.quality,
    oee: row.oee,
    agg_availability: result.agg_availability,
    agg_performance: result.agg_performance,
    agg_quality: result.agg_quality,
    agg_oee: result.agg_oee,
  }));
}
