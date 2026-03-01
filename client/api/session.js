// src/api/session.js
import api from './api'

export const sessionAPI = {
    // Create new session
    createSession: async () => {
        const response = await api.post('/session/create')
        return response.data
    },

    // Get current active session
    getCurrentSession: async () => {
        const response = await api.get('/session/current')
        return response.data
    },

    // Get all sessions
    getAllSessions: async () => {
        const response = await api.get('/session')
        return response.data
    },

    // Get specific session by ID
    getSession: async (sessionId) => {
        const response = await api.get(`/session/${sessionId}`)
        return response.data
    },

    // Resolve session
    resolveSession: async (sessionId) => {
        const response = await api.post('/session/resolve', {
            session_id: sessionId
        })
        return response.data
    },

    // Delete session
    deleteSession: async (sessionId) => {
        const response = await api.delete(`/session/${sessionId}`)
        return response.data
    },

    // Update session title
    updateSessionTitle: async (sessionId, title) => {
        const response = await api.patch(`/session/${sessionId}`, { title })
        return response.data
    }
}