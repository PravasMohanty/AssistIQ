const { supabase } = require('../config/supabase')

const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', error: 'No token provided' })
        }

        const token = authHeader.split(' ')[1]

        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
            return res.status(401).json({ status: 'error', error: 'Invalid or expired token' })
        }

        req.user = user
        next()
    } catch (err) {
        return res.status(500).json({ status: 'error', error: 'Authentication failed' })
    }
}

module.exports = authMiddleware
