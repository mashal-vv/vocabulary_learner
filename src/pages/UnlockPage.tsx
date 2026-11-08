import { AlertTriangle, BookOpen, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useVault } from '@/hooks/useVault'
import { isSupabaseConfigured } from '@/services/supabase/client'

export function UnlockPage({ mode }: { mode: 'setup' | 'unlock' }) {
  const { status, setup, unlock } = useVault()
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  if (status === 'unlocked') return <Navigate to="/" replace />
  if (status === 'needs_setup' && mode === 'unlock') return <Navigate to="/setup" replace />
  if (status === 'locked' && mode === 'setup') return <Navigate to="/unlock" replace />

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (mode === 'setup' && passphrase !== confirm) {
      toast.error('The two passphrases do not match.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'setup') await setup(passphrase)
      else await unlock(passphrase)
      toast.success(mode === 'setup' ? 'Vault created.' : 'Vault unlocked.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open the vault.')
    } finally {
      setBusy(false)
    }
  }

  // Show configuration warning if Supabase is not set up
  if (!isSupabaseConfigured()) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive text-destructive-foreground">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <CardTitle>Supabase not configured</CardTitle>
            <CardDescription>
              Lexicon requires Supabase to securely store and synchronise your vocabulary across devices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add the following to a <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env.local</code> file
              in the project root, then restart the dev server:
            </p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs font-mono leading-relaxed">
              {`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
            </pre>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Open Supabase Dashboard
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="text-xs text-muted-foreground">
              See <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">supabase/README.md</code> in the project
              for full setup instructions including Edge Function deployment.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="h-5 w-5" />
          </div>
          <CardTitle>{mode === 'setup' ? 'Create your private vault' : 'Unlock Lexicon'}</CardTitle>
          <CardDescription>
            {mode === 'setup'
              ? 'Choose a strong passphrase — it unlocks your vocabulary on every device. It is verified server-side and never stored.'
              : 'Enter your passphrase to open your vocabulary. The same passphrase works across all your devices.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                required
                minLength={8}
              />
            </div>
            {mode === 'setup' && (
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm passphrase</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  minLength={8}
                />
              </div>
            )}
            <Button className="w-full" type="submit" disabled={busy}>
              {busy
                ? mode === 'setup' ? 'Creating vault…' : 'Unlocking…'
                : mode === 'setup' ? 'Create vault' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
