const { pool } = require('../config/db')
const { queryRAG } = require('../utils/ragClient')


const getMessages = async (req, res) => {
    try {
        const { id } = req.params
        const user_id = req.user.id

        if (!id) {
            return res.status(400).json({
                status: 'error',
                error: 'Chat ID is required'
            })
        }

        // Verify session ownership
        const sessionResult = await pool.query(
            `
            SELECT user_id
            FROM chat_sessions
            WHERE id = $1
            `,
            [id]
        )

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                error: 'Session not found'
            })
        }

        const session = sessionResult.rows[0]

        if (session.user_id !== user_id) {
            return res.status(403).json({
                status: 'error',
                error: 'Unauthorized access to this session'
            })
        }

        // Fetch messages
        const messagesResult = await pool.query(
            `
            SELECT *
            FROM messages
            WHERE session_id = $1
            ORDER BY created_at ASC
            `,
            [id]
        )

        res.json({
            status: 'success',
            data: messagesResult.rows
        })

    } catch (err) {
        console.error('[getMessages] Error:', err)

        res.status(500).json({
            status: 'error',
            error: 'Failed to fetch messages'
        })
    }
}


const sendMessage = async (req, res) => {
    try {
        const { id } = req.params
        const user_id = req.user.id

        if (!id) {
            return res.status(400).json({
                status: 'error',
                error: 'Chat ID is required'
            })
        }

        const { message } = req.body

        if (
            !message ||
            typeof message !== 'string' ||
            !message.trim()
        ) {
            return res.status(400).json({
                status: 'error',
                error: 'A non-empty message string is required'
            })
        }

        // Verify session ownership and status
        const sessionResult = await pool.query(
            `
            SELECT user_id, status
            FROM chat_sessions
            WHERE id = $1
            `,
            [id]
        )

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                error: 'Session not found'
            })
        }

        const session = sessionResult.rows[0]

        if (session.user_id !== user_id) {
            return res.status(403).json({
                status: 'error',
                error: 'Unauthorized access to this session'
            })
        }

        if (session.status !== 'active') {
            return res.status(400).json({
                status: 'error',
                error: 'Cannot send messages to a resolved session'
            })
        }

        // Store user's message
        await pool.query(
            `
            INSERT INTO messages
                (session_id, sender_role, content)
            VALUES
                ($1, $2, $3)
            `,
            [id, 'user', message.trim()]
        )

        // Query Python RAG service
        const ragResult = await queryRAG(message.trim(), 5)

        const aiResponse = ragResult.answer

        // Store AI response
        await pool.query(
            `
            INSERT INTO messages
                (session_id, sender_role, content)
            VALUES
                ($1, $2, $3)
            `,
            [id, 'ai', aiResponse]
        )

        res.json({
            status: 'success',
            response: aiResponse
        })

    } catch (err) {
        console.error('[sendMessage] Error:', err)

        res.status(500).json({
            status: 'error',
            error: 'Failed to process message'
        })
    }
}


module.exports = {
    getMessages,
    sendMessage
}