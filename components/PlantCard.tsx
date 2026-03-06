'use client'

import { useRouter } from 'next/navigation'
import { pct, numFmt, statusColor, statusLabel, pillStyle } from '@/lib/oee-calculator'
import { UnitCard, UnitData } from './UnitCard'

export interface PlantData {
  id:       number
  code:     string
  name:     string
  location: string
  color:    string
  accent:   string
  icon:     string
  units:    UnitData[]
}

interface PlantCardProps {
  plant: PlantData
  index: number
}

export function PlantCard({ plant, index }: PlantCardProps) {
  const router = useRouter()
  const allOEE = plant.units.map(u => u.oee).filter(v => v != null) as number[]
  const avgOEE = allOEE.length ? allOEE.reduce((a, b) => a + b, 0) / allOEE.length : null
  const sc     = statusColor(avgOEE)
  const { bg, fg } = pillStyle(sc)

  const totProdAll  = plant.units.reduce((s, u) => s + u.totProd, 0)
  const totRusakAll = plant.units.reduce((s, u) => s + u.totRusak, 0)
  const defRate     = totProdAll > 0 ? totRusakAll / totProdAll : 0

  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden',
      animation: `fadeUp 0.4s ease ${index * 0.1}s both`,
    }}>
      {/* Plant header */}
      <div style={{
        background: `linear-gradient(135deg, ${plant.color} 0%, ${plant.color}cc 100%)`,
        padding: '18px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>{plant.icon}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.3 }}>
              {plant.name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
              Pabrik Es PMP {plant.name} · {plant.location}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
            {pct(avgOEE)}
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: 'rgba(255,255,255,0.25)', color: '#fff', marginTop: 4, display: 'inline-block',
          }}>
            OEE {plant.units.length > 1 ? 'Rata-rata' : ''} · {statusLabel(avgOEE)}
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', background: plant.accent }}>
        {([
          { label: 'Total Produksi', value: numFmt(totProdAll) + ' bal', icon: '📦' },
          { label: 'Total Rusak',    value: numFmt(totRusakAll) + ' bal', icon: '⚠️' },
          { label: 'Defect Rate',    value: pct(defRate, 2),              icon: '📊' },
          { label: 'Jumlah Unit',    value: `${plant.units.length} Unit`, icon: '🔧' },
        ]).map((stat, i) => (
          <div key={i} style={{
            flex: 1, padding: '10px 16px', textAlign: 'center',
            borderRight: i < 3 ? '1px solid #e5e7eb' : 'none',
          }}>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>
              {stat.icon} {stat.label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: plant.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Unit cards */}
      <div style={{ padding: 16, display: 'flex', gap: 14 }}>
        {plant.units.map(unit => (
          <UnitCard key={unit.id} unit={unit} />
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{
        padding: '12px 20px', borderTop: '1px solid #f3f4f6',
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <button
          onClick={() => router.push(`/${plant.code}`)}
          style={{
            padding: '8px 18px', background: plant.color, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Detail Dashboard →
        </button>
      </div>
    </div>
  )
}
