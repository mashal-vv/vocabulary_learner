import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isSupabaseConfigured() {
  return Boolean(url && anonKey)
}

/**
 * Returns an unauthenticated Supabase client for auth operations.
 * For authenticated data operations, use getAuthenticatedClient() from vault.ts.
 */
export function getSupabase() {
  if (!isSupabaseConfigured()) return null
  return createClient(url!, anonKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export function functionsUrl(name: string) {
  if (!url) return null
  return `${url.replace(/\/$/, '')}/functions/v1/${name}`
}
