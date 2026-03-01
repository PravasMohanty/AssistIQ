const { supabase } = require('../config/supabase')

const createSession = async (req, res) => {
    try {
        const user_id = req.user.id

        // Auto-resolve existing active sessions for this user
        const { error: resolveError } = await supabase
            .from('chat_sessions')
            .update({ status: 'resolved' })
            .eq('user_id', user_id)
            .eq('status', 'active')

        if (resolveError) throw resolveError

        const { data, error } = await supabase
            .from('chat_sessions')
            .insert({
                user_id,
                title: 'New Chat',
                status: 'active'
            })
            .select()
            .single()

        if (error) throw error

        res.json({ status: 'success', data })
    } catch (error) {
        console.error('[createSession]', error)
        return res.status(500).json({ status: 'error', error: 'Failed to create session' })
    }
}

const getCurrentSession = async (req, res) => {
    try {
        const user_id = req.user.id

        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('user_id', user_id)
            .eq('status', 'active') // Only get active sessions
            .order('created_at', { ascending: false })
            .limit(1)

        if (error) throw error

        // Handle empty result
        if (!data || data.length === 0) {
            return res.json({ status: 'success', data: null })
        }

        res.json({ status: 'success', data: data[0] })
    } catch (error) {
        console.error('[getCurrentSession]', error)
        return res.status(500).json({ status: 'error', error: 'Failed to get current session' })
    }
}

const resolveSession = async (req, res) => {
    try {
        const { session_id } = req.body

        // Validate input
        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' })
        }

        // SECURITY: Verify ownership
        const { data: session, error: fetchError } = await supabase
            .from('chat_sessions')
            .select('user_id')
            .eq('id', session_id)
            .single()

        if (fetchError || !session) {
            return res.status(404).json({ error: 'Session not found' })
        }

        if (session.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Unauthorized access to this session' })
        }

        // Update session status (not 'resolved' field)
        const { data, error } = await supabase
            .from('chat_sessions')
            .update({ status: 'resolved' })
            .eq('id', session_id)
            .select()
            .single()

        if (error) throw error

        res.json({ status: 'success', data })
    } catch (error) {
        console.error('[resolveSession]', error)
        return res.status(500).json({ status: 'error', error: 'Failed to resolve session' })
    }
}

const getAllSessions = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('chat_sessions')
            .select('id, user_id, title, status, created_at')
            .order('created_at', { ascending: false })

        if (error) throw error

        return res.json({ status: 'success', sessions: data || [] })
    } catch (error) {
        console.error('[getAllSessions]', error)
        return res.status(500).json({ error: 'Failed to fetch sessions' })
    }
}

module.exports = { createSession, getCurrentSession, resolveSession, getAllSessions }