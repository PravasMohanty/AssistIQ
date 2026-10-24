const path = require('path')
const axios = require('axios')
const { queryRAG } = require('../utils/ragClient')

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8001'

// Upload file & auto-ingest into ChromaDB
const uploadKbFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                status: 'error',
                error: 'No file was uploaded or file type is not supported (.txt, .md only)'
            })
        }

        const filename = req.file.filename
        const documentId = path.parse(filename).name

        console.log(`[uploadKbFile] 📥 Received "${filename}", triggering ingestion in rag-service...`)

        const ingestResponse = await axios.post(`${RAG_SERVICE_URL}/ingest`, {
            file_path: `data/${filename}`,
            document_id: documentId
        })

        const chunksIngested = ingestResponse.data.chunks_ingested || 0
        console.log(`[uploadKbFile] ✅ Ingestion complete: ${chunksIngested} chunks created`)

        return res.status(201).json({
            status: 'success',
            message: `"${req.file.originalname}" uploaded and ingested successfully (${chunksIngested} chunks created)`,
            entry: {
                id: documentId,
                title: filename,
                filename,
                size_bytes: req.file.size,
                chunks_count: chunksIngested,
                status: 'ingested',
                created_at: new Date().toISOString()
            }
        })
    } catch (error) {
        console.error('[uploadKbFile] ❌ Error during ingestion:', error.response?.data || error.message)
        return res.status(500).json({
            status: 'error',
            error: error.response?.data?.detail || error.message || 'Failed to ingest file into RAG service'
        })
    }
}

// Get all uploaded documents and ingestion stats
const getAllKbEntries = async (req, res) => {
    try {
        const response = await axios.get(`${RAG_SERVICE_URL}/documents`, { timeout: 10000 })
        const docs = response.data?.documents || []

        // Map to format suitable for frontend display
        const entries = docs.map(doc => ({
            id: doc.id,
            title: doc.filename,
            filename: doc.filename,
            extension: doc.extension,
            size_bytes: doc.size_bytes,
            created_at: doc.modified_at,
            chunks_count: doc.chunks_count,
            status: doc.status,
            type: doc.extension === '.md' ? 'markdown' : 'text'
        }))

        return res.status(200).json({
            status: 'success',
            count: entries.length,
            entries
        })
    } catch (error) {
        console.warn('[getAllKbEntries] Warning: RAG service unreachable or returned error:', error.message)
        return res.status(200).json({
            status: 'success',
            entries: [],
            warning: 'RAG service is currently offline. Start the rag-service on port 8001.'
        })
    }
}

// Delete document from data folder and purge its chunks from ChromaDB
const deleteKbEntry = async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Document id is required' })
        }

        console.log(`[deleteKbEntry] Deleting document "${id}"...`)
        const response = await axios.delete(`${RAG_SERVICE_URL}/documents/${encodeURIComponent(id)}`)

        return res.status(200).json({
            status: 'success',
            message: `Document "${id}" deleted successfully`,
            data: response.data
        })
    } catch (error) {
        console.error('[deleteKbEntry] Error:', error.response?.data || error.message)
        return res.status(500).json({
            status: 'error',
            error: error.response?.data?.detail || error.message || 'Failed to delete document'
        })
    }
}

// Re-ingest an existing document in rag-service/data
const reingestKbEntry = async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Document id is required' })
        }

        console.log(`[reingestKbEntry] Re-ingesting document "${id}"...`)
        const response = await axios.post(`${RAG_SERVICE_URL}/documents/${encodeURIComponent(id)}/reingest`)

        return res.status(200).json({
            status: 'success',
            message: `Document "${id}" re-ingested successfully (${response.data.chunks_ingested} chunks)`,
            data: response.data
        })
    } catch (error) {
        console.error('[reingestKbEntry] Error:', error.response?.data || error.message)
        return res.status(500).json({
            status: 'error',
            error: error.response?.data?.detail || error.message || 'Failed to re-ingest document'
        })
    }
}

// Sync all knowledge base files
const syncEmbeddings = async (req, res) => {
    try {
        const listRes = await axios.get(`${RAG_SERVICE_URL}/documents`)
        const docs = listRes.data?.documents || []

        let totalChunks = 0
        let syncedCount = 0

        for (const doc of docs) {
            try {
                const reingestRes = await axios.post(`${RAG_SERVICE_URL}/documents/${encodeURIComponent(doc.id)}/reingest`)
                totalChunks += reingestRes.data?.chunks_ingested || 0
                syncedCount++
            } catch (err) {
                console.error(`Failed to re-ingest doc ${doc.id}:`, err.message)
            }
        }

        return res.status(200).json({
            status: 'success',
            message: `Synced ${syncedCount} of ${docs.length} documents (${totalChunks} chunks total)`,
            synced: syncedCount,
            totalChunks
        })
    } catch (error) {
        console.error('[syncEmbeddings] Error:', error.message)
        return res.status(500).json({
            status: 'error',
            error: error.message || 'Failed to sync knowledge base'
        })
    }
}

// Search and query helpers
const searchKbContent = async (req, res) => {
    try {
        const { query, top_k = 5 } = req.body
        if (!query) {
            return res.status(400).json({ status: 'error', error: 'query is required' })
        }

        const result = await queryRAG(query, top_k)
        return res.status(200).json({ status: 'success', context: result.context, answer: result.answer })
    } catch (error) {
        console.error('[searchKbContent] Error:', error.message)
        return res.status(500).json({ status: 'error', error: error.message || 'Search failed' })
    }
}

const resolveKbQuery = async (req, res) => {
    try {
        const { query } = req.body
        if (!query) {
            return res.status(400).json({ status: 'error', error: 'query is required' })
        }

        const result = await queryRAG(query)
        return res.status(200).json({ status: 'success', result: result.answer })
    } catch (error) {
        console.error('[resolveKbQuery] Error:', error.message)
        return res.status(500).json({ status: 'error', error: error.message || 'Resolve failed' })
    }
}

const _searchKb = async (query) => {
    const result = await queryRAG(query, 5)
    return result.context || []
}

const _resolveKb = async (query) => {
    const result = await queryRAG(query)
    return result.answer || ''
}

module.exports = {
    uploadKbFile,
    getAllKbEntries,
    deleteKbEntry,
    reingestKbEntry,
    syncEmbeddings,
    searchKbContent,
    resolveKbQuery,
    _searchKb,
    _resolveKb
}
