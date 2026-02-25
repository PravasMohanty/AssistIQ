const express = require('express')
const sessionRouter = express.Router()

const { createSession, getCurentSession, resolveSession } = require('../controllers/sessionController')

sessionRouter.post('/create', createSession)
sessionRouter.get('/current', getCurentSession)
sessionRouter.post('/resolve', resolveSession)

module.exports = sessionRouter