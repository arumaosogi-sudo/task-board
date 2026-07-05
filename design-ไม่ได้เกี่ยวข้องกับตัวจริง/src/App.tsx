import { HashRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import Home from './pages/Home'
import MyProjects from './pages/MyProjects'
import MyUpdates from './pages/MyUpdates'
import ProjectChanges from './pages/ProjectChanges'
import Settings from './pages/Settings'
import WorkPage from './pages/WorkPage'
import Editor from './pages/Editor'
import DesignSystem from './pages/DesignSystem'
import Gallery from './pages/Gallery'
import Responsive from './pages/Responsive'
// New screens (UX audit additions)
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import EmailVerify from './pages/EmailVerify'
import ProjectSettings from './pages/ProjectSettings'
import Trash from './pages/Trash'
import NotificationCenter from './pages/NotificationCenter'
import NewScreensGallery from './pages/NewScreensGallery'
import SearchDemo from './pages/SearchDemo'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/home" element={<Home />} />
        <Route path="/my-projects" element={<MyProjects />} />
        <Route path="/my-updates" element={<MyUpdates />} />
        <Route path="/project-changes" element={<ProjectChanges />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/work" element={<WorkPage />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/responsive" element={<Responsive />} />
        {/* New screens */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<EmailVerify />} />
        <Route path="/project-settings" element={<ProjectSettings />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/notifications" element={<NotificationCenter />} />
        <Route path="/new-screens" element={<NewScreensGallery />} />
        <Route path="/search-demo" element={<SearchDemo />} />
      </Routes>
    </HashRouter>
  )
}
