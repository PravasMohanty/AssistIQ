import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../../config/supabase'
import { authAPI } from '../../api/auth'
import { connectSocket, disconnectSocket } from '../../socket/socket'

const AuthContext = createContext(null)

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (!context) throw new Error('useAuth must be used within AuthProvider')
    return context
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    // Fetch user profile from backend
    const fetchProfile = async () => {
        try {
            const res = await authAPI.getProfile()
            const profileData = res.profile || res.data || res
            setProfile(profileData)
            return profileData
        } catch (err) {
            console.error('Failed to fetch profile:', err)
            setProfile(null)
            return null
        }
    }

    // Initialize auth state
    useEffect(() => {
        let mounted = true

        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()

                if (session?.user && mounted) {
                    setUser(session.user)
                    await fetchProfile()
                    try { await connectSocket() } catch (e) { console.error('Socket connect failed:', e) }
                }
            } catch (err) {
                console.error('Auth init error:', err)
            } finally {
                setLoading(false)
            }
        }

        initAuth()

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return

                if (event === 'SIGNED_IN' && session?.user) {
                    setUser(session.user)
                    await fetchProfile()
                    try { await connectSocket() } catch (e) { console.error('Socket connect failed:', e) }
                } else if (event === 'SIGNED_OUT') {
                    setUser(null)
                    setProfile(null)
                    disconnectSocket()
                }
            }
        )

        return () => {
            mounted = false
            subscription?.unsubscribe()
        }
    }, [])

    // Login
    const login = async (email, password) => {
        const data = await authAPI.login(email, password)
        return data
    }

    // Register
    const register = async (email, password, name) => {
        const data = await authAPI.register(email, password, name)
        return data
    }

    // Logout
    const logout = async () => {
        await authAPI.logout()
        setUser(null)
        setProfile(null)
        disconnectSocket()
    }

    const isAdmin = profile?.role === 'admin'

    const value = {
        user,
        profile,
        loading,
        login,
        register,
        logout,
        isAdmin,
        fetchProfile,
    }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    )
}
