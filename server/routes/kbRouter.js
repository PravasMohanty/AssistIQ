const express = require('express')
const KBRouter = express.Router()
const { addKbContent, searchKbContent, resolveKbQuery } = require('../controllers/kbController')
const authMiddleware = require('../middleware/authMiddleware')

KBRouter.post('/add', authMiddleware, addKbContent)

KBRouter.post('/search', searchKbContent)
KBRouter.post('/resolve', resolveKbQuery)

module.exports = KBRouter
