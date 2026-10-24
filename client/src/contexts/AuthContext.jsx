import { useState, useEffect, useCallback } from 'react'
import { authAPI } from '../../api/auth'
import { connectSocket, disconnectSocket } from '../../socket/socket'
import { AUTH_UNAUTHORIZED_EVENT, getToken } from '../../api/token'
import { AuthContext } from './contextInstance'

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)

    const fetchProfile = useCallback(async () => {
        const profileData = await authAPI.getProfile()
        if (!profileData || typeof profileData !== 'object' || !profileData.id) {
            throw new Error('Invalid profile data received from server')
        }

        setUser(profileData)
        setProfile(profileData)
        return profileData
    }, [])

    useEffect(() => {
        let mounted = true

        const handleUnauthorized = () => {
            setUser(null)
            setProfile(null)
            disconnectSocket()
        }

        window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)

        const initializeAuth = async () => {
            try {
                if (!getToken()) return

                await fetchProfile()
                if (mounted) {
                    try {
                        await connectSocket()
                    } catch {
                        // HTTP authentication remains available if the socket is offline.
                    }
                }
            } catch (error) {
                if (error.response?.status !== 401) {
                    console.error('Session restoration failed:', error.message)
                }
            } finally {
                if (mounted) setLoading(false)
            }
        }

        initializeAuth()

        return () => {
            mounted = false
            window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized)
        }
    }, [fetchProfile])

    const login = async (email, password) => {
        const data = await authAPI.login(email, password)
        if (!data.user || typeof data.user !== 'object') {
            throw new Error('Login response did not include a user profile')
        }

        setUser(data.user)
        setProfile(data.user)
        try {
            await connectSocket()
        } catch {
            // HTTP authentication remains available if the socket is offline.
        }
        return data
    }

    const register = async (email, password, name, adminCode) => {
        return authAPI.register(email, password, name, adminCode)
    }

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
