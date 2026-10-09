const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET) {
    throw new Error('Missing JWT_SECRET in environment variables')
}


const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                status: 'error',
                error: 'No token provided'
            })
        }

        const token = authHeader.split(' ')[1]

        const decoded = jwt.verify(token, JWT_SECRET)

        req.user = decoded

        next()

    } catch (err) {
        console.error(
            '[authMiddleware] Token validation failed:',
            err.message
        )

        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: 'error',
                error: 'Token expired'
            })
        }

        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: 'error',
                error: 'Invalid token'
            })
        }

        return res.status(401).json({
            status: 'error',
            error: 'Authentication failed'
        })
    }
}


module.exports = authMiddleware