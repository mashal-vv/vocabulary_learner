/**
 * vault-setup/index.ts
 *
 * First-time vault initialization.
 *
 * Security model:
 * - Passphrase is received over HTTPS and never stored.
 * - auth_password is derived server-side via PBKDF2 (600k iterations, purpose-separated).
 * - auth_password becomes the Supabase Auth user's password — never sent to the client.
 * - The vault_config row stores only: user_id and salt (no passphrase, no hash).
 * - On any error, the created Auth user is cleaned up.
 * - Only one vault can ever be created (CHECK id = 1 on vault_config).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { fromHex, pbkdf2Derive, randomBytes, toHex } from '../_shared/pbkdf2.ts'
import { checkRateLimit, recordAttempt } from '../_shared/rateLimit.ts'

// The fixed email used for the single vault Auth user.
// It is not user-visible and cannot be used for password-reset flows.
const VAULT_EMAIL = 'vault@lexicon.internal'
// PBKDF2 iterations for deriving the auth password
const AUTH_ITERATIONS = 600_000
// Domain string for the auth key (prevents cross-purpose key reuse)
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

  // Rate limit check
  const rateLimit = await checkRateLimit(adminClient)
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ error: `Too many attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Check if vault is already initialized
  const { count, error: countError } = await adminClient
    .from('vault_config')
    .select('id', { count: 'exact', head: true })

  if (countError) {
    return new Response(JSON.stringify({ error: 'Could not verify vault status.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if ((count ?? 0) > 0) {
    return new Response(
      JSON.stringify({ error: 'Vault already initialized. Use the unlock page instead.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Generate salt and derive auth password
  const salt = randomBytes(32)
  const authPasswordBytes = await pbkdf2Derive(passphrase, salt, AUTH_PURPOSE, AUTH_ITERATIONS)
  const authPassword = toHex(authPasswordBytes) // 64-char hex string

  let createdUserId: string | null = null

  try {
    // Create the Supabase Auth user
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email: VAULT_EMAIL,
      password: authPassword,
      email_confirm: true,
    })

    if (createError || !userData.user) {
      await recordAttempt(adminClient, false)
      return new Response(JSON.stringify({ error: `Could not create vault: ${createError?.message ?? 'Unknown error'}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    createdUserId = userData.user.id

    // Store vault config (single row, id=1 enforced by CHECK constraint)
    const { error: configError } = await adminClient.from('vault_config').insert({
      id: 1,
      user_id: createdUserId,
      salt: toHex(salt),
    })

    if (configError) {
      // Cleanup: delete the user we just created
      await adminClient.auth.admin.deleteUser(createdUserId)
      await recordAttempt(adminClient, false)
      // If this is a unique violation, another concurrent setup call won the race
      const isDuplicate = configError.code === '23505' || configError.message?.includes('duplicate')
      return new Response(
        JSON.stringify({ error: isDuplicate ? 'Vault already initialized.' : `Setup failed: ${configError.message}` }),
        { status: isDuplicate ? 409 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Sign in with the public client to get a user-scoped JWT
    const publicClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })

    const { data: sessionData, error: signInError } = await publicClient.auth.signInWithPassword({
      email: VAULT_EMAIL,
      password: authPassword,
    })

    if (signInError || !sessionData.session) {
      // Vault is created but we can't sign in — the user will need to unlock normally
      await recordAttempt(adminClient, false)
      return new Response(JSON.stringify({ error: 'Vault created but initial sign-in failed. Please use the unlock page.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await recordAttempt(adminClient, true)

    return new Response(
      JSON.stringify({
        userId: createdUserId,
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
        expiresAt: new Date(sessionData.session.expires_at! * 1000).getTime(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    // Cleanup on unexpected error
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId).catch(() => {})
    }
    await recordAttempt(adminClient, false)
    return new Response(JSON.stringify({ error: `Unexpected error: ${String(err)}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
