const { supabase } = require('../config/supabase')
const { _searchKb, _resolveKb } = require('./kbController')

const getMessages = async (req, res) => {
    try {
        const { id } = req.params
        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Chat ID is required' })
        }
        const { data, error } = await supabase.from('messages').select('*').eq('chat_id', id).order('created_at', { ascending: true })
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

        if (!id) {
            return res.status(400).json({ status: 'error', error: 'Chat ID is required' })
        }

        const { message } = req.body

        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ status: 'error', error: 'A non-empty message string is required' })
        }

        const { error: userMsgError } = await supabase.from('messages').insert({ chat_id: id, role: 'user', content: message })
        if (userMsgError) throw userMsgError

        const context = await _searchKb(message)

        const contextString = JSON.stringify(context)

        const aiResponse = await _resolveKb(message, contextString)

        const { error: aiMsgError } = await supabase.from('messages').insert({ chat_id: id, role: 'assistant', content: aiResponse })
        if (aiMsgError) throw aiMsgError

        res.json({ status: 'success', response: aiResponse })
    } catch (err) {
        console.error('[sendMessage] Error:', err)
        res.status(500).json({ status: 'error', error: 'Failed to process message' })
    }
}


module.exports = { getMessages, sendMessage }
