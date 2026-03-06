'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from 'recharts'
import { pct, numFmt, statusColor, statusLabel, pillStyle } from '@/lib/oee-calculator'
import { GaugeCard } from './GaugeCard'

/* ─── PLANT CONFIG ─── */
const PLANT_CONFIG: Record<string, { name: string; color: string; icon: string }> = {
  ponorogo: { name: 'Ponorogo', color: '#0066ff', icon: '🏭' },
  pakis:    { name: 'Pakis',    color: '#059669', icon: '🏗'  },
  tuban:    { name: 'Tuban',    color: '#d97706', icon: '⚙️' },
}

interface DailyRow {
  id: number; unit_id: number; tanggal: string
  es_keluar: number; total_rusak: number
  es_keluar_5kg?: number; es_keluar_10kg?: number
  bak1?: number; bak2?: number; bak3?: number
  rusak_p5k?: number; rusak_p10k?: number; rusak_kt?: number
  beban_normal?: number; beban_puncak?: number; total_beban?: number
  jumlah_mesin?: number; prod_jam?: number; kapasitas?: number
  es_tidak_terjual?: number; realisasi_order?: number
  tenaga_kerja?: number; output_tk?: number
  kwh_wbp?: number; kwh_lwbp?: number
  availability?: number; performance?: number; quality?: number; oee?: number
  agg_availability?: number; agg_performance?: number; agg_quality?: number; agg_oee?: number
  production_units?: { id: number; code: string; label: string; format: string }
}

interface Unit { id: number; code: string; label: string; format: string }

/* ─── CHART TOOLTIP ─── */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
      padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#1a1a1a' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: '#6b7280' }}>{p.name}</span>
          <span style={{ color: p.color || '#1a1a1a', fontWeight: 600 }}>
            {typeof p.value === 'number' ? p.value.toFixed(1) + '%' : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── UPLOAD PANEL ─── */
function UploadPanel({ unit, plantCode, onSuccess }: {
  unit: Unit; plantCode: string; onSuccess: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [message,   setMessage]   = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg = PLANT_CONFIG[plantCode]

  // Validasi format file sebelum upload — baca header sheet Konsol
  const validateFormat = async (file: File): Promise<{ valid: boolean; detected: string; reason?: string }> => {
    try {
      const XLSX = await import('xlsx')
      const buf  = await file.arrayBuffer()
      const wb   = XLSX.read(buf, { type: 'array', cellDates: true, raw: true })
      if (!wb.Sheets['Konsol']) return { valid: false, detected: '?', reason: "Sheet 'Konsol' tidak ditemukan." }

      const raw = XLSX.utils.sheet_to_json(wb.Sheets['Konsol'], { header: 1, defval: null, raw: true }) as any[][]
      const r1  = raw[1] ?? []
      const r2  = raw[2] ?? []
      const f5  = String(r1[5] ?? '').trim().toLowerCase()
      const f6  = String(r1[6] ?? '').trim().toLowerCase()
      const f7  = String(r1[7] ?? '').trim().toLowerCase()
      // sub-header row[2] — pembeda utama Kristal vs Balok
      const s6  = String(r2[6] ?? '').trim().toLowerCase()
      const s7  = String(r2[7] ?? '').trim().toLowerCase()

      let detected: string
      if (f5 === 'tgl') detected = 'kristal'
      else if (f6.includes('5kg') || f6.includes('5 kg')) detected = 'kristal'
      else if (f7.includes('10kg') || f7.includes('10 kg')) detected = 'kristal'
      else if (s6 === '5kg' || s6.includes('5 kg')) detected = 'kristal'
      else if (s7 === '10kg' || s7.includes('10 kg')) detected = 'kristal'
      else if (f5 === 'bulan' && f7.includes('bak')) detected = 'balok'
      else if (s6.includes('bak') || s7.includes('bak')) detected = 'balok'
      else detected = 'balok'

      const expected = unit.format
      if (detected !== expected) {
        return {
          valid: false, detected,
          reason: `File ini terdeteksi sebagai format <b>${detected.toUpperCase()}</b>, tapi unit yang dipilih adalah <b>${unit.label} (${expected.toUpperCase()})</b>. Pilih file yang sesuai.`,
        }
      }
      return { valid: true, detected }
    } catch (e: any) {
      return { valid: false, detected: '?', reason: 'Gagal membaca file: ' + e.message }
    }
  }

  const handleFileChange = async (file: File | null | undefined) => {
    if (!file) return
    setMessage(null)
    setPreview(null)

    // Cek ekstensi
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setMessage({ type: 'err', text: 'File harus berformat .xlsx atau .xls' })
      return
    }

    // Tampil nama file sementara
    setPreview(file.name)

    // Validasi format
    setMessage({ type: 'warn', text: '🔍 Memeriksa format file...' })
    const check = await validateFormat(file)
    if (!check.valid) {
      setPreview(null)
      setMessage({ type: 'err', text: check.reason ?? 'Format file tidak sesuai.' })
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    // Upload
    setUploading(true)
    setMessage({ type: 'warn', text: '⏳ Mengupload dan memproses data...' })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('unit_id', String(unit.id))
    fd.append('expected_format', unit.format)
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage({
        type: 'ok',
        text: `✅ Berhasil upload <b>${data.rowCount} baris</b> · Bulan: ${data.bulan} · OEE: ${data.agg_oee != null ? (data.agg_oee * 100).toFixed(1) + '%' : '–'}`,
      })
      onSuccess()
    } catch (e: any) {
      setMessage({ type: 'err', text: '⚠ ' + e.message })
      setPreview(null)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const msgStyle: Record<string, React.CSSProperties> = {
    ok:   { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    warn: { background: '#fef9c3', color: '#713f12', border: '1px solid #fde047' },
    err:  { background: '#fee2e2', color: '#7f1d1d', border: '1px solid #fca5a5' },
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '16px 20px',
      border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>📂 Upload Data XLSX</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            Hanya menerima file format <b style={{ color: cfg?.color }}>{unit.format.toUpperCase()}</b> · Unit: <b>{unit.label}</b>
          </div>
        </div>
        {/* Format badge */}
        <div style={{
          padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
          background: unit.format === 'kristal' ? '#ede9fe' : '#dbeafe',
          color:      unit.format === 'kristal' ? '#6d28d9' : '#1d4ed8',
          border: `1px solid ${unit.format === 'kristal' ? '#c4b5fd' : '#93c5fd'}`,
        }}>
          {unit.format === 'kristal' ? '❄️ Format Kristal' : '🧊 Format Balok'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: uploading ? '#e5e7eb' : cfg?.color ?? '#0066ff',
            color: uploading ? '#9ca3af' : '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: uploading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {uploading ? '⏳ Memproses...' : '📂 Pilih File XLSX'}
        </button>

        {preview && !uploading && (
          <span style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
            📄 {preview}
          </span>
        )}

        <input
          ref={fileRef} type="file" accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={e => handleFileChange(e.target.files?.[0])}
        />
      </div>

      {message && (
        <div
          style={{
            marginTop: 10, padding: '9px 14px', borderRadius: 8, fontSize: 12,
            lineHeight: 1.5, ...msgStyle[message.type],
          }}
          dangerouslySetInnerHTML={{ __html: message.text }}
        />
      )}
    </div>
  )
}

/* ════════════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════════════ */
interface OEEDashboardProps { plantCode: string }

// Cache key helper
const cacheKey = (unitId: number) => `oee_rows_${unitId}`
const cacheGet = (unitId: number): DailyRow[] | null => {
  try {
    const raw = sessionStorage.getItem(cacheKey(unitId))
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    // Cache valid 10 menit
    if (Date.now() - ts > 10 * 60 * 1000) {
      sessionStorage.removeItem(cacheKey(unitId))
      return null
    }
    return data
  } catch { return null }
}
const cacheSet = (unitId: number, data: DailyRow[]) => {
  try {
    sessionStorage.setItem(cacheKey(unitId), JSON.stringify({ data, ts: Date.now() }))
  } catch { /* storage full, skip */ }
}
const cacheClear = (unitId: number) => {
  try { sessionStorage.removeItem(cacheKey(unitId)) } catch { /* ignore */ }
}

export default function OEEDashboard({ plantCode }: OEEDashboardProps) {
  const cfg  = PLANT_CONFIG[plantCode] ?? { name: plantCode, color: '#6b7280', icon: '🏭' }
  const [units,      setUnits]      = useState<Unit[]>([])
  const [activeUnit, setActiveUnit] = useState<number | null>(null)
  const [rows,       setRows]       = useState<DailyRow[]>([])
  const [startDate,  setStartDate]  = useState('')
  const [endDate,    setEndDate]    = useState('')
  const [tab,        setTab]        = useState<'overview' | 'produksi' | 'tabel'>('overview')
  const [loading,    setLoading]    = useState(true)

  // Load units
  useEffect(() => {
    fetch('/api/plants')
      .then(async res => {
        if (!res.ok) return []
        const json = await res.json()
        return Array.isArray(json) ? json : []
      })
      .then((plants: any[]) => {
        const plant = plants.find(p => p.code === plantCode)
        if (plant) {
          setUnits(plant.production_units ?? [])
          setActiveUnit(plant.production_units?.[0]?.id ?? null)
        }
      })
      .catch(e => console.error('Units fetch error:', e))
  }, [plantCode])

  // Load OEE data — pakai cache jika tersedia
  const loadData = useCallback(async (forceRefresh = false) => {
    if (!activeUnit) return
    setLoading(true)
    try {
      // Cek cache dulu (kecuali force refresh setelah upload)
      if (!forceRefresh) {
        const cached = cacheGet(activeUnit)
        if (cached && cached.length > 0) {
          setRows(cached)
          if (!startDate && cached.length) {
            setStartDate(cached[0].tanggal)
            setEndDate(cached[cached.length - 1].tanggal)
          }
          setLoading(false)
          return
        }
      }

      let url = `/api/oee?unit_id=${activeUnit}`
      if (startDate) url += `&start=${startDate}`
      if (endDate)   url += `&end=${endDate}`

      const res = await fetch(url)
      if (!res.ok) {
        const text = await res.text()
        console.error('OEE fetch error:', text.slice(0, 300))
        setRows([])
        setLoading(false)
        return
      }
      const data = await res.json()
      const newRows = Array.isArray(data) ? data : []
      setRows(newRows)

      // Simpan ke cache
      if (newRows.length > 0) {
        cacheSet(activeUnit, newRows)
        if (!startDate) {
          setStartDate(newRows[0].tanggal)
          setEndDate(newRows[newRows.length - 1].tanggal)
        }
      }
    } catch (e) {
      console.error('loadData error:', e)
      setRows([])
    }
    setLoading(false)
  }, [activeUnit, startDate, endDate])

  useEffect(() => { loadData() }, [activeUnit])

  // Setelah upload: clear cache unit ini lalu reload fresh
  const handleUploadSuccess = useCallback(() => {
    if (activeUnit) cacheClear(activeUnit)
    loadData(true)
  }, [activeUnit, loadData])

  // Filtered rows
  const data = rows.filter(r =>
    (!startDate || r.tanggal >= startDate) &&
    (!endDate   || r.tanggal <= endDate)
  )

  // Detect format dari unit aktif
  const activeUnitObj = units.find(u => u.id === activeUnit)
  const isKristal     = activeUnitObj?.format === 'kristal'

  // Nilai per-baris harian (untuk chart trend & tabel)
  const getDailyOEE   = (r: DailyRow): number | null => r.oee          ?? null
  const getDailyAvail = (r: DailyRow): number | null => r.availability ?? null
  const getDailyPerf  = (r: DailyRow): number | null => r.performance  ?? null
  const getDailyQual  = (r: DailyRow): number | null => r.quality      ?? null

  // Nilai aggregate bulan — selalu pakai agg_ (sudah dihitung dengan formula benar saat upload)
  const getOEE   = (r: DailyRow): number | null => r.agg_oee          ?? r.oee          ?? null
  const getAvail = (r: DailyRow): number | null => r.agg_availability ?? r.availability ?? null
  const getPerf  = (r: DailyRow): number | null => r.agg_performance  ?? r.performance  ?? null
  const getQual  = (r: DailyRow): number | null => r.agg_quality      ?? r.quality      ?? null

  // Aggregate bulan — ambil dari baris mana saja (nilai agg_ sama di semua baris 1 bulan)
  const anyRow   = data.length > 0 ? data[0] : null
  const aggOEE   = anyRow ? getOEE(anyRow)   : null
  const aggAvail = anyRow ? getAvail(anyRow) : null
  const aggPerf  = anyRow ? getPerf(anyRow)  : null
  const aggQual  = anyRow ? getQual(anyRow)  : null

  const totProd   = data.reduce((s, r) => s + r.es_keluar, 0)
  const totRusak  = data.reduce((s, r) => s + r.total_rusak, 0)
  const defRate   = totProd > 0 ? totRusak / totProd : 0
  const avgPerDay = data.length ? Math.round(totProd / data.length) : 0

  // Chart trend — pakai nilai harian (bukan agg)
  const lineData  = data.map(r => ({
    date:         r.tanggal.slice(5),
    OEE:          +((getDailyOEE(r)   ?? 0) * 100).toFixed(1),
    Availability: +((getDailyAvail(r) ?? 0) * 100).toFixed(1),
    Performance:  +((getDailyPerf(r)  ?? 0) * 100).toFixed(1),
    Quality:      +((getDailyQual(r)  ?? 0) * 100).toFixed(1),
  }))

  const barData = data.map(r => ({
    date:      r.tanggal.slice(5),
    'Es Keluar': r.es_keluar,
    'Rusak':     r.total_rusak,
  }))

  const tabs: ['overview' | 'produksi' | 'tabel', string][] = [
    ['overview', 'Overview'],
    ['produksi', 'Produksi & Defect'],
    ['tabel',    'Data Harian'],
  ]

  return (
    <div style={{
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      background: '#f5f7fa', color: '#1a1a1a',
      padding: 20, minHeight: '100vh',
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .tbl-row:hover td { background:#f9fafb !important; }
        input[type=date] { color-scheme:light; }
      `}</style>

      {/* SUB-HEADER */}
      <div style={{
        background: '#fff', padding: '12px 20px', borderRadius: 12, marginBottom: 16,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10,
      }}>
        {/* Kiri: judul pabrik */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `${cfg.color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>{cfg.icon}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
              Pabrik {cfg.name}
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>
              {units.find(u => u.id === activeUnit)?.label ?? '–'} · {data.length} hari data
            </div>
          </div>
        </div>

        {/* Kanan: kontrol */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Unit tabs (hanya Ponorogo yang punya 2 unit) */}
          {units.length > 1 && (
            <div style={{ display: 'flex', gap: 4 }}>
              {units.map(u => (
                <button key={u.id} onClick={() => setActiveUnit(u.id)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    cursor: 'pointer', border: '1px solid',
                    borderColor: activeUnit === u.id ? cfg.color : '#e5e7eb',
                    background:  activeUnit === u.id ? cfg.color : '#fff',
                    color:       activeUnit === u.id ? '#fff' : '#6b7280',
                    fontFamily: 'inherit',
                  }}>{u.label}</button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

          {/* View tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', border: '1px solid',
                  borderColor: tab === id ? cfg.color : '#e5e7eb',
                  background:  tab === id ? cfg.color : '#fff',
                  color:       tab === id ? '#fff' : '#6b7280',
                  fontFamily: 'inherit',
                }}>{lbl}</button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />

          {/* Date range */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
            <span style={{ color: '#9ca3af', fontSize: 12 }}>–</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, fontFamily: 'inherit' }} />
            <button onClick={() => loadData(true)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', border: 'none', background: cfg.color, color: '#fff',
                fontFamily: 'inherit',
              }}>Filter</button>
          </div>
        </div>
      </div>

      {/* UPLOAD PANEL — satu panel per unit aktif */}
      {units.length > 0 && activeUnit && (() => {
        const activeUnitData = units.find(u => u.id === activeUnit)
        return activeUnitData ? (
          <UploadPanel unit={activeUnitData} plantCode={plantCode} onSuccess={handleUploadSuccess} />
        ) : null
      })()}

      {/* FORMULA RIBBON */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '9px 18px', marginBottom: 20, fontSize: 11, color: '#6b7280',
        display: 'flex', gap: 20, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 700, color: '#374151' }}>📐 Formula OEE:</span>
        {isKristal ? (
          <span>Kristal: Availability, Performance, Quality diambil dari <b>AA11, AE11, AI11</b> file XLSX</span>
        ) : (
          <>
            <span><b>Availability</b> = (Capacity − Rasio Beban Normal) ÷ Capacity</span>
            <span><b>Performance</b> = Avg Achiev ÷ Capacity</span>
            <span><b>Quality</b> = (ΣProd − ΣRusak) ÷ ΣProd</span>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: cfg.color }}>OEE = A × P × Q</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>⏳ Memuat data...</div>
      ) : data.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#fff',
          borderRadius: 16, border: '1.5px dashed #93c5fd', color: '#6b7280',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Belum ada data untuk unit ini</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Upload file XLSX menggunakan panel di atas.</div>
        </div>
      ) : (
        <>
          {/* ══ OVERVIEW ══ */}
          {tab === 'overview' && (
            <div style={{ animation: 'fadeUp .25s ease' }}>
              {/* Gauge row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
                <GaugeCard label="OEE"          value={aggOEE}   sparkData={data.map(r => getDailyOEE(r))}   color={statusColor(aggOEE)}   sublabel={`${data.length} hari`} />
                <GaugeCard label="Availability" value={aggAvail} sparkData={data.map(r => getDailyAvail(r))} color="#3b82f6" sublabel={isKristal ? 'dari file XLSX' : '(Cap−RasioBN)÷Cap'} />
                <GaugeCard label="Performance"  value={aggPerf}  sparkData={data.map(r => getDailyPerf(r))}  color="#f59e0b" sublabel={isKristal ? 'dari file XLSX' : 'AvgAchiev÷Capacity'} />
                <GaugeCard label="Quality"      value={aggQual}  sparkData={data.map(r => getDailyQual(r))}  color="#10b981" sublabel={isKristal ? 'dari file XLSX' : '(ΣProd−ΣRusak)÷ΣProd'} />
              </div>

              {/* KPI + Trend */}
              <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, marginBottom: 20 }}>
                {/* KPI */}
                <div style={{
                  background: '#fff', borderRadius: 12, padding: 24,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Ringkasan Produksi</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {([
                      ['Total Produksi', numFmt(totProd) + ' bal',     cfg.color],
                      ['Total Defect',   numFmt(totRusak) + ' bal',    '#ef4444'],
                      ['Defect Rate',    pct(defRate, 2),               statusColor(1 - defRate)],
                      ['Rata-rata/Hari', numFmt(avgPerDay) + ' bal',   cfg.color],
                      ['Hari Dianalisa', String(data.length),           '#6b7280'],
                      ['Gap WC',         pct(Math.max(0, 0.85 - (aggOEE ?? 0))), aggOEE != null && aggOEE >= 0.85 ? '#10b981' : '#ef4444'],
                    ] as [string, string, string][]).map(([l, v, c]) => (
                      <div key={l} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Trend chart */}
                <div style={{
                  background: '#fff', borderRadius: 12, padding: 24,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #e5e7eb',
                }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Tren OEE Harian</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={lineData}>
                      <CartesianGrid strokeDasharray="3 6" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="date" stroke="#d1d5db" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} />
                      <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} stroke="#d1d5db"
                        tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine y={85} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6}
                        label={{ value: '85% WC', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
                      <Line dataKey="OEE" name="OEE" stroke={statusColor(aggOEE)} strokeWidth={2.5} dot={false} connectNulls activeDot={{ r: 4 }} />
                      <Line dataKey="Availability" name="Availability" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                      <Line dataKey="Performance"  name="Performance"  stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                      <Line dataKey="Quality"      name="Quality"      stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ══ PRODUKSI ══ */}
          {tab === 'produksi' && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, border: '1px solid #e5e7eb', animation: 'fadeUp .25s ease' }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Produksi Harian & Defect</div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 6" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="date" stroke="#d1d5db" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} />
                  <YAxis stroke="#d1d5db" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="Es Keluar" name="Es Keluar" radius={[3, 3, 0, 0]}>
                    {barData.map((d, i) => (
                      <Cell key={i} fill={cfg.color} fillOpacity={0.7} />
                    ))}
                  </Bar>
                  <Bar dataKey="Rusak" name="Rusak" fill="#ef4444" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ══ TABEL ══ */}
          {tab === 'tabel' && (
            <div style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              border: '1px solid #e5e7eb', animation: 'fadeUp .25s ease',
            }}>
              <div style={{
                padding: '14px 24px', borderBottom: '1px solid #e5e7eb',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Data OEE Per Hari</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {data.length} hari · OEE agg: <strong style={{ color: statusColor(aggOEE) }}>{pct(aggOEE)}</strong>
                </span>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                      {(['Tanggal',
                        ...(isKristal
                          ? ['Es 5kg', 'Es 10kg', 'Total Es', 'Retur 5kg', 'Retur 10kg', 'Total Retur', 'Realisasi', 'Prod/Jam', 'Kapasitas', 'Es Tdk Terjual', 'kWh WBP', 'kWh LWBP']
                          : ['Es Keluar', 'Total Rusak', 'Bak 1', 'Bak 2', 'Bak 3', 'Bbn Normal', 'Bbn Puncak', 'Total Beban', 'Mesin', 'Prod/Jam']),
                        'Availability', 'Performance', 'Quality', 'OEE',
                      ]).map(h => (
                        <th key={h} style={{
                          padding: '10px 12px', textAlign: 'left', color: '#6b7280',
                          fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                          borderBottom: '1px solid #e5e7eb',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => {
                      const oee   = getDailyOEE(r)
                      const avail = getDailyAvail(r)
                      const perf  = getDailyPerf(r)
                      const qual  = getDailyQual(r)
                      const { bg, fg } = pillStyle(statusColor(oee))
                      return (
                        <tr key={i} className="tbl-row" style={{ borderTop: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: 500 }}>{r.tanggal}</td>
                          {isKristal ? (
                            <>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{numFmt(r.es_keluar_5kg  ?? 0)}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{numFmt(r.es_keluar_10kg ?? 0)}</td>
                              <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1a1a1a' }}>{numFmt(r.es_keluar)}</td>
                              <td style={{ padding: '9px 12px', color: (r.rusak_p5k  ?? 0) > 0 ? '#ef4444' : '#d1d5db' }}>{r.rusak_p5k  ?? 0}</td>
                              <td style={{ padding: '9px 12px', color: (r.rusak_p10k ?? 0) > 0 ? '#ef4444' : '#d1d5db' }}>{r.rusak_p10k ?? 0}</td>
                              <td style={{ padding: '9px 12px', color: r.total_rusak > 0 ? '#ef4444' : '#d1d5db', fontWeight: r.total_rusak > 0 ? 600 : 400 }}>{r.total_rusak}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{numFmt(r.realisasi_order ?? 0)}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{r.prod_jam != null ? r.prod_jam.toFixed(1) : '–'}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{numFmt(r.kapasitas ?? 0)}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{numFmt(r.es_tidak_terjual ?? 0)}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{r.kwh_wbp ?? '–'}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{r.kwh_lwbp ?? '–'}</td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '9px 12px', fontWeight: 600 }}>{numFmt(r.es_keluar)}</td>
                              <td style={{ padding: '9px 12px', color: r.total_rusak > 0 ? '#ef4444' : '#d1d5db', fontWeight: r.total_rusak > 0 ? 600 : 400 }}>{r.total_rusak}</td>
                              <td style={{ padding: '9px 12px', color: (r.bak1 ?? 0) > 0 ? '#ef4444' : '#d1d5db' }}>{r.bak1 ?? 0}</td>
                              <td style={{ padding: '9px 12px', color: (r.bak2 ?? 0) > 0 ? '#ef4444' : '#d1d5db' }}>{r.bak2 ?? 0}</td>
                              <td style={{ padding: '9px 12px', color: (r.bak3 ?? 0) > 0 ? '#ef4444' : '#d1d5db' }}>{r.bak3 ?? 0}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{r.beban_normal ?? '–'}</td>
                              <td style={{ padding: '9px 12px', color: (r.beban_puncak ?? 0) > 0 ? '#3b82f6' : '#6b7280' }}>{r.beban_puncak ?? 0}</td>
                              <td style={{ padding: '9px 12px', fontWeight: 600, color: '#374151' }}>{r.total_beban ?? '–'}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{r.jumlah_mesin ?? '–'}</td>
                              <td style={{ padding: '9px 12px', color: '#6b7280' }}>{r.prod_jam != null ? r.prod_jam.toFixed(1) : '–'}</td>
                            </>
                          )}
                          <td style={{ padding: '9px 12px', color: statusColor(avail), fontWeight: 600 }}>{pct(avail)}</td>
                          <td style={{ padding: '9px 12px', color: statusColor(perf),  fontWeight: 600 }}>{pct(perf)}</td>
                          <td style={{ padding: '9px 12px', color: statusColor(qual),  fontWeight: 600 }}>{pct(qual)}</td>
                          <td style={{ padding: '9px 12px', color: statusColor(oee),   fontWeight: 700 }}>{pct(oee)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', paddingTop: 20, paddingBottom: 8 }}>
        OEE = Availability × Performance × Quality &nbsp;·&nbsp; Target ≥ 85% &nbsp;·&nbsp; PMP {cfg.name}
      </div>
    </div>
  )
}