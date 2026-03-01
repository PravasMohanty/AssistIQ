import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Loader from './Loader'

const AdminRoute = ({ children }) => {
    const { user, loading, isAdmin } = useAuth()

    if (loading) return <Loader />

    if (!user) return <Navigate to="/auth" replace />

    if (!isAdmin) return <Navigate to="/chat" replace />

    return children
}

export default AdminRoute
