import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sessionAPI } from '../../api/session'
import { chatAPI } from '../../api/chat'
import { getSocket, onMessageReceived, offMessageReceived } from '../../socket/socket'
import {
    Send, Bot, User, Clock, Sparkles, Zap, Shield, MessageCircle,
    CheckCircle, RefreshCw
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
    const [socketConnected, setSocketConnected] = useState(false)
    const [connectionError, setConnectionError] = useState(null)
    const [resolved, setResolved] = useState(false)
    const [resolving, setResolving] = useState(false)

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
        let retryCount = 0
        const maxRetries = 10

        const handleMessage = (data) => {
            console.log('📨 Received message from socket:', data)
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
                const sock = getSocket()
                if (sock?.connected) {
                    onMessageReceived(handleMessage)
                    registered = true
                    setSocketConnected(true)
                    setConnectionError(null)
                    console.log('✅ Socket listener registered successfully')
                } else {
                    throw new Error('Socket not connected')
                }
            } catch (err) {
                retryCount++
                console.warn(`⚠️ Socket registration attempt ${retryCount}/${maxRetries} failed:`, err.message)

                if (retryCount >= maxRetries) {
                    console.error('❌ Socket connection failed after max retries. Using HTTP fallback.')
                    setSocketConnected(false)
                    setConnectionError('Real-time chat unavailable. Using standard mode.')
                } else {
                    // Retry with exponential backoff
                    const delay = Math.min(1000 * Math.pow(1.5, retryCount - 1), 10000)
                    retryTimer = setTimeout(tryRegister, delay)
                }
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
            console.log('🔄 Initializing chat session...')
            setLoading(true)
            setConnectionError(null)

            // Try to get current active session
            let currentSession = null
            try {
                console.log('📡 Fetching current session...')
                const res = await sessionAPI.getCurrentSession()
                currentSession = res.session || res.data || res
                console.log('✅ Found existing session:', currentSession?.id)
            } catch (err) {
                console.log('ℹ️ No active session found, creating new one...')
            }

            if (!currentSession || !currentSession.id) {
                try {
                    console.log('🆕 Creating new session...')
                    const res = await sessionAPI.createSession()
                    currentSession = res.session || res.data || res
                    console.log('✅ New session created:', currentSession?.id)
                } catch (err) {
                    console.error('❌ Failed to create session:', err)
                    setConnectionError('Could not create chat session. Check your connection and try refreshing.')
                    throw err
                }
            }

            setSession(currentSession)

            // Load existing messages for this session
            if (currentSession?.id) {
                try {
                    console.log('📥 Loading message history...')
                    const msgRes = await chatAPI.getMessages(currentSession.id)
                    const msgList = msgRes.messages || msgRes.data || msgRes || []
                    setMessages(Array.isArray(msgList) ? msgList : [])
                    console.log(`✅ Loaded ${msgList.length} messages`)
                } catch (err) {
                    console.warn('⚠️ Failed to load messages (non-critical):', err.message)
                    setMessages([])
                }
            }
        } catch (err) {
            console.error('❌ Session initialization failed:', err)
            setConnectionError(`Failed to initialize: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    // Send message
    const handleSend = async (e) => {
        e?.preventDefault()
        const msg = inputMessage.trim()
        if (!msg || !session?.id || sending) return

        console.log('📤 Sending message:', msg.substring(0, 50) + '...')
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

        // Try socket first, fall back to HTTP
        let useSocket = false
        try {
            const sock = getSocket()
            if (sock?.connected) {
                console.log('✅ Using WebSocket to send message')
                sock.emit('send_message', { chatId: session.id, message: msg })
                useSocket = true
            } else {
                console.log('ℹ️ Socket not connected, using HTTP fallback')
            }
        } catch (err) {
            console.warn('⚠️ Socket send failed, using HTTP fallback:', err.message)
        }

        if (!useSocket) {
            // HTTP fallback
            try {
                console.log('📡 Sending via HTTP...')
                const res = await chatAPI.sendMessage(session.id, msg)
                setAiTyping(false)
                setSending(false)

                // Server returns { status, response: aiResponse }
                const aiContent = res.response || res.data?.content
                if (aiContent) {
                    console.log('✅ Received AI response via HTTP')
                    setMessages(prev => [...prev, {
                        id: 'ai-' + Date.now(),
                        session_id: session.id,
                        sender_role: 'ai',
                        content: aiContent,
                        created_at: new Date().toISOString()
                    }])
                } else {
                    console.warn('⚠️ No AI response content received')
                }
            } catch (err) {
                console.error('❌ HTTP send failed:', err)
                setAiTyping(false)
                setSending(false)

                // Show error to user
                setMessages(prev => [...prev, {
                    id: 'error-' + Date.now(),
                    session_id: session.id,
                    sender_role: 'ai',
                    content: `❌ Failed to send message: ${err.message}. Please try again.`,
                    created_at: new Date().toISOString()
                }])
            }
        }

        inputRef.current?.focus()
    }

    // Resolve session
    const handleResolve = async () => {
        if (!session?.id || resolving) return
        setResolving(true)
        try {
            await sessionAPI.resolveSession(session.id)
            setResolved(true)
        } catch (err) {
            console.error('Failed to resolve session:', err)
        } finally {
            setResolving(false)
        }
    }

    // Start a new chat after resolving
    const handleNewChat = async () => {
        setResolved(false)
        setMessages([])
        setSession(null)
        setLoading(true)
        await initSession()
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

            {/* Connection Error Banner */}
            {connectionError && (
                <div style={{
                    padding: '12px 24px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 10
                }}>
                    ⚠️ {connectionError}
                </div>
            )}

            {/* Socket Status Indicator */}
            {!socketConnected && !connectionError && (
                <div style={{
                    padding: '8px 24px',
                    background: 'rgba(251, 191, 36, 0.15)',
                    borderBottom: '1px solid rgba(251, 191, 36, 0.3)',
                    color: '#f59e0b',
                    fontSize: '0.75rem',
                    textAlign: 'center',
                    position: 'relative',
                    zIndex: 10
                }}>
                    🔄 Real-time mode unavailable - using standard mode
                </div>
            )}

            {/* Messages Area */}
            <div className="chat-messages">
                {messages.length === 0 && !aiTyping ? (
                    <div className="chat-welcome fade-in">
                        <div className="welcome-icon">
                            <Bot size={44} />
                            <Sparkles size={18} className="welcome-sparkle" />
                        </div>
                        <h2>Welcome, {profile?.name || 'there'}! 👋</h2>
                        <p>How can we help you today? Our support team is here for you.</p>

                        <div className="welcome-features">
                            <div className="feature-card glass-card">
                                <Zap size={20} className="feature-icon" />
                                <span>Quick Resolutions</span>
                            </div>
                            <div className="feature-card glass-card">
                                <Shield size={20} className="feature-icon" />
                                <span>Secure & Private</span>
                            </div>
                            <div className="feature-card glass-card">
                                <MessageCircle size={20} className="feature-icon" />
                                <span>24/7 Availability</span>
                            </div>
                        </div>

                        <div className="welcome-suggestions">
                            <p className="suggestions-label">Common questions:</p>
                            <div className="suggestions-list">
                                {['How do I reset my password?', 'I need help with my order', 'How can I update my account details?'].map((q, i) => (
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

                {/* Resolve session prompt — appears after some messages */}
                {messages.length >= 2 && !resolved && !aiTyping && (
                    <div className="resolve-prompt fade-in">
                        <div className="resolve-prompt-inner glass-card">
                            <p>Are your queries resolved?</p>
                            <div className="resolve-prompt-actions">
                                <button
                                    className="btn btn-sm resolve-btn-yes"
                                    onClick={handleResolve}
                                    disabled={resolving}
                                >
                                    {resolving ? (
                                        <div className="loader-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                    ) : (
                                        <><CheckCircle size={14} /> Yes, all done!</>
                                    )}
                                </button>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => inputRef.current?.focus()}
                                >
                                    No, I have more questions
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Resolved screen */}
            {resolved && (
                <div className="resolved-screen fade-in">
                    <div className="resolved-content glass-card">
                        <div className="resolved-icon">
                            <CheckCircle size={40} />
                        </div>
                        <h3>Issue Resolved! 🎉</h3>
                        <p>Glad we could help! Your support ticket has been closed.</p>
                        <button className="btn btn-primary" onClick={handleNewChat}>
                            <RefreshCw size={16} />
                            Start New Chat
                        </button>
                    </div>
                </div>
            )}

            {/* Input Bar — hidden when resolved */}
            {!resolved && (
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
                        {messages.length >= 1 && (
                            <button
                                type="button"
                                className="resolve-icon-btn"
                                onClick={handleResolve}
                                disabled={resolving}
                                title="Resolve this session"
                            >
                                <CheckCircle size={18} />
                            </button>
                        )}
                        <button
                            className={`send-btn ${inputMessage.trim() ? 'send-btn-active' : ''}`}
                            type="submit"
                            disabled={!inputMessage.trim() || sending}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    <p className="chat-disclaimer">Powered by AssistIQ — responses are generated from our knowledge base.</p>
                </form>
            )}
        </div>
    )
}

export default ChatPage