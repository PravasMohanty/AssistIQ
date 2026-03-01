const { supabase } = require('../config/supabase')

// Login as regular user, then verify token through authMiddleware
const testUserLogin = async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ status: 'error', error: 'Email and password are required' })
        }

        // Step 1: Sign in via Supabase
        // Renamed data to authData to avoid variable shadowing
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

        if (authError) {
            return res.status(401).json({ status: 'error', error: authError.message })
        }

        // Step 2: Verify the token we just got by calling getUser
        const token = authData.session?.access_token;
        const { data: userData, error: verifyError } = await supabase.auth.getUser(token)

        // Fixed bug: checking userData.user instead of undefined 'user'
        if (verifyError || !userData.user) {
            return res.status(401).json({ status: 'error', error: 'Token verification failed' })
        }

        // Step 3: Return full auth check result AND the token
        return res.status(200).json({
            user: userData.user,
            token: token // <-- You can now copy this from Postman!
        })
    } catch (error) {
        console.error('[testUserLogin] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

// Login as admin, then verify token + admin role through adminMiddleware logic
const testAdminLogin = async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ status: 'error', error: 'Email and password are required' })
        }

        // Step 1: Sign in via Supabase
        // Renamed to authData to avoid variable shadowing
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

        if (authError) {
            return res.status(401).json({ status: 'error', error: authError.message })
        }

        // Step 2: Verify the token
        const token = authData.session?.access_token
        const { data: { user }, error: verifyError } = await supabase.auth.getUser(token)

        if (verifyError || !user) {
            return res.status(401).json({ status: 'error', error: 'Token verification failed' })
        }

        // Step 3: Check admin role (same logic as adminMiddleware)
        const isAdmin = user.app_metadata?.role === 'admin'

        // Return the user, admin status, AND the token
        return res.status(200).json({
            is_admin: isAdmin,
            user,
            token // <-- You can now copy this from Postman!
        })
    } catch (error) {
        console.error('[testAdminLogin] Unexpected error:', error)
        return res.status(500).json({ status: 'error', error: 'Internal Server Error' })
    }
}

module.exports = { testUserLogin, testAdminLogin }