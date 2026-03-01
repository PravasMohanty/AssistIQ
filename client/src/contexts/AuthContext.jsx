import { createContext, useContext, useState, useEffect, useCallback } from 'react'
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
    const fetchProfile = useCallback(async () => {
        try {
            console.log('🔄 Fetching user profile...')
            const res = await authAPI.getProfile()
            const profileData = res.profile || res.data || res

            if (!profileData || typeof profileData !== 'object') {
                throw new Error('Invalid profile data received from server')
            }

            console.log('✅ Profile loaded:', {
                email: profileData.email,
                role: profileData.role,
                isAdmin: profileData.role === 'admin'
            })

            setProfile(profileData)
            return profileData
        } catch (err) {
            console.error('❌ Profile fetch failed:', err.message)
            setProfile(null)
            return null
        }
    }, [])

    // Initialize auth state using ONLY onAuthStateChange
    // This avoids Navigator Lock contention that happens when
    // getSession() and onAuthStateChange() compete for the same lock
    useEffect(() => {
        let mounted = true

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (!mounted) return

                console.log('🔄 Auth event:', event)

                if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
                    if (session?.user) {
                        console.log('✅ User session active:', session.user.email)
                        setUser(session.user)

                        // Use setTimeout to avoid calling Supabase APIs inside the callback
                        // which could cause additional lock contention
                        setTimeout(async () => {
                            if (!mounted) return
                            const profileData = await fetchProfile()

                            if (profileData) {
                                try {
                                    console.log('🔌 Connecting socket...')
                                    await connectSocket()
                                    console.log('✅ Socket connected')
                                } catch (e) {
                                    console.warn('⚠️ Socket connection failed (non-critical):', e.message)
                                }
                            }

                            if (mounted) setLoading(false)
                        }, 0)
                    } else {
                        console.log('ℹ️ No active session')
                        setLoading(false)
                    }
                } else if (event === 'SIGNED_OUT') {
                    console.log('👋 User signed out')
                    setUser(null)
                    setProfile(null)
                    disconnectSocket()
                    setLoading(false)
                } else if (event === 'TOKEN_REFRESHED') {
                    console.log('🔑 Token refreshed')
                    // No need to refetch profile, just update user
                    if (session?.user) setUser(session.user)
                }
            }
        )

        // Safety timeout in case onAuthStateChange never fires
        const safetyTimer = setTimeout(() => {
            if (mounted) {
                console.warn('[AuthContext] Safety timeout - forcing loading to false')
                setLoading(false)
            }
        }, 10000)

        return () => {
            mounted = false
            clearTimeout(safetyTimer)
            subscription?.unsubscribe()
        }
    }, [fetchProfile])

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
        try {
            console.log('🔄 Logging out...')
            setUser(null)
            setProfile(null)
            disconnectSocket()
            await supabase.auth.signOut()
            console.log('✅ Logged out')
        } catch (err) {
            console.error('Logout error:', err)
        }
        // No window.location.href — let React Router handle the redirect
        // The SIGNED_OUT event will clear state, and ProtectedRoute will redirect
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
