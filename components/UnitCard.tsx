'use client'

import { pct, numFmt, statusColor, statusLabel, pillStyle } from '@/lib/oee-calculator'
import { DonutGauge } from './GaugeCard'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

export interface UnitData {
  id:           number
  code:         string
  label:        string
  format:       string
  oee:          number | null
  availability: number | null
  performance:  number | null
  quality:      number | null
  totProd:      number
  totRusak:     number
  avgPerDay:    number
  avgProdJam:   number
  days:         number
  trend:        { oee: number }[]
  plantColor:   string
}

interface UnitCardProps {
  unit: UnitData
}

export function UnitCard({ unit }: UnitCardProps) {
  const { oee, availability, performance, quality,
          totProd, totRusak, avgPerDay, avgProdJam,
          days, trend, label, format, plantColor } = unit

  const color = format === 'kristal' ? '#8b5cf6' : plantColor
  const sc    = statusColor(oee)
  const { bg, fg } = pillStyle(sc)

  return (
    <div style={{
      background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden', flex: 1, minWidth: 0,
    }}>
      {/* Header */}
      <div style={{
        background: color, padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 16 }}>{format === 'kristal' ? '❄️' : '🧊'}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{label}</span>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
          background: 'rgba(255,255,255,0.2)', color: '#fff',
        }}>{days} Hari</span>
      </div>

      <div style={{ padding: 16 }}>
        {/* Gauge + metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
            <DonutGauge value={oee} color={sc} size={80} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', lineHeight: 1 }}>
                {pct(oee, 1)}
              </span>
              <span style={{ fontSize: 8, color: '#9ca3af', marginTop: 1 }}>OEE</span>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: bg, color: fg, display: 'inline-block', marginBottom: 8,
            }}>{statusLabel(oee)}</span>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px' }}>
              {([
                ['Avail',   availability, '#3b82f6'],
                ['Perf',    performance,  '#f59e0b'],
                ['Quality', quality,      '#10b981'],
                ['Prod/Jam', avgProdJam,  color, true],
              ] as [string, number | null, string, boolean?][]).map(([l, v, c, isRaw]) => (
                <div key={l}>
                  <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 1.2 }}>{l}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: c, lineHeight: 1.4 }}>
                    {isRaw ? `${(v as number).toFixed(1)} bal` : pct(v as number | null)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sub stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
          {([
            ['Total Prod',  numFmt(totProd)  + ' bal', '#1a1a1a'],
            ['Total Rusak', numFmt(totRusak) + ' bal', '#ef4444'],
            ['Avg/Hari',    numFmt(avgPerDay)+ ' bal', color],
          ] as [string, string, string][]).map(([l, v, c]) => (
            <div key={l} style={{
              background: '#f9fafb', borderRadius: 7, padding: '7px 8px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>

        {/* Sparkline */}
        {trend.length > 1 && (
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
            <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 3 }}>Tren OEE</div>
            <ResponsiveContainer width="100%" height={36}>
              <AreaChart data={trend.map((d, i) => ({ i, v: +(d.oee * 100).toFixed(1) }))}>
                <defs>
                  <linearGradient id={`spark-${unit.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                  fill={`url(#spark-${unit.id})`} dot={false} connectNulls isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
