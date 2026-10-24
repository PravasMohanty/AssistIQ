
import axios from 'axios'
import { clearToken, getToken, notifyUnauthorized } from './token'

// Create axios instance with your backend URL
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5180/api',
    timeout: 150000, // 150s to accommodate LLM generation time via Ollama (can take 60-120s)
    headers: {
        'Content-Type': 'application/json'
    }
})

api.interceptors.request.use(
    (config) => {
        const token = config.skipAuth ? null : getToken()

        if (token) {
            config.headers.Authorization = `Bearer ${token}`
            config._authToken = token
        }

        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

api.interceptors.response.use(
    (response) => {
        return response
    },
    async (error) => {
        const requestToken = error.config?._authToken
        if (
            error.response?.status === 401 &&
            requestToken &&
            !error.config?.skipUnauthorizedHandling &&
            getToken() === requestToken
        ) {
            clearToken()
            notifyUnauthorized()
        }

        return Promise.reject(error)
    }
)

export default api