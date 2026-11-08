/**
 * vault-lock/index.ts
 *
 * Best-effort server-side sign-out.
 * Revokes the Supabase session for the given refresh token.
 * This is called fire-and-forget by the client — failures don't block local lock.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  try {
    const body = await req.json() as { refreshToken?: string }
    if (!body.refreshToken) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    // Sign out using the refresh token
    await supabase.auth.refreshSession({ refresh_token: body.refreshToken })
    await supabase.auth.signOut()
  } catch {
    // Best-effort — always return success so the client proceeds with local lock
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
