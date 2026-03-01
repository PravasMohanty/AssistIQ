import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import Loader from './components/Loader'
import AuthPage from './pages/AuthPage'
import ChatPage from './pages/ChatPage'
import AdminPage from './pages/AdminPage'
import KBUploadPage from './pages/KBUploadPage'

function App() {
  const { user, loading } = useAuth()

  if (loading) return <Loader />

  return (
    <Routes>
      {/* Public route */}
      <Route path="/auth" element={user ? <Navigate to="/chat" replace /> : <AuthPage />} />

      {/* Protected routes with navbar layout */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/admin/kb" element={<AdminRoute><KBUploadPage /></AdminRoute>} />
      </Route>

      {/* Default redirect */}
      <Route path="*" element={<Navigate to={user ? '/chat' : '/auth'} replace />} />
    </Routes>
  )
}

export default App
