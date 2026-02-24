const express = require('express')
const KBRouter = express.Router()
const { addKbContent, searchKbContent, resolveKbQuery } = require('../controllers/kbController')
const auth = require('../middleware/auth')

KBRouter.post('/add', auth, addKbContent)

KBRouter.post('/search', searchKbContent)
KBRouter.post('/resolve', resolveKbQuery)

module.exports = KBRouter
