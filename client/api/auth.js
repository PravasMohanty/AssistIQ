import api from './api'
import { clearToken, getToken, setToken } from './token'

export const authAPI = {
    register: async (email, password, name, adminCode = '') => {
        const response = await api.post('/auth/register', {
            email: email.trim().toLowerCase(),
            password,
            name,
            adminCode
        }, {
            skipAuth: true
        })
        return response.data
    },

    login: async (email, password) => {
        const response = await api.post('/auth/login', {
            email: email.trim().toLowerCase(),
            password
        }, {
            skipAuth: true,
            skipUnauthorizedHandling: true
        })

        const data = response.data
        if (!data?.access_token || !data.user || typeof data.user !== 'object') {
            throw new Error('Login response did not include a valid session')
        }

        setToken(data.access_token)
        return data
    },

    getProfile: async () => {
        const response = await api.get('/auth/profile')
        return response.data
    },

    logout: async () => {
        clearToken()
    },

    getCurrentUser: async () => {
        return getToken() ? authAPI.getProfile() : null
    },

    isAuthenticated: async () => {
        return Boolean(getToken())
    }
}