const express = require('express')
const authMiddleware = require("../middleware/authMiddleware")
const { getMessages, sendMessage } = require("../controllers/chatController")

const chatRouter = express.Router()

chatRouter.get('/:id', authMiddleware, getMessages)
chatRouter.post('/send/:id', authMiddleware, sendMessage)

module.exports = chatRouter