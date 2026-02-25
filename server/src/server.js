const express = require('express')
const dotenv = require('dotenv')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

dotenv.config()

const supaRouter = require('../routes/supaRouter')
const authRoutes = require('../routes/authRouter')
const kbRouter = require('../routes/kbRouter')
const chatRouter = require('../routes/chatRouter')
const { supabase } = require('../config/supabase')
const { startupCheck } = require('../controllers/supabaseController')
const healthRouter = require('../routes/healthRouter')
const testRouter = require('../routes/testRouter')


startupCheck()


const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded())

app.use('/api', supaRouter)
app.use('/api/health', healthRouter)
app.use('/api/auth', authRoutes)
app.use('/api/kb', kbRouter)
app.use('/api/chat', chatRouter)
app.use('/api/test', testRouter)

const server = http.Server(app)
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust as needed for security
    }
})

io.on('connection', (socket) => {
    console.log(`⚡ Socket connected: ${socket.id}`)

    socket.on('disconnect', () => {
        console.log(`🔌 Socket disconnected: ${socket.id}`)
    })
})

const PORT = process.env.PORT || 5180
server.listen(PORT, () => {
    console.log(` Server running at http://localhost:${PORT}`)
    console.log(` Health Check: http://localhost:${PORT}/api/health `)
})
