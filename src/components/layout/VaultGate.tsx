import { Navigate, Outlet } from 'react-router-dom'
import { useVault } from '@/hooks/useVault'

/**
 * Guards the authenticated section of the app.
 * Redirects to /setup or /unlock based on vault state.
 * Shows a subtle loading screen while the vault status is determined.
 */
export function VaultGate() {
  const { status } = useVault()

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">Opening your vault…</p>
        </div>
      </div>
    )
  }

  if (status === 'needs_setup') {
    return <Navigate to="/setup" replace />
  }

  if (status === 'locked') {
    return <Navigate to="/unlock" replace />
  }

  // status === 'unlocked'
  return <Outlet />
}
