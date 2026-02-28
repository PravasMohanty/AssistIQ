import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sessionAPI } from '../../api/session'
import { chatAPI } from '../../api/chat'
import { getSocket, onMessageReceived, offMessageReceived } from '../../socket/socket'
import {
    Send, Bot, User, Clock, Sparkles, Zap, Shield, MessageCircle
} from 'lucide-react'
import './ChatPage.css'

const ChatPage = () => {
    const { profile } = useAuth()

    // Session & messages
    const [session, setSession] = useState(null)
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [inputMessage, setInputMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [aiTyping, setAiTyping] = useState(false)

    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // Load or create session on mount
    useEffect(() => {
        initSession()
    }, [])

    // Auto-scroll on new messages
    useEffect(() => {
        scrollToBottom()
    }, [messages, aiTyping, scrollToBottom])

    // Socket listener — retry until socket is available
    useEffect(() => {
        let retryTimer = null
        let registered = false

        const handleMessage = (data) => {
            setAiTyping(false)
            setSending(false)
            setMessages(prev => [...prev, {
                id: data.id,
                session_id: data.chatId,
                sender_role: 'ai',
                content: data.content,
                created_at: data.created_at
            }])
        }

        const tryRegister = () => {
            try {
                onMessageReceived(handleMessage)
                registered = true
                console.log('✅ Socket listener registered')
            } catch {
                // Socket not connected yet, retry in 1s
                retryTimer = setTimeout(tryRegister, 1000)
            }
        }

        tryRegister()

        return () => {
            if (retryTimer) clearTimeout(retryTimer)
            if (registered) {
                try { offMessageReceived() } catch { /* ignore */ }
            }
        }
    }, [])

    // Get current active session or create one
    const initSession = async () => {
        try {
            setLoading(true)

            // Try to get current active session
            let currentSession = null
            try {
                const res = await sessionAPI.getCurrentSession()
                currentSession = res.session || res.data || res
            } catch {
                // No active session, create one
            }

            if (!currentSession || !currentSession.id) {
                const res = await sessionAPI.createSession()
                currentSession = res.session || res.data || res
            }

            setSession(currentSession)

            // Load existing messages for this session
            if (currentSession?.id) {
                try {
                    const msgRes = await chatAPI.getMessages(currentSession.id)
                    const msgList = msgRes.messages || msgRes.data || msgRes || []
                    setMessages(Array.isArray(msgList) ? msgList : [])
                } catch {
                    setMessages([])
                }
            }
        } catch (err) {
            console.error('Failed to init session:', err)
        } finally {
            setLoading(false)
        }
    }

    // Send message
    const handleSend = async (e) => {
        e?.preventDefault()
        const msg = inputMessage.trim()
        if (!msg || !session?.id || sending) return

        setInputMessage('')
        setSending(true)
        setAiTyping(true)

        // Optimistic add
        const tempMsg = {
            id: 'temp-' + Date.now(),
            session_id: session.id,
            sender_role: 'user',
            content: msg,
            created_at: new Date().toISOString()
        }
        setMessages(prev => [...prev, tempMsg])

        // Check if socket is connected; if so, use it. Otherwise fall back to HTTP.
        let socketConnected = false
        try {
            const sock = getSocket()
            if (sock?.connected) {
                socketConnected = true
                sock.emit('send_message', { chatId: session.id, message: msg })
            }
        } catch {
            // Socket not available
        }

        if (!socketConnected) {
            // HTTP fallback
            try {
                const res = await chatAPI.sendMessage(session.id, msg)
                setAiTyping(false)
                setSending(false)
                // Server returns { status, response: aiResponse }
                const aiContent = res.response || res.data?.content
                if (aiContent) {
                    setMessages(prev => [...prev, {
                        id: 'ai-' + Date.now(),
                        session_id: session.id,
                        sender_role: 'ai',
                        content: aiContent,
                        created_at: new Date().toISOString()
                    }])
                }
            } catch (err) {
                console.error('Send failed:', err)
                setAiTyping(false)
                setSending(false)
            }
        }

        inputRef.current?.focus()
    }

    // Handle Enter key
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const formatTime = (ts) => {
        if (!ts) return ''
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    // Loading state
    if (loading) {
        return (
            <div className="chat-loading">
                <div className="chat-loading-content">
                    <div className="chat-loading-icon">
                        <Bot size={32} />
                        <div className="chat-loading-pulse" />
                    </div>
                    <p>Initializing your session...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="chat-page">
            {/* Floating particles background */}
            <div className="chat-particles">
                <div className="particle particle-1" />
                <div className="particle particle-2" />
                <div className="particle particle-3" />
                <div className="particle particle-4" />
                <div className="particle particle-5" />
            </div>

            {/* Messages Area */}
            <div className="chat-messages">
                {messages.length === 0 && !aiTyping ? (
                    <div className="chat-welcome fade-in">
                        <div className="welcome-icon">
                            <Bot size={44} />
                            <Sparkles size={18} className="welcome-sparkle" />
                        </div>
                        <h2>Hello, {profile?.name || 'there'}! 👋</h2>
                        <p>I'm your AI assistant. How can I help you today?</p>

                        <div className="welcome-features">
                            <div className="feature-card glass-card">
                                <Zap size={20} className="feature-icon" />
                                <span>Instant Answers</span>
                            </div>
                            <div className="feature-card glass-card">
                                <Shield size={20} className="feature-icon" />
                                <span>Secure & Private</span>
                            </div>
                            <div className="feature-card glass-card">
                                <MessageCircle size={20} className="feature-icon" />
                                <span>24/7 Support</span>
                            </div>
                        </div>

                        <div className="welcome-suggestions">
                            <p className="suggestions-label">Try asking:</p>
                            <div className="suggestions-list">
                                {['How can I reset my password?', 'What are your business hours?', 'Help me with my account'].map((q, i) => (
                                    <button
                                        key={i}
                                        className="suggestion-chip"
                                        onClick={() => { setInputMessage(q); inputRef.current?.focus() }}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`message ${msg.sender_role === 'user' ? 'message-user' : 'message-ai'} fade-in`}
                            >
                                <div className="message-avatar">
                                    {msg.sender_role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>
                                <div className="message-content">
                                    <div className="message-bubble">
                                        {msg.content}
                                    </div>
                                    <span className="message-time">
                                        <Clock size={11} />
                                        {formatTime(msg.created_at)}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {aiTyping && (
                            <div className="message message-ai fade-in">
                                <div className="message-avatar">
                                    <Bot size={16} />
                                </div>
                                <div className="message-content">
                                    <div className="message-bubble typing-indicator">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form className="chat-input-bar" onSubmit={handleSend}>
                <div className="chat-input-wrapper">
                    <input
                        ref={inputRef}
                        className="chat-input"
                        type="text"
                        placeholder="Type your message..."
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={sending}
                    />
                    <button
                        className={`send-btn ${inputMessage.trim() ? 'send-btn-active' : ''}`}
                        type="submit"
                        disabled={!inputMessage.trim() || sending}
                    >
                        <Send size={18} />
                    </button>
                </div>
                <p className="chat-disclaimer">AssistIQ may make mistakes. Please verify important information.</p>
            </form>
        </div>
    )
}

export default ChatPage
