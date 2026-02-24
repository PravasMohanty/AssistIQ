const express = require('express')
const router = express.Router()
const { addKbContent, searchKbContent, resolveKbQuery } = require('../controllers/kbController')
const auth = require('../middleware/auth')

// Protected route to add knowledge base entries
router.post('/add', auth, addKbContent)

// Public routes for searching and resolving queries (can be protected if needed)
router.post('/search', searchKbContent)
router.post('/resolve', resolveKbQuery)

module.exports = router
