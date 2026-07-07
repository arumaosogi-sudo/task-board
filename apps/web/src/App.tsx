import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ProtectedRoute } from './components/ProtectedRoute'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import EmailVerify from './pages/EmailVerify'
import AuthCallback from './pages/AuthCallback'
import AcceptInvite from './pages/AcceptInvite'
import Home from './pages/Home'
import ProjectSettings from './pages/ProjectSettings'
import Settings from './pages/Settings'
import WorkPage from './pages/WorkPage'
import Trash from './pages/Trash'
import MyUpdates from './pages/MyUpdates'
import ProjectChanges from './pages/ProjectChanges'

// Phase 1: Auth Core · Phase 2: Projects. More protected routes added per phase.
export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/my-updates" element={<ProtectedRoute><MyUpdates /></ProtectedRoute>} />
          <Route path="/project-changes" element={<ProtectedRoute><ProjectChanges /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/trash" element={<ProtectedRoute><Trash /></ProtectedRoute>} />
          <Route path="/projects/:id/work" element={<ProtectedRoute><WorkPage /></ProtectedRoute>} />
          <Route path="/projects/:id/settings" element={<ProtectedRoute><ProjectSettings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
