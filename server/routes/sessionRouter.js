const express = require('express')
const sessionRouter = express.Router()
const { createSession, getCurrentSession, resolveSession, getAllSessions } = require('../controllers/sessionController')
const authMiddleware = require('../middleware/authMiddleware')
const adminMiddleware = require('../middleware/adminMiddleware')

sessionRouter.use(authMiddleware)

sessionRouter.post('/create', createSession)
sessionRouter.get('/current', getCurrentSession)
sessionRouter.get('/', adminMiddleware, getAllSessions)
sessionRouter.post('/resolve', resolveSession)

module.exports = sessionRouter