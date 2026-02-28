// src/api/test.js
import api from './api'

export const testAPI = {
    // Test authentication
    testAuth: async () => {
        const response = await api.get('/test/auth')
        return response.data
    },

    // Test admin login
    adminLogin: async (email, password) => {
        const response = await api.post('/test/admin-login', {
            email,
            password
        })
        return response.data
    },

    // Test database
    testDatabase: async () => {
        const response = await api.get('/test/database')
        return response.data
    },

    // Test socket
    testSocket: async () => {
        const response = await api.get('/test/socket')
        return response.data
    },

    // Any other test endpoints
    testEndpoint: async (endpoint, data = {}) => {
        const response = await api.post(`/test/${endpoint}`, data)
        return response.data
    }
}