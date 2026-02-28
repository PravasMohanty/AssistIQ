// src/api/kb.js
import api from './api'

export const kbAPI = {
    // Search knowledge base
    search: async (query) => {
        const response = await api.post('/kb/search', { query })
        return response.data
    },

    // Resolve query with context
    resolve: async (query, context) => {
        const response = await api.post('/kb/resolve', {
            query,
            context
        })
        return response.data
    },

    // Get all KB entries
    getAllEntries: async () => {
        const response = await api.get('/kb/entries')
        return response.data
    },

    // Add KB entry (admin only)
    addEntry: async (title, content, type = 'qa', metadata = {}) => {
        const response = await api.post('/kb/add', {
            title,
            content,
            type,
            metadata
        })
        return response.data
    },

    // Update KB entry
    updateEntry: async (entryId, data) => {
        const response = await api.put(`/kb/entry/${entryId}`, data)
        return response.data
    },

    // Delete KB entry
    deleteEntry: async (entryId) => {
        const response = await api.delete(`/kb/entry/${entryId}`)
        return response.data
    },

    // Sync embeddings (if you have this)
    syncEmbeddings: async () => {
        const response = await api.post('/kb/sync')
        return response.data
    }
}