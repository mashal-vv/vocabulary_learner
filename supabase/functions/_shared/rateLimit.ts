/**
 * Rate limiting using the auth_attempts table.
 *
 * Policy: 5 failures within any rolling 15-minute window → block.
 * On DB error, fail open (allow) so users are never permanently locked out.
 */

// deno-lint-ignore-file no-explicit-any

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

export async function checkRateLimit(
  adminClient: SupabaseClient,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  try {
    const windowStart = new Date(Date.now() - WINDOW_MS).toISOString()
    const { data, error } = await adminClient
      .from('auth_attempts')
      .select('attempted_at, success')
      .gte('attempted_at', windowStart)
      .order('attempted_at', { ascending: true })

    if (error) return { allowed: true, retryAfterSeconds: 0 } // fail open

    const attempts = (data ?? []) as { attempted_at: string; success: boolean }[]
    const failures = attempts.filter((a) => !a.success)

    if (failures.length < MAX_FAILURES) {
      return { allowed: true, retryAfterSeconds: 0 }
    }

    // Find oldest failure to calculate retry window
    const oldest = failures[0]
    if (!oldest) return { allowed: true, retryAfterSeconds: 0 }
    const oldestMs = new Date(oldest.attempted_at).getTime()
    const retryAfterMs = oldestMs + WINDOW_MS - Date.now()
    const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))

    return { allowed: false, retryAfterSeconds }
  } catch {
    return { allowed: true, retryAfterSeconds: 0 } // fail open on error
  }
}

export async function recordAttempt(
  adminClient: SupabaseClient,
  success: boolean,
): Promise<void> {
  try {
    await adminClient.from('auth_attempts').insert({ success })
    // Prune old attempts (keep last 100) to avoid unbounded growth
    await adminClient.rpc('prune_auth_attempts' as any).maybeSingle().catch(() => {
      // If the RPC doesn't exist, do a manual prune
      return adminClient
        .from('auth_attempts')
        .delete()
        .lt('attempted_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    })
  } catch {
    // Non-fatal — rate limit recording failure should not block auth
  }
}
