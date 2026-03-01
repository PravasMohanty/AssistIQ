const { supabase } = require('../config/supabase')

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', error: 'No token provided' })
        }

        const token = authHeader.split(' ')[1]

        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error) {
            console.error('[authMiddleware] Token validation failed:', error.message)
        }

        if (error || !user) {
            // Temporarily passing error.message to Postman so you can read it easily
            return res.status(401).json({
                status: 'error',
                error: 'Invalid or expired token',
                details: error?.message || 'User not found'
            })
        }

        req.user = user
        next()
    } catch (err) {
        console.error("-> Middleware crash:", err)
        return res.status(500).json({ status: 'error', error: 'Authentication failed' })
    }
}

module.exports = authMiddleware