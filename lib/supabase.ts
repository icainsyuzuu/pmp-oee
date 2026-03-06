import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: (url, options) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000) // 10s global timeout
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer))
    },
  },
})