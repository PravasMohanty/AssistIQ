const jwt = require('jsonwebtoken')
const { pool } = require('../config/db')
const { queryRAG } = require('../utils/ragClient')

const setupSocket = (io) => {

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token

            if (!token) {
                return next(new Error('No token provided'))
            }

            const user = jwt.verify(token, process.env.JWT_SECRET)
            if (!user.id) return next(new Error('Invalid or expired token'))

            socket.user = {
                id: user.id,
                email: user.email,
                role: user.role || 'user'
            }
            next()
        } catch {
            next(new Error('Invalid or expired token'))
        }
    })

    io.on('connection', (socket) => {
        console.log(`⚡ Socket connected: ${socket.user.email} (${socket.id})`)

        socket.on('send_message', async ({ chatId, message }) => {
            try {
                // Validate input
                if (!chatId || !message || typeof message !== 'string' || !message.trim()) {
                    return socket.emit('error', { error: 'chatId and a non-empty message are required' })
                }

                const trimmedMessage = message.trim()

                // Check session ownership + status
                const sessionResult = await pool.query(
                    `SELECT user_id, status FROM chat_sessions WHERE id = $1`,
                    [chatId]
                )

                if (sessionResult.rows.length === 0) {
                    return socket.emit('error', { error: 'Chat session not found' })
                }

                const session = sessionResult.rows[0]

                if (session.user_id !== socket.user.id) {
                    return socket.emit('error', { error: 'Unauthorized access to this chat' })
                }

                if (session.status !== 'active') {
                    return socket.emit('error', { error: 'Cannot send messages to a resolved session' })
                }

                // 1. Save user message
                await pool.query(
                    `INSERT INTO messages (session_id, sender_role, content) VALUES ($1, $2, $3)`,
                    [chatId, 'user', trimmedMessage]
                )

                // 2. Query RAG service for AI answer
                let aiResponse = ''
                try {
                    const ragResult = await queryRAG(trimmedMessage, 5)
                    aiResponse = ragResult.answer || 'I was unable to find a relevant answer in the knowledge base.'
                } catch (err) {
                    console.error('[Socket][RAG] Error:', err.message)
                    aiResponse = 'I encountered an error while looking up the knowledge base. Please try again.'
                }

                // 3. Save AI response and return it
                const msgResult = await pool.query(
                    `INSERT INTO messages (session_id, sender_role, content) VALUES ($1, $2, $3) RETURNING id, created_at`,
                    [chatId, 'ai', aiResponse]
                )

                const savedMsg = msgResult.rows[0]

                // 4. Emit back to the client
                socket.emit('receive_message', {
                    id: savedMsg.id,
                    chatId,
                    sender_role: 'ai',
                    content: aiResponse,
                    created_at: savedMsg.created_at
                })

            } catch (err) {
                console.error('[send_message] Error:', err.message)
                socket.emit('error', { error: 'Failed to process your message. Please try again.' })
            }
        })

        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${socket.user.email} (${socket.id})`)
        })
    })
}

module.exports = setupSocket
