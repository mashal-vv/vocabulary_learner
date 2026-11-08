import { db } from '@/db/database'
import { encodePassphraseRecord, sha256Hex, verifyPassphrase } from '@/lib/crypto'
import { evaluateUnlockAttempts } from '@/lib/rateLimit'
import { functionsUrl, getSupabase, isSupabaseConfigured } from '@/services/supabase/client'

export type VaultStatus = 'loading' | 'needs_setup' | 'locked' | 'unlocked'

const LOCAL_ATTEMPTS_KEY = 'unlock_attempts'

type Session = {
  accessToken: string
  refreshToken?: string
  userId: string
  expiresAt: number
}

let memorySession: Session | null = null

export function getMemorySession() {
  return memorySession
}

export async function readLocalVaultMeta() {
  const userId = await db.vaultMeta.get('userId')
  const hash = await db.vaultMeta.get('passphraseHash')
  return {
    userId: userId?.value,
    passphraseHash: hash?.value,
    setupComplete: Boolean(userId?.value && hash?.value),
  }
}

async function readAttempts() {
  const row = await db.vaultMeta.get(LOCAL_ATTEMPTS_KEY)
  if (!row?.value) return []
  try {
    return JSON.parse(row.value) as { attemptedAt: number; success: boolean }[]
  } catch {
    return []
  }
}

async function writeAttempts(attempts: { attemptedAt: number; success: boolean }[]) {
  await db.vaultMeta.put({ key: LOCAL_ATTEMPTS_KEY, value: JSON.stringify(attempts.slice(-20)) })
}

async function applySession(session: Session) {
  memorySession = session
  const supabase = getSupabase()
  if (supabase && session.refreshToken) {
    await supabase.auth.setSession({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
    })
  }
  sessionStorage.setItem(
    'lexicon_session',
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
      expiresAt: session.expiresAt,
    }),
  )
}

export function restoreSessionFromStorage() {
  const raw = sessionStorage.getItem('lexicon_session')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Session
    if (parsed.expiresAt > Date.now() + 5_000) {
      memorySession = parsed
      return parsed
    }
  } catch {
    sessionStorage.removeItem('lexicon_session')
  }
  return null
}

async function callVaultFunction(name: string, body: Record<string, unknown>) {
  const endpoint = functionsUrl(name)
  const supabase = getSupabase()
  if (!endpoint || !supabase) {
    throw new Error('Cloud vault is not configured.')
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Vault request failed.')
  }
  return data
}

export async function fetchRemoteVaultStatus() {
  if (!isSupabaseConfigured()) return { configured: false, setupComplete: false }
  try {
    const data = await callVaultFunction('vault-status', {})
    return {
      configured: true,
      setupComplete: Boolean(data.setupComplete),
    }
  } catch {
    return { configured: true, setupComplete: false, unreachable: true }
  }
}

export async function setupVault(passphrase: string) {
  if (passphrase.trim().length < 8) {
    throw new Error('Use a passphrase of at least 8 characters.')
  }
  if (isSupabaseConfigured()) {
    const data = await callVaultFunction('vault-setup', { passphrase })
    const userId = String(data.userId)
    await db.vaultMeta.put({ key: 'userId', value: userId })
    await applySession({
      accessToken: String(data.accessToken),
      refreshToken: data.refreshToken ? String(data.refreshToken) : undefined,
      userId,
      expiresAt: Number(data.expiresAt ?? Date.now() + 14 * 60_000),
    })
    return userId
  }
  const record = await encodePassphraseRecord(passphrase)
  const userId = crypto.randomUUID()
  await db.vaultMeta.bulkPut([
    { key: 'userId', value: userId },
    { key: 'passphraseHash', value: record },
  ])
  await applySession({
    accessToken: 'local',
    userId,
    expiresAt: Date.now() + 12 * 60 * 60_000,
  })
  return userId
}

export async function unlockVault(passphrase: string) {
  const attempts = await readAttempts()
  const limit = evaluateUnlockAttempts(attempts)
  if (!limit.allowed) {
    throw new Error(`Too many attempts. Try again in ${limit.retryAfterSeconds} seconds.`)
  }

  try {
    if (isSupabaseConfigured()) {
      const data = await callVaultFunction('vault-unlock', { passphrase })
      const userId = String(data.userId)
      await db.vaultMeta.put({ key: 'userId', value: userId })
      await applySession({
        accessToken: String(data.accessToken),
        refreshToken: data.refreshToken ? String(data.refreshToken) : undefined,
        userId,
        expiresAt: Number(data.expiresAt ?? Date.now() + 14 * 60_000),
      })
      attempts.push({ attemptedAt: Date.now(), success: true })
      await writeAttempts(attempts)
      return userId
    }

    const meta = await readLocalVaultMeta()
    if (!meta.passphraseHash || !meta.userId) {
      throw new Error('The vault has not been set up yet.')
    }
    const ok = await verifyPassphrase(passphrase, meta.passphraseHash)
    attempts.push({ attemptedAt: Date.now(), success: ok })
    await writeAttempts(attempts)
    if (!ok) throw new Error('That passphrase does not match.')
    await applySession({
      accessToken: 'local',
      userId: meta.userId,
      expiresAt: Date.now() + 12 * 60 * 60_000,
    })
    return meta.userId
  } catch (error) {
    if (!(error instanceof Error && error.message.includes('Too many'))) {
      const failed = [...attempts, { attemptedAt: Date.now(), success: false }]
      await writeAttempts(failed)
    }
    throw error
  }
}

export async function lockVault() {
  const session = memorySession
  memorySession = null
  sessionStorage.removeItem('lexicon_session')
  const supabase = getSupabase()
  if (supabase) await supabase.auth.signOut()
  if (isSupabaseConfigured() && session?.refreshToken) {
    try {
      await callVaultFunction('vault-lock', {
        refreshTokenHash: await sha256Hex(session.refreshToken),
      })
    } catch {
      // Local lock still succeeds if the network is unavailable.
    }
  }
}

export async function refreshVaultSession() {
  const session = memorySession ?? restoreSessionFromStorage()
  if (!session) return null
  if (!isSupabaseConfigured() || session.accessToken === 'local') return session
  if (session.expiresAt > Date.now() + 30_000) return session
  const data = await callVaultFunction('vault-refresh', {
    refreshToken: session.refreshToken,
  })
  const next: Session = {
    accessToken: String(data.accessToken),
    refreshToken: data.refreshToken ? String(data.refreshToken) : session.refreshToken,
    userId: String(data.userId ?? session.userId),
    expiresAt: Number(data.expiresAt ?? Date.now() + 14 * 60_000),
  }
  await applySession(next)
  return next
}
