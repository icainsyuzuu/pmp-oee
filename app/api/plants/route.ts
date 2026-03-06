import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Tambah timeout 8 detik agar tidak hang
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const { data, error } = await supabase
      .from('plants')
      .select(`
        id, code, name, location,
        production_units ( id, code, label, format )
      `)
      .order('id')
      .abortSignal(controller.signal)

    clearTimeout(timeout)

    if (error) {
      console.error('[Plants] Supabase error:', error.code, error.message, error.details)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
    }

    console.log(`[Plants] OK — ${data?.length ?? 0} plants`)
    return NextResponse.json(data ?? [])
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError'
    console.error('[Plants] Error:', isTimeout ? 'TIMEOUT' : err.message)
    return NextResponse.json(
      { error: isTimeout ? 'Database timeout — periksa koneksi Supabase.' : err.message },
      { status: 500 }
    )
  }
}