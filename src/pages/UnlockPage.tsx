import { BookOpen } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useVault } from '@/hooks/useVault'

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
              ? 'Choose a passphrase you can remember on every device. It is never stored in plain text.'
              : 'Enter the same passphrase to open your vocabulary on this device.'}
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
              {busy ? 'Please wait…' : mode === 'setup' ? 'Create vault' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
