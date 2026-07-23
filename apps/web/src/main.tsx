import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { initTheme } from './lib/cn'
import './i18n' // initialise i18next before any component renders
import App from './App'
import './index.css'

initTheme()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A cold API/DB connection (Railway trial tier sleeps; Prisma↔Supavisor can
      // drop the first pooled connection after idle) makes the very first request
      // fail, then succeed. Retry up to 3x with exponential backoff so a transient
      // blip self-heals instead of surfacing a "failed to load" banner. A genuine
      // 4xx (auth/permission) is not worth retrying — bail out immediately on those.
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status && status >= 400 && status < 500) return false
        return failureCount < 3
      },
      retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
