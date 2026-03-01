// src/api/index.js
export { authAPI } from './auth'
export { sessionAPI } from './session'
export { chatAPI } from './chat'
export { kbAPI } from './kb'
export { healthAPI } from './health'
export { testAPI } from './test'
export { default as api } from './api'

// Supabase exports
export { supabase, getSession, getToken } from '../config/supabase'

// Socket exports
export {
    connectSocket,
    getSocket,
    disconnectSocket,
    sendMessage,
    onMessageReceived,
    offMessageReceived
} from '../socket/socket'

// Convenience function - Initialize app
export const initializeApp = async () => {
    try {
        // Check health
        const health = await healthAPI.check()
        console.log('✅ API Health:', health)

        // Check authentication
        const { data: { session } } = await supabase.auth.getSession()

        if (session) {
            console.log('✅ User authenticated')
            // Connect socket
            await connectSocket()
        } else {
            console.log('⚠️ User not authenticated')
        }

        return { healthy: true, authenticated: !!session }
    } catch (error) {
        console.error('❌ App initialization failed:', error)
        return { healthy: false, authenticated: false, error }
    }
}