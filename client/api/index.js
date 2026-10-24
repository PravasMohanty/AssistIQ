// src/api/index.js
import { authAPI } from './auth'
import { healthAPI } from './health'
import { connectSocket } from '../socket/socket'

export { authAPI } from './auth'
export { sessionAPI } from './session'
export { chatAPI } from './chat'
export { kbAPI } from './kb'
export { healthAPI } from './health'
export { testAPI } from './test'
export { default as api } from './api'

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

        const authenticated = await authAPI.isAuthenticated()

        if (authenticated) {
            console.log('✅ User authenticated')
            await authAPI.getProfile()
            await connectSocket()
        } else {
            console.log('⚠️ User not authenticated')
        }

        return { healthy: true, authenticated }
    } catch (error) {
        console.error('❌ App initialization failed:', error)
        return { healthy: false, authenticated: false, error }
    }
}