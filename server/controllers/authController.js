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
    try {
        // Your authMiddleware already verified the token and attached the user to req.user
        const user = req.user

        // Supabase stores custom roles inside app_metadata
        const userRole = user.app_metadata?.role || 'user'

        // Return the exact flat structure your frontend requires
        return res.status(200).json({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name || 'user',
            role: userRole // <-- This is what unlocks the admin features in your UI
        })
    } catch (error) {
        console.error('[getProfile] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Failed to fetch profile' })
    }
}

const logout = async (req, res) => {
    try {
        // Since we are using Supabase client on frontend, 
        // server-side logout is mostly for cleaning up any server-side traces if any.
        // We'll just return success to confirm the request reached here.
        return res.json({ message: "Logout successful" })
    } catch (error) {
        res.status(500).json({ error: "Logout failed" })
    }
}

module.exports = { register, login, getProfile, logout }