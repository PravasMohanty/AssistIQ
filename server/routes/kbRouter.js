const express = require('express')
const KBRouter = express.Router()
const { addKbContent, searchKbContent, resolveKbQuery } = require('../controllers/kbController')
const authMiddleware = require('../middleware/authMiddleware')
const adminMiddleware = require('../middleware/adminMiddleware')

KBRouter.post('/add', adminMiddleware, addKbContent)

KBRouter.post('/search', searchKbContent)
KBRouter.post('/resolve', resolveKbQuery)

module.exports = KBRouter
