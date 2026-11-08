import {
  BookOpen,
  LayoutDashboard,
  Library,
  Lock,
  Moon,
  Repeat,
  Search,
  Settings,
  Sun,
  WifiOff,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { useVault } from '@/hooks/useVault'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/revise', label: 'Revise', icon: Repeat },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { lock, cloudEnabled } = useVault()
  const sync = useSyncStatus()
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const syncLabel = {
    synced: 'Synced',
    synchronising: 'Synchronising',
    offline: 'Offline',
    sync_failed: 'Sync failed',
  }[sync]

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center">
          <div className="flex items-center justify-between gap-3">
            <NavLink to="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BookOpen className="h-4 w-4" />
              </span>
              <span className="font-serif text-xl">Lexicon</span>
            </NavLink>
            <div className="flex items-center gap-2 md:hidden">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle theme"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Lock vault" onClick={() => void lock()}>
                <Lock className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <form
            className="flex-1"
            onSubmit={(event) => {
              event.preventDefault()
              const value = searchRef.current?.value.trim()
              if (value) navigate(`/search?q=${encodeURIComponent(value)}`)
            }}
          >
            <label className="sr-only" htmlFor="global-search">
              Search vocabulary
            </label>
            <Input
              id="global-search"
              ref={searchRef}
              placeholder="Search a word or phrase — press /"
              aria-label="Search a word or phrase"
            />
          </form>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {sync === 'offline' && <WifiOff className="mr-1 inline h-3 w-3" />}
              {syncLabel}
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {cloudEnabled ? 'Private vault' : 'Local vault'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void lock()}>
              <Lock className="h-3.5 w-3.5" />
              Lock
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                  isActive && 'bg-secondary text-foreground',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
