import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
// Login stays eager: it is the entry route almost every unauthenticated visit
// renders first, so keeping it in the main chunk avoids an extra chunk
// round-trip on first paint. Every other route is route-split below —
// perf/load-speed: these were previously all eagerly bundled into the ~475KB
// main chunk even though only one route renders per visit.
import Login from './pages/Login'

const SignUp = lazy(() => import('./pages/SignUp'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const EmailVerify = lazy(() => import('./pages/EmailVerify'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const AcceptInvite = lazy(() => import('./pages/AcceptInvite'))
const Home = lazy(() => import('./pages/Home'))
const ProjectSettings = lazy(() => import('./pages/ProjectSettings'))
const Settings = lazy(() => import('./pages/Settings'))
const WorkPage = lazy(() => import('./pages/WorkPage'))
const Trash = lazy(() => import('./pages/Trash'))
const Activity = lazy(() => import('./pages/Activity'))
const PublicSharePage = lazy(() => import('./pages/PublicSharePage'))

/** Full-viewport spinner shown while a route chunk loads. Mirrors the inline
 * spinner style already used for the CollabEditor Suspense boundary. */
function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center">
      <span className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// Phase 1: Auth Core · Phase 2: Projects. More protected routes added per phase.
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public share viewer (ADR 0006): mounted OUTSIDE AuthProvider so the anonymous
              page never bootstraps a session, sends the refresh cookie, or fetches any
              authenticated data. Everything else stays inside AuthProvider. */}
          <Route path="/share/:token" element={<PublicSharePage />} />
          <Route
            path="*"
            element={
              <AuthProvider>
                <Routes>
                  <Route path="/" element={<Login />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/verify-email" element={<EmailVerify />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/accept-invite" element={<AcceptInvite />} />
                  <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                  <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
                  {/* Legacy feed routes consolidated into /activity (Sprint 3). Kept as
                      redirects so existing bookmarks / deep links don't 404. */}
                  <Route path="/my-updates" element={<Navigate to="/activity" replace />} />
                  <Route path="/project-changes" element={<Navigate to="/activity" replace />} />
                  <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                  <Route path="/trash" element={<ProtectedRoute><Trash /></ProtectedRoute>} />
                  <Route path="/projects/:id/work" element={<ProtectedRoute><WorkPage /></ProtectedRoute>} />
                  <Route path="/projects/:id/settings" element={<ProtectedRoute><ProjectSettings /></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AuthProvider>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
