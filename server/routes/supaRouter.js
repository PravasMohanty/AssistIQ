const express = require('express')
const supaRouter = express.Router()
const { testConnection } = require('../controllers/supabaseController')

supaRouter.get('/test-supabase', testConnection)

module.exports = supaRouter
