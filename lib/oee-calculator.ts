export function clamp01(v: number): number {
 return Math.min(1, Math.max(0, v))
}
export interface OEEMetrics {
 availability: number | null
 performance: number | null
 quality: number | null
 oee: number | null
}
export interface DailyRow {
 es_keluar: number
 total_rusak: number
 total_beban: number
 jumlah_mesin: number
 prod_jam: number
}
/** Aggregate OEE dari array baris harian (Formula Balok) */
export function calcAggOEE(rows: DailyRow[]): OEEMetrics {
 const n = rows.length
 if (!n) return { availability: null, performance: null, quality: null, oee: null }
 const totalProd = rows.reduce((s, r) => s + r.es_keluar, 0)
 const totalRusak = rows.reduce((s, r) => s + r.total_rusak, 0)
 const totalJam = rows.reduce((s, r) => s + r.total_beban, 0)
 const avgMesin = rows.reduce((s, r) => s + r.jumlah_mesin, 0) / n
 const avgPJ = rows.reduce((s, r) => s + r.prod_jam, 0) / n
 if (!totalJam || !totalProd) return { availability: null, performance: null, quality: null, oee: null }
 const availability = clamp01(totalJam / (avgMesin * 24 * n))
 const performance = clamp01(totalProd / (totalJam * avgPJ))
 const quality = clamp01((totalProd - totalRusak) / totalProd)
 return { availability, performance, quality, oee: availability * performance * quality }
}
export const pct = (v: number | null, d = 1) => v != null ? (v * 100).toFixed(d) + '%' : '–'
export const numFmt = (v: number | null | undefined) => v != null ? Number(v).toLocaleString('id-ID') : '–'
export const statusColor = (v: number | null): string => {
 if (v == null) return '#6b7280'
 if (v >= 0.85) return '#10b981'
 if (v >= 0.65) return '#f59e0b'
 return '#ef4444'
}
export const statusLabel = (v: number | null): string => {
 if (v == null) return '–'
 if (v >= 0.85) return 'World Class'
 if (v >= 0.65) return 'Typical'
 return 'Low'
}
export const pillStyle = (color: string): { bg: string; fg: string } => {
 const map: Record<string, { bg: string; fg: string }> = {
 '#10b981': { bg: '#d1fae5', fg: '#065f46' },
 '#f59e0b': { bg: '#fef3c7', fg: '#78350f' },
 '#ef4444': { bg: '#fee2e2', fg: '#7f1d1d' },
 '#6b7280': { bg: '#f3f4f6', fg: '#374151' },
 }
 return map[color] ?? { bg: '#f3f4f6', fg: '#374151' }
}