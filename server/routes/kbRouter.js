const express = require('express')
const KBRouter = express.Router()
const {
    uploadKbFile,
    getAllKbEntries,
    deleteKbEntry,
    reingestKbEntry,
    syncEmbeddings,
    searchKbContent,
    resolveKbQuery
} = require('../controllers/kbController')
const authMiddleware = require('../middleware/authMiddleware')
const adminMiddleware = require('../middleware/adminMiddleware')
const { upload } = require('../middleware/uploadMiddleware')

// Error handling middleware for multer upload issues (e.g. invalid file type)
const handleUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('[upload] Multer error:', err.message)
            return res.status(400).json({
                status: 'error',
                error: err.message
            })
        }
        next()
    })
}

// Admin-only: File upload & ingestion
KBRouter.post('/upload', authMiddleware, adminMiddleware, handleUpload, uploadKbFile)
KBRouter.post('/entry', authMiddleware, adminMiddleware, handleUpload, uploadKbFile)
KBRouter.post('/add', authMiddleware, adminMiddleware, handleUpload, uploadKbFile)

// Admin-only: full management of KB documents
KBRouter.get('/entries', authMiddleware, adminMiddleware, getAllKbEntries)
KBRouter.delete('/entry/:id', authMiddleware, adminMiddleware, deleteKbEntry)
KBRouter.post('/entry/:id/reingest', authMiddleware, adminMiddleware, reingestKbEntry)

// Admin-only: sync/re-index embeddings for all documents
KBRouter.post('/sync', authMiddleware, adminMiddleware, syncEmbeddings)

// Public / auth-only: semantic search and answer resolution
KBRouter.post('/search', searchKbContent)
KBRouter.post('/resolve', resolveKbQuery)

module.exports = KBRouter
