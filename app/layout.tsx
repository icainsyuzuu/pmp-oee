import type { Metadata } from 'next'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'OEE Command Center — PMP Ice Plant',
  description: 'Monitoring OEE Pabrik Es PT Pilar Maju Persada — Ponorogo, Pakis, Tuban',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, padding: 0, background: '#f5f7fa', fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
        <Navbar />
        <main>
          {children}
        </main>
      </body>
    </html>
  )
}