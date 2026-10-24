import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import Loader from './Loader'

const ProtectedRoute = ({ children }) => {
    const { user, loading } = useAuth()

    if (loading) return <Loader />

    if (!user) return <Navigate to="/auth" replace />

    return children || <Outlet />
}

export default ProtectedRoute
