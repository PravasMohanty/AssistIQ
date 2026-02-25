const express = require('express')
const sessionRouter = express.Router()
const { createSession, getCurrentSession, resolveSession } = require('../controllers/sessionController')
const authMiddleware = require('../middleware/authMiddleware')

sessionRouter.use(authMiddleware)

sessionRouter.post('/create', createSession)
sessionRouter.get('/current', getCurrentSession)
sessionRouter.post('/resolve', resolveSession)

module.exports = sessionRouter