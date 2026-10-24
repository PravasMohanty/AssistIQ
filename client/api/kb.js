// client/api/kb.js
import api from './api'

export const kbAPI = {
    // Search knowledge base
    search: async (query, top_k = 5) => {
        const response = await api.post('/kb/search', { query, top_k })
        return response.data
    },

    // Resolve query with context
    resolve: async (query, context) => {
        const response = await api.post('/kb/resolve', { query, context })
        return response.data
    },

    // Get all KB documents and stats
    getAllEntries: async () => {
        const response = await api.get('/kb/entries')
        return response.data
    },

    // Upload file (.txt, .md) to rag-service/data and trigger ChromaDB ingestion
    uploadFile: async (file) => {
        const formData = new FormData()
        formData.append('file', file)

        const response = await api.post('/kb/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            },
            timeout: 120000 // 2 minutes for embedding large documents via Ollama
        })
        return response.data
    },

    // Delete KB entry/document
    deleteEntry: async (entryId) => {
        const response = await api.delete(`/kb/entry/${encodeURIComponent(entryId)}`)
        return response.data
    },

    // Re-ingest single document
    reingestEntry: async (entryId) => {
        const response = await api.post(`/kb/entry/${encodeURIComponent(entryId)}/reingest`, {}, {
            timeout: 120000
        })
        return response.data
    },

    // Sync / re-index all embeddings in the knowledge base
    syncEmbeddings: async () => {
        const response = await api.post('/kb/sync', {}, {
            timeout: 300000 // 5 minutes for full sync
        })
        return response.data
    }
}