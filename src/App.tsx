import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { VaultProvider } from '@/hooks/useVault'
import { DashboardPage } from '@/pages/DashboardPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { RevisePage } from '@/pages/RevisePage'
import { SearchPage } from '@/pages/SearchPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { UnlockPage } from '@/pages/UnlockPage'
import { WordPage } from '@/pages/WordPage'
import { VaultGate } from '@/components/layout/VaultGate'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
})

const router = createBrowserRouter([
  {
    path: '/setup',
    element: <UnlockPage mode="setup" />,
  },
  {
    path: '/unlock',
    element: <UnlockPage mode="unlock" />,
  },
  {
    path: '/',
    element: <VaultGate />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: 'library', element: <LibraryPage /> },
          { path: 'revise', element: <RevisePage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'word/:normalizedWord', element: <WordPage /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <VaultProvider>
          <RouterProvider router={router} />
          <Toaster richColors closeButton position="bottom-right" />
        </VaultProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
