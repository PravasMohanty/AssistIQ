
import axios from 'axios'
import { getToken, supabase } from '../config/supabase'

// Create axios instance with your backend URL
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5180/api',
    timeout: 10000,
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
api.interceptors.response.use(
    (response) => {
        return response
    },
    async (error) => {
        // Handle different error statuses
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    // Token expired - sign out and redirect
                    await supabase.auth.signOut()
                    window.location.href = '/login'
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
            // Request made but no response
            console.error('No response from server')
        } else {
            // Something else happened
            console.error('Request error:', error.message)
        }

        return Promise.reject(error)
    }
)

export default api