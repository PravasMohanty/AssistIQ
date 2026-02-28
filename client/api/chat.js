// src/api/chat.js
import api from './api'

export const chatAPI = {
    // Get messages for a session
    getMessages: async (sessionId) => {
        const response = await api.get(`/chat/${sessionId}`)
        return response.data
    },

    // Send message via HTTP (alternative to socket)
    sendMessage: async (sessionId, message) => {
        const response = await api.post(`/chat/send/${sessionId}`, { message })
        return response.data
    }
}
