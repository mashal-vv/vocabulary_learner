/**
 * src/hooks/useVault.tsx
 *
 * Context provider for vault state.
 * On boot: attempts to restore a previous session via refresh token (sessionStorage).
 * If Supabase is not configured, shows a helpful error rather than a local fallback.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  fetchRemoteVaultStatus,
  lockVault,
  readLocalVaultMeta,
  restoreSessionFromStorage,
  setupVault,
  unlockVault,
  type VaultStatus,
} from '@/services/supabase/vault'
import { isSupabaseConfigured } from '@/services/supabase/client'

type VaultContextValue = {
  status: VaultStatus
  userId: string | null
  cloudEnabled: boolean
  setup: (passphrase: string) => Promise<void>
  unlock: (passphrase: string) => Promise<void>
  lock: () => Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>('loading')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        // 1. Try to restore session from sessionStorage refresh token
        const restored = await restoreSessionFromStorage()
        if (restored && !cancelled) {
          setUserId(restored.userId)
          setStatus('unlocked')
          return
        }

        // 2. Check remote vault status (requires network)
        if (isSupabaseConfigured()) {
          const remote = await fetchRemoteVaultStatus()
          if (cancelled) return
          if (!remote.reachable) {
            // Network unavailable — check if we have a cached userId from a previous session
            const local = await readLocalVaultMeta()
            if (local.userId) {
              // User has unlocked before on this device; show unlock screen
              setStatus('locked')
            } else {
              // No prior session at all; we can't determine state
              setStatus('needs_setup')
            }
            return
          }
          setStatus(remote.setupComplete ? 'locked' : 'needs_setup')
        } else {
          // Supabase not configured at all
          setStatus('needs_setup')
        }
      } catch {
        if (!cancelled) setStatus('needs_setup')
      }
    }

    void boot()
    return () => { cancelled = true }
  }, [])

  const setup = useCallback(async (passphrase: string) => {
    const id = await setupVault(passphrase)
    setUserId(id)
    setStatus('unlocked')
  }, [])

  const unlock = useCallback(async (passphrase: string) => {
    const id = await unlockVault(passphrase)
    setUserId(id)
    setStatus('unlocked')
  }, [])

  const lock = useCallback(async () => {
    await lockVault()
    setUserId(null)
    setStatus('locked')
  }, [])

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      userId,
      cloudEnabled: isSupabaseConfigured(),
      setup,
      unlock,
      lock,
    }),
    [status, userId, setup, unlock, lock],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const value = useContext(VaultContext)
  if (!value) throw new Error('useVault must be used within VaultProvider')
  return value
}
