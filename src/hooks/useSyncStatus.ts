import { useEffect, useState } from 'react'
import { getSyncStatus, startSyncListeners, subscribeSync } from '@/services/sync/syncEngine'
import type { SyncStatus } from '@/types/vocabulary'

let started = false

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())

  useEffect(() => {
    if (!started) {
      started = true
      startSyncListeners()
    }
    const unsub = subscribeSync(setStatus)
    return () => { unsub() }
  }, [])

  return status
}

