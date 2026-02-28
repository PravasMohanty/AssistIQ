const { supabase } = require('../config/supabase')
const { _searchKb, _resolveKb } = require('../controllers/kbController')

const setupSocket = (io) => {

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token

            if (!token) {
                return next(new Error('No token provided'))
            }

            const { data: { user }, error } = await supabase.auth.getUser(token)

            if (error || !user) {
                return next(new Error('Invalid or expired token'))
            }

            socket.user = {
                id: user.id,
                email: user.email,
                role: user.app_metadata?.role || 'user'
            }
            next()
        } catch (err) {
            next(new Error('Authentication failed'))
        }
    })

    io.on('connection', (socket) => {
        console.log(`⚡ Socket connected: ${socket.user.email} (${socket.id})`)

        socket.on('send_message', async ({ chatId, message }) => {
            try {
                // Validate input
                if (!chatId || !message || typeof message !== 'string' || !message.trim()) {
                    return socket.emit('error', { error: 'chatId and a non-empty message are required' })
                }

                const trimmedMessage = message.trim()

                // Check session ownership (SECURITY)
                const { data: session, error: sessionError } = await supabase
                    .from('chat_sessions')
                    .select('user_id')
                    .eq('id', chatId)
                    .single()

                if (sessionError || !session) {
                    return socket.emit('error', { error: 'Chat session not found' })
                }

                if (session.user_id !== socket.user.id) {
                    return socket.emit('error', { error: 'Unauthorized access to this chat' })
                }

                // 1. Save user's message (FIX: use session_id and sender_role)
                const { error: userMsgError } = await supabase
                    .from('messages')
                    .insert({ session_id: chatId, sender_role: 'user', content: trimmedMessage })

                if (userMsgError) throw userMsgError

                // 2. Search KB with fallback
                let context = []
                try {
                    context = await _searchKb(trimmedMessage)
                } catch (err) {
                    console.error('[KB Search] Error:', err.message)
                }

                // 3. Generate AI response
                const contextString = JSON.stringify(context)
                const aiResponse = await _resolveKb(trimmedMessage, contextString)

                // 4. Save AI response
                const { data: aiMessage, error: aiMsgError } = await supabase
                    .from('messages')
                    .insert({ session_id: chatId, sender_role: 'ai', content: aiResponse })
                    .select()
                    .single()

                if (aiMsgError) throw aiMsgError

                // 5. Send response
                socket.emit('receive_message', {
                    id: aiMessage.id,
                    chatId,
                    role: 'ai',
                    content: aiResponse,
                    created_at: aiMessage.created_at
                })

            } catch (err) {
                console.error('[send_message] Error:', err.message)
                socket.emit('error', { error: 'Failed to process your message. Please try again.' })
            }
        })

        socket.on('disconnect', () => {
            console.log(`🔌 Socket disconnected: ${socket.user.email} (${socket.id})`)
        })
    })
}

module.exports = setupSocket