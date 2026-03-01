// src/api/auth.js
import { supabase } from '../config/supabase'
import api from './api'

export const authAPI = {
    // Register - Direct Supabase
    register: async (email, password, name) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name }
            }
        })

        if (error) throw error
        return data
    },

    // Login - Direct Supabase
    login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (error) throw error
        return data
    },

    // Get Profile - Your Express endpoint
    getProfile: async () => {
        const response = await api.get('/auth/profile')
        return response.data
    },

    // Logout - Direct Supabase
    logout: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
    },

    // Get current user
    getCurrentUser: async () => {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) throw error
        return user
    },

    // Check authentication
    isAuthenticated: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        return !!session
    }
}