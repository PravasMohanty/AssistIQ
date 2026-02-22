const express = require('express')
const router = express.Router()
const { register, login, getProfile, logout } = require('../controllers/authController')
const auth = require('../middleware/auth')

// Public routes
router.post('/register', register)
router.post('/login', login)

// Protected routes
router.get('/profile', auth, getProfile)
router.post('/logout', auth, logout)

module.exports = router
