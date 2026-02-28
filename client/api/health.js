// src/api/health.js
import api from './api'

export const healthAPI = {
    // Check API health
    check: async () => {
        const response = await api.get('/health')
        return response.data
    },

    // Get system status
    getStatus: async () => {
        const response = await api.get('/health/status')
        return response.data
    },

    // Check database connection
    checkDatabase: async () => {
        const response = await api.get('/health/database')
        return response.data
    },

    // Check all services
    checkAll: async () => {
        const response = await api.get('/health/all')
        return response.data
    }
}