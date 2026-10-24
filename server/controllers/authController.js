const bcrypt = require('bcrypt')
const { timingSafeEqual } = require('crypto')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/db')


const JWT_SECRET = process.env.JWT_SECRET

const normalizeEmail = (email) => (
    typeof email === 'string' ? email.trim().toLowerCase() : ''
)

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

if (!JWT_SECRET) {
    throw new Error('Missing JWT_SECRET in environment variables')
}


// Register
const register = async (req, res) => {
    try {
        const { password, name, adminCode } = req.body || {}
        const email = normalizeEmail(req.body?.email)

        if (!isValidEmail(email) || typeof password !== 'string' || !password) {
            return res.status(400).json({
                error: 'A valid email and password are required'
            })
        }

        let role = 'user'
        if (typeof adminCode === 'string' && adminCode.trim()) {
            const configuredAdminCode = process.env.ADMIN_SIGNUP_CODE
            if (!configuredAdminCode) {
                return res.status(503).json({ error: 'Admin signup is not configured' })
            }

            const providedCode = Buffer.from(adminCode.trim())
            const expectedCode = Buffer.from(configuredAdminCode)
            if (
                providedCode.length !== expectedCode.length ||
                !timingSafeEqual(providedCode, expectedCode)
            ) {
                return res.status(403).json({ error: 'Invalid admin code' })
            }

            role = 'admin'
        }

        // Check whether user already exists
        const existingUser = await pool.query(
            `
            SELECT id
            FROM profiles
            WHERE email = $1
            `,
            [email]
        )

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                error: 'User already exists'
            })
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12)

        // Create user
        const result = await pool.query(
            `
            INSERT INTO profiles
                (email, password_hash, name, role)
            VALUES
                ($1, $2, $3, $4)
            RETURNING id, email, name, role, created_at
            `,
            [
                email,
                passwordHash,
                name || '',
                role
            ]
        )

        const user = result.rows[0]

        res.status(201).json({
            message: 'User registered successfully',
            user
        })

    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'User already exists' })
        }

        console.error('[register]', error)

        res.status(500).json({
            error: 'Registration failed'
        })
    }
}


// Login
const login = async (req, res) => {
    try {
        const { password } = req.body || {}
        const email = normalizeEmail(req.body?.email)

        if (!isValidEmail(email) || typeof password !== 'string' || !password) {
            return res.status(400).json({
                error: 'A valid email and password are required'
            })
        }

        // Find user
        const result = await pool.query(
            `
            SELECT
                id,
                email,
                password_hash,
                name,
                role
            FROM profiles
            WHERE email = $1
            `,
            [email]
        )

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid email or password'
            })
        }

        const user = result.rows[0]

        // Verify password
        const passwordValid = await bcrypt.compare(
            password,
            user.password_hash
        )

        if (!passwordValid) {
            return res.status(401).json({
                error: 'Invalid email or password'
            })
        }

        // Generate JWT
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            JWT_SECRET,
            {
                expiresIn: '1h'
            }
        )

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            },
            access_token: token
        })

    } catch (error) {
        console.error('[login]', error)

        res.status(500).json({
            error: 'Login failed'
        })
    }
}


// Profile
const getProfile = async (req, res) => {
    try {
        // authMiddleware verifies the JWT
        // and attaches the authenticated user to req.user

        const userId = req.user.id

        const result = await pool.query(
            `
            SELECT
                id,
                email,
                name,
                role
            FROM profiles
            WHERE id = $1
            `,
            [userId]
        )

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            })
        }

        const user = result.rows[0]

        return res.status(200).json(user)

    } catch (error) {
        console.error('[getProfile]', error)

        return res.status(500).json({
            status: 'error',
            error: 'Failed to fetch profile'
        })
    }
}


// Logout
const logout = async (req, res) => {
    try {
        // JWT is stateless.
        // The client should delete its stored access token.

        return res.json({
            message: 'Logout successful'
        })

    } catch (error) {
        console.error('[logout]', error)

        res.status(500).json({
            error: 'Logout failed'
        })
    }
}


module.exports = {
    register,
    login,
    getProfile,
    logout
}