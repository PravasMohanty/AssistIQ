const express = require('express')
const router = express.Router()
const { register, login, getProfile, logout } = require('../controllers/authController')
const authMiddleware = require('../middleware/authMiddleware')

router.post('/register', register)
router.post('/login', login)

router.get('/profile', authMiddleware, getProfile)
router.post('/logout', authMiddleware, logout)

module.exports = router
