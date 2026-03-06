'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '/',          label: 'Dashboard',  icon: '📊' },
  { href: '/ponorogo',  label: 'Ponorogo',   icon: '🏭' },
  { href: '/pakis',     label: 'Pakis',      icon: '🏗'  },
  { href: '/tuban',     label: 'Tuban',      icon: '⚙️' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .nav-link { transition: background 0.15s, color 0.15s; }
        .nav-link:hover { background: #f5f7fa !important; }
      `}</style>

      <div style={{
        maxWidth: 1400, margin: '0 auto',
        padding: '0 20px',
        display: 'flex', alignItems: 'center',
        height: 56,
        gap: 8,
      }}>

        {/* LOGO */}
<Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 12 }}>
  <img
    src="/pmpGroup.png"
    alt="PMPGroup Logo"
    style={{ width: 34, height: 34, objectFit: 'contain' }}
  />
  <div style={{ lineHeight: 1.2 }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a', fontFamily: 'DM Sans, sans-serif' }}>
      PMP Ice Plant
    </div>
    <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 500 }}>
      OEE Monitoring System
    </div>
  </div>
</Link>
        {/* DIVIDER */}
        <div style={{ width: 1, height: 24, background: '#e5e7eb', marginRight: 4 }} />

        {/* NAV LINKS */}
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {NAV_LINKS.map(({ href, label, icon }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className="nav-link"
                style={{
                  textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  fontFamily: 'DM Sans, sans-serif',
                  color:      isActive ? '#0066ff' : '#4b5563',
                  background: isActive ? '#eff6ff'  : 'transparent',
                  borderBottom: isActive ? '2px solid #0066ff' : '2px solid transparent',
                }}
              >
                <span style={{ fontSize: 15 }}>{icon}</span>
                {label}
              </Link>
            )
          })}
        </div>

        {/* RIGHT — LIVE BADGE + DATE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: '#d1fae5', borderRadius: 20,
            padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#065f46',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#10b981', animation: 'pulse 2s infinite',
            }} />
            Live
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600, color: '#6b7280' }}>
              {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            <div>3 Pabrik · 4 Unit</div>
          </div>
        </div>

      </div>
    </nav>
  )
}