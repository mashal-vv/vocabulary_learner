/**
 * vault-unlock/index.ts
 *
 * Authenticates an existing vault using the passphrase.
 *
 * Security model:
 * - Fetches the stored salt from vault_config (service role, inaccessible to clients).
 * - Re-derives the same auth_password server-side — deterministic from passphrase + salt.
 * - Calls signInWithPassword with the derived password (never the raw passphrase).
 * - On incorrect passphrase, Supabase Auth returns 400; we return 401 to the client.
 * - Every attempt (success or failure) is recorded for rate limiting.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { fromHex, pbkdf2Derive, toHex } from '../_shared/pbkdf2.ts'
import { checkRateLimit, recordAttempt } from '../_shared/rateLimit.ts'

const VAULT_EMAIL = 'vault@lexicon.internal'
const AUTH_ITERATIONS = 600_000
const AUTH_PURPOSE = 'lexicon:auth:v1'

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  // Parse and validate body
  let passphrase: string
  try {
    const body = await req.json() as { passphrase?: string }
    passphrase = (body.passphrase ?? '').trim()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (passphrase.length < 8) {
    return new Response(JSON.stringify({ error: 'Passphrase must be at least 8 characters.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Rate limit check — evaluated before any crypto work
  const rateLimit = await checkRateLimit(adminClient)
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: `Too many failed attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Fetch vault config (service role only — no RLS policy exposes this table)
  const { data: configRows, error: configError } = await adminClient
    .from('vault_config')
    .select('user_id, salt')
    .eq('id', 1)
    .limit(1)

  if (configError || !configRows || configRows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Vault not initialized. Set up a passphrase first.' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { user_id: userId, salt: saltHex } = configRows[0] as { user_id: string; salt: string }

  // Re-derive the auth password from the passphrase + stored salt
  let authPassword: string
  try {
    const saltBytes = fromHex(saltHex)
    const authPasswordBytes = await pbkdf2Derive(passphrase, saltBytes, AUTH_PURPOSE, AUTH_ITERATIONS)
    authPassword = toHex(authPasswordBytes)
  } catch {
    await recordAttempt(adminClient, false)
    return new Response(JSON.stringify({ error: 'Internal error during key derivation.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Attempt sign-in with the derived password
  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: sessionData, error: signInError } = await publicClient.auth.signInWithPassword({
    email: VAULT_EMAIL,
    password: authPassword,
  })

  if (signInError || !sessionData.session) {
    // Wrong passphrase or other auth error
    await recordAttempt(adminClient, false)
    return new Response(
      JSON.stringify({ error: 'Incorrect passphrase.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  await recordAttempt(adminClient, true)

  return new Response(
    JSON.stringify({
      userId,
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      expiresAt: new Date(sessionData.session.expires_at! * 1000).getTime(),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
