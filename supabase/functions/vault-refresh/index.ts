/**
 * vault-refresh/index.ts
 *
 * Refreshes an expired access token using a refresh token.
 * Called automatically by the frontend when the access token is about to expire.
 * No passphrase required — the refresh token is the credential.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  let refreshToken: string
  try {
    const body = await req.json() as { refreshToken?: string }
    refreshToken = (body.refreshToken ?? '').trim()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!refreshToken) {
    return new Response(JSON.stringify({ error: 'refreshToken is required.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await publicClient.auth.refreshSession({ refresh_token: refreshToken })

  if (error || !data.session) {
    return new Response(
      JSON.stringify({ error: 'Session expired. Please unlock the vault again.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({
      userId: data.user?.id ?? '',
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: new Date(data.session.expires_at! * 1000).getTime(),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
