'use client'

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { pct, numFmt, statusColor } from '@/lib/oee-calculator'
import { PlantCard, PlantData } from './PlantCard'
import { UnitData } from './UnitCard'

/* ─── PLANT CONFIG (warna & icon statis) ─── */
const PLANT_CONFIG: Record<string, { color: string; accent: string; icon: string }> = {
  ponorogo: { color: '#0066ff', accent: '#eff6ff', icon: '🏭' },
  pakis:    { color: '#059669', accent: '#d1fae5', icon: '🏗' },
  tuban:    { color: '#d97706', accent: '#fef3c7', icon: '⚙️' },
}

/* ─── TYPES ─── */
interface ApiPlant {
  id: number; code: string; name: string; location: string
  production_units: { id: number; code: string; label: string; format: string }[]
}
interface ApiOEELatest {
  unit_id: number; unit_label: string; unit_format: string
  plant_code: string; plant_name: string; bulan_terakhir: string
  availability: number | null; performance: number | null
  quality: number | null; oee: number | null
}
interface ApiOEEMonthly {
  unit_id:         number
  bulan:           string
  jumlah_hari:     number
  total_es_keluar: number
  total_rusak:     number
  availability:    number | null
  performance:     number | null
  quality:         number | null
  oee:             number | null
}

/* ─── COMPARISON CHART ─── */
function ComparisonChart({ trendData }: { trendData: any[] }) {
  if (!trendData.length) return null
  const lines = [
    { key: 'Ponorogo Balok',   color: '#0066ff', dash: false },
    { key: 'Ponorogo Kristal', color: '#8b5cf6', dash: true  },
    { key: 'Pakis',            color: '#059669', dash: false },
    { key: 'Tuban',            color: '#d97706', dash: false },
  ].filter(l => trendData.some(d => d[l.key] != null))

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '20px 24px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>Perbandingan OEE Semua Pabrik</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Tren Bulanan</div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {lines.map(({ key, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
              <div style={{ width: 18, height: 2, background: color, borderRadius: 1 }} />
              {key}
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={trendData}>
          <CartesianGrid strokeDasharray="3 6" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="bulan" stroke="#d1d5db" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} />
          <YAxis domain={[0, 100]} tickFormatter={v => v + '%'} stroke="#d1d5db"
            tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11 }}
            formatter={(v: any) => [typeof v === 'number' ? v.toFixed(1) + '%' : v]}
          />
          <ReferenceLine y={85} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5}
            label={{ value: '85% WC', fill: '#10b981', fontSize: 10, position: 'insideTopRight' }} />
          {lines.map(({ key, color, dash }) => (
            <Line key={key} dataKey={key} stroke={color} strokeWidth={2}
              strokeDasharray={dash ? '5 3' : undefined}
              dot={false} connectNulls activeDot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ─── SUMMARY BANNER ─── */
function SummaryBanner({ plants }: { plants: PlantData[] }) {
  const allUnits    = plants.flatMap(p => p.units)
  const totalProd   = allUnits.reduce((s, u) => s + u.totProd, 0)
  const totalRusak  = allUnits.reduce((s, u) => s + u.totRusak, 0)
  const validOEE    = allUnits.map(u => u.oee).filter(v => v != null) as number[]
  const avgOEE      = validOEE.length ? validOEE.reduce((a, b) => a + b, 0) / validOEE.length : null
  const defRate     = totalProd > 0 ? totalRusak / totalProd : 0

  const bestPlant   = plants.reduce((best, p) => {
    const avg = (v: PlantData) => {
      const vals = v.units.map(u => u.oee).filter(x => x != null) as number[]
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }
    return avg(p) > avg(best) ? p : best
  }, plants[0])

  const bestOEE = bestPlant
    ? (bestPlant.units.map(u => u.oee).filter(v => v != null) as number[])
        .reduce((a, b) => a + b, 0) / bestPlant.units.filter(u => u.oee != null).length
    : null

  const cards = [
    { label: 'Total Produksi', value: numFmt(totalProd),    sub: 'bal es — semua pabrik',  icon: '📦', color: '#0066ff', bg: '#eff6ff' },
    { label: 'OEE Rata-rata',  value: pct(avgOEE),           sub: avgOEE != null ? (avgOEE >= 0.85 ? 'World Class' : avgOEE >= 0.65 ? 'Typical' : 'Low') : '–', icon: '📊', color: statusColor(avgOEE), bg: '#f0fdf4' },
    { label: 'Total Defect',   value: numFmt(totalRusak),   sub: `Rate: ${pct(defRate, 2)}`, icon: '⚠️', color: '#ef4444', bg: '#fef2f2' },
    { label: 'Pabrik Terbaik', value: bestPlant?.name ?? '–', sub: `OEE ${pct(bestOEE)}`, icon: '🏆', color: bestPlant?.color ?? '#6b7280', bg: '#fffbeb' },
    { label: 'Total Pabrik',   value: `${plants.length} Pabrik`, sub: `${allUnits.length} Unit Produksi`, icon: '🏭', color: '#6b7280', bg: '#f9fafb' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 24 }}>
      {cards.map(({ label, value, sub, icon, color, bg }) => (
        <div key={label} style={{
          background: bg, borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 18px',
        }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{icon} {label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
        </div>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
const HOME_CACHE_KEY = 'oee_homepage_data_v3'
const HOME_CACHE_TTL = 3 * 60 * 1000 // 3 menit

export default function OEEHomepage() {
  const [plants,    setPlants]    = useState<PlantData[]>([])
  const [trendData, setTrendData] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)

        // Cek cache homepage
        try {
          const cached = sessionStorage.getItem(HOME_CACHE_KEY)
          if (cached) {
            const { plants: cp, trendData: ct, ts } = JSON.parse(cached)
            if (Date.now() - ts < HOME_CACHE_TTL && cp?.length > 0) {
              setPlants(cp)
              setTrendData(ct ?? [])
              setLoading(false)
              return
            }
          }
        } catch { /* cache miss, lanjut fetch */ }

        // Helper fetch yang aman — selalu return array jika error
        const safeFetch = async (url: string): Promise<any[]> => {
          try {
            const res = await fetch(url)
            if (!res.ok) {
              const text = await res.text()
              console.error(`API error ${url}:`, text.slice(0, 200))
              return []
            }
            const json = await res.json()
            return Array.isArray(json) ? json : []
          } catch (e) {
            console.error(`Fetch error ${url}:`, e)
            return []
          }
        }

        // 1. Ambil master pabrik
        const plantsRes = await fetch('/api/plants')
        if (!plantsRes.ok) {
          const text = await plantsRes.text()
          throw new Error(`API /plants error: ${text.slice(0, 200)}`)
        }
        const plantsData: ApiPlant[] = await plantsRes.json()

        if (!Array.isArray(plantsData) || plantsData.length === 0) {
          setPlants([])
          setLoading(false)
          return
        }

        // 2. Ambil OEE monthly (sekali saja, pakai untuk latest & trend)
        const monthlyData: ApiOEEMonthly[] = await safeFetch('/api/oee?monthly=true')

        // Kelompokkan OEE terbaru per unit (ambil bulan terbaru)
        const latestByUnit: Record<number, ApiOEEMonthly> = {}
        monthlyData.forEach(d => {
          if (!latestByUnit[d.unit_id] || d.bulan > latestByUnit[d.unit_id].bulan) {
            latestByUnit[d.unit_id] = d
          }
        })

        // 3. Ambil trend harian per unit (31 hari terakhir)
        const dailyTrendByUnit: Record<number, any[]> = {}
        for (const plant of plantsData) {
          for (const unit of plant.production_units) {
            const rows = await safeFetch(`/api/oee?unit_id=${unit.id}`)
            dailyTrendByUnit[unit.id] = rows.slice(-31)
          }
        }

        // Build PlantData array
        const builtPlants: PlantData[] = plantsData.map(p => {
          const cfg = PLANT_CONFIG[p.code] ?? { color: '#6b7280', accent: '#f3f4f6', icon: '🏭' }
          const units: UnitData[] = p.production_units.map(u => {
            const latest    = latestByUnit[u.id]
            const dailyRows = dailyTrendByUnit[u.id] ?? []

            // avgProdJam — rata-rata prod_jam dari data harian (hanya Balok)
            const prodJamRows = dailyRows.filter((r: any) => r.prod_jam != null && r.prod_jam > 0)
            const avgProdJam  = prodJamRows.length > 0
              ? prodJamRows.reduce((s: number, r: any) => s + r.prod_jam, 0) / prodJamRows.length
              : 0

            return {
              id:           u.id,
              code:         u.code,
              label:        u.label,
              format:       u.format,
              oee:          latest?.oee          ?? null,
              availability: latest?.availability ?? null,
              performance:  latest?.performance  ?? null,
              quality:      latest?.quality      ?? null,
              totProd:      latest?.total_es_keluar ?? 0,
              totRusak:     latest?.total_rusak     ?? 0,
              avgPerDay:    latest && (latest.jumlah_hari ?? 0) > 0
                              ? Math.round((latest.total_es_keluar ?? 0) / latest.jumlah_hari)
                              : 0,
              avgProdJam,
              days:         latest?.jumlah_hari ?? dailyRows.length,
              trend:        dailyRows.map((r: any) => ({ oee: r.oee ?? r.agg_oee ?? 0 })),
              plantColor:   cfg.color,
            }
          })
          return { id: p.id, code: p.code, name: p.name, location: p.location, ...cfg, units }
        })

        setPlants(builtPlants)

        // Build trend chart data (per bulan, per unit — 6 bulan terakhir)
        const bulanSet = new Set<string>()
        monthlyData.forEach(d => bulanSet.add(d.bulan))
        const sortedBulans = Array.from(bulanSet).sort().slice(-6)

        const trendRows = sortedBulans.map(bulan => {
          const row: any = { bulan }
          monthlyData.filter(d => d.bulan === bulan).forEach(d => {
            for (const plant of plantsData) {
              const unit = plant.production_units.find(u => u.id === d.unit_id)
              if (unit) {
                const key = unit.format === 'kristal'
                  ? `${plant.name} Kristal`
                  : plant.name === 'Ponorogo' ? `${plant.name} Balok` : plant.name
                row[key] = d.oee != null ? +(d.oee * 100).toFixed(1) : null
              }
            }
          })
          return row
        })
        setTrendData(trendRows)

        // Simpan ke cache
        try {
          sessionStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
            plants: builtPlants, trendData: trendRows, ts: Date.now(),
          }))
        } catch { /* storage full, skip */ }

      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: '#f5f7fa', color: '#1a1a1a',
      minHeight: '100vh', padding: 20,
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* FORMULA RIBBON */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '9px 18px', marginBottom: 20, fontSize: 11, color: '#6b7280',
        display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontWeight: 700, color: '#374151' }}>📐 Formula OEE:</span>
        <span><b>Availability</b> = ΣJam ÷ (Avg Mesin × 24 × n)</span>
        <span><b>Performance</b> = ΣProd ÷ (ΣJam × Avg Prod/Jam)</span>
        <span><b>Quality</b> = (ΣProd − ΣRusak) ÷ ΣProd</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0066ff' }}>OEE = A × P × Q</span>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, color: '#7f1d1d', fontSize: 13,
        }}>⚠ {error}</div>
      )}

      {/* LOADING */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 14 }}>
          ⏳ Memuat data dari database...
        </div>
      ) : plants.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, background: '#fff',
          borderRadius: 16, border: '1.5px dashed #93c5fd', color: '#6b7280',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧊</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Belum ada data</div>
          <div style={{ fontSize: 12 }}>Upload file XLSX di halaman detail masing-masing pabrik untuk mulai menampilkan data.</div>
        </div>
      ) : (
        <>
          <SummaryBanner plants={plants} />
          {trendData.length > 0 && <ComparisonChart trendData={trendData} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {plants.map((plant, i) => (
              <PlantCard key={plant.id} plant={plant} index={i} />
            ))}
          </div>
        </>
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', paddingTop: 24, paddingBottom: 8 }}>
        OEE = Availability × Performance × Quality &nbsp;·&nbsp; Target World Class ≥ 85%
        &nbsp;·&nbsp; PMP Ice Plant Monitoring System
      </div>
    </div>
  )
}