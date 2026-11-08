import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
      const restored = restoreSessionFromStorage()
      if (restored) {
        if (!cancelled) {
          setUserId(restored.userId)
          setStatus('unlocked')
        }
        return
      }
      const local = await readLocalVaultMeta()
      const remote = await fetchRemoteVaultStatus()
      if (cancelled) return
      if (remote.setupComplete || local.setupComplete) {
        setStatus('locked')
      } else {
        setStatus('needs_setup')
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<VaultContextValue>(
    () => ({
      status,
      userId,
      cloudEnabled: isSupabaseConfigured(),
      setup: async (passphrase: string) => {
        const id = await setupVault(passphrase)
        setUserId(id)
        setStatus('unlocked')
      },
      unlock: async (passphrase: string) => {
        const id = await unlockVault(passphrase)
        setUserId(id)
        setStatus('unlocked')
      },
      lock: async () => {
        await lockVault()
        setUserId(null)
        setStatus('locked')
      },
    }),
    [status, userId],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const value = useContext(VaultContext)
  if (!value) throw new Error('useVault must be used within VaultProvider')
  return value
}
