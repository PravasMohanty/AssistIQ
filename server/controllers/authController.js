const { supabase } = require('../config/supabase')

// Register
const register = async (req, res) => {
    try {
        const { email, password, name } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' })
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name: name || '' } }
        })

        if (error) return res.status(400).json({ error: error.message })

        res.status(201).json({
            message: 'User registered successfully',
            user: data.user
        })
    } catch {
        res.status(500).json({ error: 'Registration failed' })
    }
}

// Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (error) return res.status(401).json({ error: error.message })

        res.json({
            message: 'Login successful',
            user: data.user,
            access_token: data.session?.access_token
        })
    } catch {
        res.status(500).json({ error: 'Login failed' })
    }
}

// Profile
const getProfile = async (req, res) => {
    res.json({ user: req.user })
}

const logout = async (req, res) => {
    res.json({ message: "Remove token from client storage" })
}

module.exports = { register, login, getProfile, logout }