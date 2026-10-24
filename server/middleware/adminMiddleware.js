const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

const adminMiddleware = (req, res, next) => {
    try {
        console.log(
            `[adminMiddleware] ${req.method} ${req.originalUrl} - checking admin access...`
        )

        // If authMiddleware was not executed beforehand, authenticate here
        if (!req.user) {
            const authHeader = req.headers.authorization

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    status: 'error',
                    error: 'Authentication required'
                })
            }

            const token = authHeader.split(' ')[1]
            const decoded = jwt.verify(token, JWT_SECRET)
            req.user = decoded
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                error: 'Admin access required'
            })
        }

        next()

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: 'error',
                error: 'Token expired'
            })
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: 'error',
                error: 'Invalid token'
            })
        }

        console.error('[adminMiddleware] Unexpected error:', error)

        return res.status(500).json({
            status: 'error',
            error: 'Internal Server Error'
        })
    }
}

module.exports = adminMiddleware