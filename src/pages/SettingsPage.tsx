import { Download, Lock, RefreshCw, WifiOff } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useLibrary } from '@/hooks/useLibrary'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { useVault } from '@/hooks/useVault'
import { synchronise } from '@/services/sync/syncEngine'

const DAILY_GOAL_OPTIONS = [3, 5, 10, 15, 20, 30]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { lock, cloudEnabled } = useVault()
  const { settings, saveSettings, words, history, progress } = useLibrary()
  const sync = useSyncStatus()
  const [syncing, setSyncing] = useState(false)

  const syncLabel: Record<typeof sync, string> = {
    synced: 'Up to date',
    synchronising: 'Synchronising…',
    offline: 'Offline',
    sync_failed: 'Sync failed — check your connection',
  }

  async function handleManualSync() {
    setSyncing(true)
    try {
      await synchronise()
      toast.success('Synchronisation complete.')
    } catch {
      toast.error('Synchronisation failed.')
    } finally {
      setSyncing(false)
    }
  }

  function handleExport() {
    const payload = {
      exportedAt: new Date().toISOString(),
      words,
      progress,
      history,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lexicon-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Vocabulary exported.')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Settings</h1>
        <p className="mt-1 text-muted-foreground">Personalise your learning experience.</p>
      </div>

      {/* Learning preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Learning</CardTitle>
          <CardDescription>Adjust your daily study goal and review behaviour.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="daily-goal">Daily goal</Label>
              <p className="text-sm text-muted-foreground">Words or reviews per day</p>
            </div>
            <Select
              value={String(settings?.dailyGoal ?? 5)}
              onValueChange={(v) => {
                void saveSettings.mutateAsync({ dailyGoal: Number(v) })
              }}
            >
              <SelectTrigger id="daily-goal" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAILY_GOAL_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose your preferred colour scheme.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="theme-select">Theme</Label>
            <Select value={theme ?? 'system'} onValueChange={setTheme}>
              <SelectTrigger id="theme-select" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sync & vault */}
      <Card>
        <CardHeader>
          <CardTitle>Sync & Security</CardTitle>
          <CardDescription>
            {cloudEnabled
              ? 'Your vocabulary is securely synchronised via Supabase.'
              : 'Running in local-only mode. Set up Supabase to sync across devices.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Status</p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {sync === 'offline' && <WifiOff className="h-3 w-3" />}
                {syncLabel[sync]}
              </p>
            </div>
            {cloudEnabled && (
              <Button
                variant="outline"
                size="sm"
                disabled={syncing || sync === 'synchronising' || sync === 'offline'}
                onClick={() => void handleManualSync()}
              >
                <RefreshCw className={cn('mr-2 h-3.5 w-3.5', syncing && 'animate-spin')} />
                Sync now
              </Button>
            )}
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Lock vault</p>
              <p className="text-sm text-muted-foreground">Requires your passphrase to re-open.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void lock()}>
              <Lock className="mr-2 h-3.5 w-3.5" />
              Lock
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>Export or manage your vocabulary data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Export vocabulary</p>
              <p className="text-sm text-muted-foreground">
                Downloads a JSON file of all your words, definitions, and review history.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-3.5 w-3.5" />
              Export
            </Button>
          </div>

          <Separator />

          <div className="rounded-lg border border-border bg-secondary/50 p-4">
            <p className="text-sm font-medium">Your data summary</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>{words.length} words saved</li>
              <li>{words.filter((w) => w.learningStatus === 'mastered').length} words mastered</li>
              <li>{history.length} total review records</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
