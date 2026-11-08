/**
 * src/services/supabase/vault.ts
 *
 * Secure vault service — Supabase is the SINGLE source of truth.
 *
 * Authentication flow:
 *   - vault-setup Edge Function:  passphrase → server-side PBKDF2 → Supabase Auth user (once)
 *   - vault-unlock Edge Function: passphrase → server-side PBKDF2 → signInWithPassword → JWT
 *   - The same passphrase always produces the same Supabase auth.uid() on every device.
 *
 * Session storage:
 *   - Access token: memory only (never persisted)
 *   - Refresh token: sessionStorage only (cleared on tab/window close)
 *   - userId: IndexedDB (non-sensitive, used only as a cache key)
 *   - Passphrase: NEVER stored anywhere
 *   - Passphrase hash: NEVER stored client-side (server handles this)
 */

import { createClient } from '@supabase/supabase-js'
import { db } from '@/db/database'
import { functionsUrl, isSupabaseConfigured } from '@/services/supabase/client'

export type VaultStatus = 'loading' | 'needs_setup' | 'locked' | 'unlocked'

// ─── Types ────────────────────────────────────────────────────────────────────

type Session = {
  /** Short-lived Supabase JWT — memory only */
  accessToken: string
  /** Refresh token — sessionStorage only, cleared on tab close */
  refreshToken: string
  userId: string
  /** Unix ms timestamp of access token expiry */
  expiresAt: number
}

type VaultFunctionResponse = {
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

// ─── In-memory session ────────────────────────────────────────────────────────

/** Access token lives ONLY in memory. Never in localStorage or IndexedDB. */
let memorySession: Session | null = null

export function getMemorySession(): Session | null {
  return memorySession
}

/** Returns a Supabase client authenticated as the current vault user. */
export function getAuthenticatedClient() {
  if (!memorySession) return null
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!url || !anonKey) return null
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${memorySession.accessToken}`,
      },
    },
  })
}

// ─── Session helpers ──────────────────────────────────────────────────────────

const SESSION_KEY = 'lexicon_refresh'

function writeSession(session: Session) {
  memorySession = session
  // Only the refresh token is persisted, in sessionStorage (cleared on tab close).
  // The access token is never persisted.
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        refreshToken: session.refreshToken,
        userId: session.userId,
        expiresAt: session.expiresAt,
      }),
    )
  } catch {
    // sessionStorage unavailable — memory-only session is fine
  }
}

function clearSession() {
  memorySession = null
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

/** Attempts to restore a previous session from sessionStorage using the refresh token. */
export async function restoreSessionFromStorage(): Promise<Session | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as { refreshToken: string; userId: string; expiresAt: number }
    if (!stored.refreshToken || !stored.userId) return null

    // Always attempt a token refresh on restore — the access token was never persisted
    const refreshed = await refreshVaultSession(stored.refreshToken, stored.userId)
    return refreshed
  } catch {
    clearSession()
    return null
  }
}

// ─── Edge Function caller ─────────────────────────────────────────────────────

async function callVaultFunction(name: string, body: Record<string, unknown>): Promise<VaultFunctionResponse> {
  const endpoint = functionsUrl(name)
  if (!endpoint) throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL.')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Supabase Edge Functions require the anon key as Bearer token
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })

  let data: Record<string, unknown> = {}
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    // empty body
  }

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : `Request failed (${response.status})`
    throw new Error(message)
  }

  return {
    userId: String(data.userId ?? ''),
    accessToken: String(data.accessToken ?? ''),
    refreshToken: String(data.refreshToken ?? ''),
    expiresAt: Number(data.expiresAt ?? Date.now() + 55 * 60_000),
  }
}

// ─── Public vault operations ──────────────────────────────────────────────────

/**
 * Checks whether the vault has been initialized on the server.
 * Called on app boot to decide whether to show Setup or Unlock.
 */
export async function fetchRemoteVaultStatus(): Promise<{ setupComplete: boolean; reachable: boolean }> {
  if (!isSupabaseConfigured()) return { setupComplete: false, reachable: false }
  try {
    const endpoint = functionsUrl('vault-status')
    if (!endpoint) return { setupComplete: false, reachable: false }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({}),
    })
    if (!response.ok) return { setupComplete: false, reachable: true }
    const data = (await response.json()) as { setupComplete: boolean }
    return { setupComplete: Boolean(data.setupComplete), reachable: true }
  } catch {
    return { setupComplete: false, reachable: false }
  }
}

/**
 * First-time vault initialization.
 * Creates a Supabase Auth user server-side and stores the vault identity.
 * Throws if the vault is already initialized.
 */
export async function setupVault(passphrase: string): Promise<string> {
  if (passphrase.trim().length < 8) {
    throw new Error('Use a passphrase of at least 8 characters.')
  }
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is required for vault setup. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.')
  }

  const result = await callVaultFunction('vault-setup', { passphrase })

  // Store userId in IndexedDB as a non-sensitive cache key
  await db.vaultMeta.bulkPut([
    { key: 'userId', value: result.userId },
  ])
  writeSession(result)

  return result.userId
}

/**
 * Unlocks the vault using the passphrase.
 * The passphrase is sent to the Edge Function over HTTPS; the server
 * verifies it and returns a time-limited JWT.
 */
export async function unlockVault(passphrase: string): Promise<string> {
  if (passphrase.trim().length < 8) {
    throw new Error('Passphrase must be at least 8 characters.')
  }
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. This app requires a network connection to unlock.')
  }

  const result = await callVaultFunction('vault-unlock', { passphrase })

  await db.vaultMeta.put({ key: 'userId', value: result.userId })
  writeSession(result)

  return result.userId
}

/**
 * Refreshes the access token using a refresh token.
 * Returns the new session, or null if the refresh token is invalid.
 */
export async function refreshVaultSession(
  refreshToken: string,
  existingUserId?: string,
): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const result = await callVaultFunction('vault-refresh', { refreshToken })
    const session: Session = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || refreshToken,
      userId: result.userId || existingUserId || '',
      expiresAt: result.expiresAt,
    }
    writeSession(session)
    return session
  } catch {
    clearSession()
    return null
  }
}

/**
 * Ensures the current access token is valid, refreshing if needed.
 * Call this before any Supabase operation that requires auth.
 */
export async function ensureValidSession(): Promise<Session | null> {
  if (!memorySession) return null
  // Refresh if the token expires within 60 seconds
  if (memorySession.expiresAt > Date.now() + 60_000) return memorySession
  return refreshVaultSession(memorySession.refreshToken, memorySession.userId)
}

/**
 * Locks the vault by clearing the in-memory session and sessionStorage.
 * Supabase-side sign-out is best-effort (fires and forgets).
 */
export async function lockVault(): Promise<void> {
  const session = memorySession
  clearSession()
  // Clear cached userId from IndexedDB (it will be re-fetched on next unlock)
  // We keep it to avoid confusion — it is non-sensitive
  if (session) {
    // Best-effort server-side sign-out; ignore errors
    try {
      const endpoint = functionsUrl('vault-lock')
      if (endpoint) {
        void fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        })
      }
    } catch {
      // Lock is local regardless of server response
    }
  }
}

/**
 * Reads the cached userId from IndexedDB.
 * Used during boot to check whether a userId was previously stored
 * (indicates a previously initialized vault on this device).
 */
export async function readLocalVaultMeta(): Promise<{ userId?: string; setupComplete: boolean }> {
  const userId = await db.vaultMeta.get('userId')
  return {
    userId: userId?.value,
    setupComplete: Boolean(userId?.value),
  }
}
