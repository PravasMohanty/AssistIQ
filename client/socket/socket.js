// src/socket/socket.js
import { io } from 'socket.io-client'
import { getToken } from '../config/supabase'

let socket = null

// Connect to Socket.io with Supabase token
export const connectSocket = async () => {
    if (socket?.connected) {
        return socket
    }

    const token = await getToken()

    if (!token) {
        throw new Error('No authentication token available')
    }

    socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5180', {
        auth: {
            token
        },
        transports: ['websocket', 'polling']
    })

    // Connection handlers
    socket.on('connect', () => {
        console.log('✅ Socket connected:', socket.id)
    })

    socket.on('disconnect', (reason) => {
        console.log('❌ Socket disconnected:', reason)
    })

    socket.on('error', (error) => {
        console.error('Socket error:', error)
    })

    return socket
}

// Get existing socket instance
export const getSocket = () => {
    if (!socket) {
        throw new Error('Socket not connected. Call connectSocket() first.')
    }
    return socket
}

// Disconnect socket
export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect()
        socket = null
        console.log('Socket disconnected')
    }
}

// Send message via socket
export const sendMessage = (chatId, message) => {
    const socket = getSocket()
    socket.emit('send_message', { chatId, message })
}

// Listen for messages
export const onMessageReceived = (callback) => {
    const socket = getSocket()
    socket.on('receive_message', callback)
}

// Remove message listener
export const offMessageReceived = () => {
    const socket = getSocket()
    socket.off('receive_message')
}