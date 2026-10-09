const { pool } = require('../config/db')


const createSession = async (req, res) => {
    try {
        const user_id = req.user.id

        // Auto-resolve existing active sessions for this user
        await pool.query(
            `
            UPDATE chat_sessions
            SET status = 'resolved'
            WHERE user_id = $1
            AND status = 'active'
            `,
            [user_id]
        )

        // Create new active session
        const result = await pool.query(
            `
            INSERT INTO chat_sessions
                (user_id, title, status)
            VALUES
                ($1, $2, $3)
            RETURNING *
            `,
            [user_id, 'New Chat', 'active']
        )

        res.json({
            status: 'success',
            data: result.rows[0]
        })

    } catch (error) {
        console.error('[createSession]', error)

        return res.status(500).json({
            status: 'error',
            error: 'Failed to create session'
        })
    }
}


const getCurrentSession = async (req, res) => {
    try {
        const user_id = req.user.id

        const result = await pool.query(
            `
            SELECT *
            FROM chat_sessions
            WHERE user_id = $1
            AND status = 'active'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [user_id]
        )

        // No active session
        if (result.rows.length === 0) {
            return res.json({
                status: 'success',
                data: null
            })
        }

        res.json({
            status: 'success',
            data: result.rows[0]
        })

    } catch (error) {
        console.error('[getCurrentSession]', error)

        return res.status(500).json({
            status: 'error',
            error: 'Failed to get current session'
        })
    }
}


const resolveSession = async (req, res) => {
    try {
        const { session_id } = req.body

        if (!session_id) {
            return res.status(400).json({
                error: 'session_id is required'
            })
        }

        // Verify ownership
        const sessionResult = await pool.query(
            `
            SELECT user_id
            FROM chat_sessions
            WHERE id = $1
            `,
            [session_id]
        )

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                error: 'Session not found'
            })
        }

        const session = sessionResult.rows[0]

        if (session.user_id !== req.user.id) {
            return res.status(403).json({
                error: 'Unauthorized access to this session'
            })
        }

        // Resolve session
        const result = await pool.query(
            `
            UPDATE chat_sessions
            SET status = 'resolved'
            WHERE id = $1
            RETURNING *
            `,
            [session_id]
        )

        res.json({
            status: 'success',
            data: result.rows[0]
        })

    } catch (error) {
        console.error('[resolveSession]', error)

        return res.status(500).json({
            status: 'error',
            error: 'Failed to resolve session'
        })
    }
}


const getAllSessions = async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                user_id,
                title,
                status,
                created_at
            FROM chat_sessions
            ORDER BY created_at DESC
            `
        )

        return res.json({
            status: 'success',
            sessions: result.rows
        })

    } catch (error) {
        console.error('[getAllSessions]', error)

        return res.status(500).json({
            error: 'Failed to fetch sessions'
        })
    }
}


module.exports = {
    createSession,
    getCurrentSession,
    resolveSession,
    getAllSessions
}