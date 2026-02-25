const express = require('express')
const testRouter = express.Router()
const { testUserLogin, testAdminLogin } = require('../controllers/testController')

// POST /api/test/user-login   → login + verify auth
testRouter.post('/user-login', testUserLogin)

// POST /api/test/admin-login  → login + verify auth + check admin role
testRouter.post('/admin-login', testAdminLogin)

module.exports = testRouter
