
import axios from 'axios'
import { getToken, supabase } from '../config/supabase'

// Create axios instance with your backend URL
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5180/api',
    timeout: 30000, // 30s to accommodate embedding generation via Ollama
    headers: {
        'Content-Type': 'application/json'
    }
})

// Request interceptor - Auto add Supabase token
api.interceptors.request.use(
    async (config) => {
        try {
            // Get token from Supabase session
            const token = await getToken()

            if (token) {
                config.headers.Authorization = `Bearer ${token}`
            }

            return config
        } catch (error) {
            console.error('Error getting token:', error)
            return config
        }
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor - Handle errors
// IMPORTANT: Do NOT auto-signout on 401 here. The AuthContext manages
// session state. Auto-signout here causes instant logout after login
// if the profile fetch encounters any timing issue.
api.interceptors.response.use(
    (response) => {
        return response
    },
    async (error) => {
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    console.warn('API returned 401 - token may be expired:', error.response.data)
                    // Let the calling code handle this (e.g. AuthContext)
                    // Do NOT call supabase.auth.signOut() here
                    break

                case 403:
                    console.error('Forbidden:', error.response.data)
                    break

                case 404:
                    console.error('Not found:', error.response.data)
                    break

                case 500:
                    console.error('Server error:', error.response.data)
                    break

                default:
                    console.error('API error:', error.response.data)
            }
        } else if (error.request) {
            console.error('No response from server')
        } else {
            console.error('Request error:', error.message)
        }

        return Promise.reject(error)
    }
)

export default api