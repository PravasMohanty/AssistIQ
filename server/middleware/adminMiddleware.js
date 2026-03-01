const { supabase } = require('../config/supabase')

const adminMiddleware = async (req, res, next) => {
    try {
        console.log(`[adminMiddleware] ${req.method} ${req.originalUrl} - checking admin access...`)
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', error: 'No token provided' })
        }

        const token = authHeader.split(' ')[1]

        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
            return res.status(401).json({ status: 'error', error: 'Invalid or expired token' })
        }

        // Fetch role from profiles table
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        const role = profile?.role || user.app_metadata?.role

        if (role !== 'admin') {
            return res.status(403).json({ status: 'error', error: 'Admin access required' })
        }

        req.user = user
        next()
    } catch (error) {
        console.error('[adminMiddleware] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

module.exports = adminMiddleware
