const express = require('express')
const KBRouter = express.Router()
const {
    addKbContent,
    getAllKbEntries,
    updateKbEntry,
    deleteKbEntry,
    searchKbContent,
    resolveKbQuery
} = require('../controllers/kbController')
const adminMiddleware = require('../middleware/adminMiddleware')

// Admin-only: add entry (original endpoint)
KBRouter.post('/add', adminMiddleware, addKbContent)

// Admin-only: full CRUD via /entry routes (used by frontend)
KBRouter.get('/entries', adminMiddleware, getAllKbEntries)
KBRouter.post('/entry', adminMiddleware, addKbContent)
KBRouter.put('/entry/:id', adminMiddleware, updateKbEntry)
KBRouter.delete('/entry/:id', adminMiddleware, deleteKbEntry)

// Public / auth-only: search and resolve
KBRouter.post('/search', searchKbContent)
KBRouter.post('/resolve', resolveKbQuery)

module.exports = KBRouter
