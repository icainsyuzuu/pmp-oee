'use client'

import { pct, statusColor, statusLabel, pillStyle } from '@/lib/oee-calculator'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

/* ─── DONUT GAUGE ─── */
interface DonutGaugeProps {
  value: number | null
  color: string
  size?: number
}
export function DonutGauge({ value, color, size = 100 }: DonutGaugeProps) {
  const r = 38, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r
  const safe = value != null ? Math.min(1, Math.max(0, value)) : 0
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={9} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={9}
        strokeDasharray={`${safe * circ} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.7s ease' }} />
    </svg>
  )
}

/* ─── GAUGE CARD ─── */
interface GaugeCardProps {
  label:      string
  value:      number | null
  sparkData?: (number | null | undefined)[]
  color:      string
  sublabel?:  string
}
export function GaugeCard({ label, value, sparkData = [], color, sublabel }: GaugeCardProps) {
  const sc = statusColor(value)
  const { bg, fg } = pillStyle(sc)

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '20px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #e5e7eb',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{label}</div>

      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <DonutGauge value={value} color={color} size={100} />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>
            {pct(value, 1)}
          </span>
        </div>
      </div>

      <span style={{
        fontSize: 11, fontWeight: 600, padding: '3px 10px',
        borderRadius: 20, background: bg, color: fg,
      }}>
        {statusLabel(value)}
      </span>

      {sublabel && <div style={{ fontSize: 11, color: '#6b7280' }}>{sublabel}</div>}

      {sparkData.length > 1 && (
        <div style={{ width: '100%', height: 32 }}>
          <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={sparkData.map((v, i) => ({
              i, v: v != null ? +(v * 100).toFixed(1) : null,
            }))}>
              <defs>
                <linearGradient id={`sg-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                fill={`url(#sg-${label.replace(/\s/g, '')})`}
                dot={false} connectNulls isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}