const { supabase } = require('../config/supabase')
const { _searchKb, _resolveKb } = require('./kbController')

const getMessages = async (req, res) => {
    try {
        const { id } = req.params
        const user_id = req.user.id

        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Chat ID is required' })
        }

        // SECURITY: Verify session ownership
        const { data: session, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('user_id')
            .eq('id', id)
            .single()

        if (sessionError || !session) {
            return res.status(404).json({ status: 'error', error: 'Session not found' })
        }

        if (session.user_id !== user_id) {
            return res.status(403).json({ status: 'error', error: 'Unauthorized access to this session' })
        }

        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('session_id', id)
            .order('created_at', { ascending: true })

        if (error) throw error
        res.json({ status: 'success', data })
    } catch (err) {
        console.error('[getMessages] Error:', err)
        res.status(500).json({ status: 'error', error: 'Failed to fetch messages' })
    }
}

const sendMessage = async (req, res) => {
    try {
        const { id } = req.params
        const user_id = req.user.id

        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Chat ID is required' })
        }

        const { message } = req.body

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ status: 'error', error: 'A non-empty message string is required' })
        }

        // SECURITY & CONSISTENCY: Verify ownership AND active status
        const { data: session, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('user_id, status')
            .eq('id', id)
            .single()

        if (sessionError || !session) {
            return res.status(404).json({ status: 'error', error: 'Session not found' })
        }

        if (session.user_id !== user_id) {
            return res.status(403).json({ status: 'error', error: 'Unauthorized access to this session' })
        }

        if (session.status !== 'active') {
            return res.status(400).json({ status: 'error', error: 'Cannot send messages to a resolved session' })
        }

        const { error: userMsgError } = await supabase.from('messages').insert({ session_id: id, sender_role: 'customer', content: message })
        if (userMsgError) throw userMsgError

        const context = await _searchKb(message)
        const contextString = JSON.stringify(context)
        const aiResponse = await _resolveKb(message, contextString)

        const { error: aiMsgError } = await supabase.from('messages').insert({ session_id: id, sender_role: 'ai', content: aiResponse })
        if (aiMsgError) throw aiMsgError

        res.json({ status: 'success', response: aiResponse })
    } catch (err) {
        console.error('[sendMessage] Error:', err)
        res.status(500).json({ status: 'error', error: 'Failed to process message' })
    }
}


module.exports = { getMessages, sendMessage }
