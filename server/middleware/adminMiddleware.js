const adminMiddleware = (req, res, next) => {
    try {
        console.log(
            `[adminMiddleware] ${req.method} ${req.originalUrl} - checking admin access...`
        )

        // authMiddleware should run before this middleware
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                error: 'Authentication required'
            })
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                error: 'Admin access required'
            })
        }

        next()

    } catch (error) {
        console.error('[adminMiddleware] Unexpected error:', error)

        return res.status(500).json({
            status: 'error',
            error: 'Internal Server Error'
        })
    }
}

module.exports = adminMiddleware