import { BookMarked, Flame, Library, Repeat, Search, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useLibrary } from '@/hooks/useLibrary'
import { computeDashboardStats } from '@/services/stats'

export function DashboardPage() {
  const { words, progress, history, settings, isLoading } = useLibrary()
  const navigate = useNavigate()

  if (isLoading || !settings) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  const stats = computeDashboardStats(words, progress, history, settings)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Good studying</h1>
        <p className="mt-1 text-muted-foreground">A quiet place to grow a personal English vocabulary.</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total words" value={stats.total} />
        <StatCard label="Learned today" value={stats.learnedToday} />
        <StatCard label="Due for revision" value={stats.due} />
        <StatCard label="Mastered" value={stats.mastered} />
        <StatCard label="Learning streak" value={`${stats.streak} day${stats.streak === 1 ? '' : 's'}`} icon />
        <StatCard label="Reviews today" value={stats.reviewedToday} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Learning overview</CardTitle>
            <CardDescription>
              Daily goal {settings.dailyGoal} · {stats.upcoming} word{stats.upcoming === 1 ? '' : 's'} waiting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={stats.goalProgress} />
            <p className="text-sm text-muted-foreground">{stats.goalProgress}% of today’s goal</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.weekly}>
                  <XAxis dataKey="label" stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} width={24} stroke="currentColor" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--color-chart-1)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Word of the day</CardTitle>
            <CardDescription>A saved word worth revisiting</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.wordOfTheDay ? (
              <div className="space-y-3">
                <p className="font-serif text-2xl">{stats.wordOfTheDay.word}</p>
                <p className="text-sm text-muted-foreground">
                  {stats.wordOfTheDay.simpleDefinition ?? stats.wordOfTheDay.definitions[0]?.definition}
                </p>
                <Button onClick={() => navigate(`/word/${stats.wordOfTheDay!.normalizedWord}`)}>Review it</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Search your first word to begin the notebook.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction to="/search" icon={Search} label="Search a new word" />
        <QuickAction to="/revise" icon={Repeat} label="Start revision" />
        <QuickAction to="/library" icon={Library} label="Open vocabulary library" />
        <QuickAction to={stats.due > 0 ? '/revise' : '/search'} icon={Sparkles} label="Continue learning" />
      </section>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon ? <Flame className="h-4 w-4" /> : <BookMarked className="h-4 w-4" />}
          {label}
        </CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: typeof Search; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}
