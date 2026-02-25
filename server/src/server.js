const dotenv = require('dotenv')
dotenv.config()

const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')
const setupSocket = require('../sockets/socket')

const supaRouter = require('../routes/supaRouter')
const authRoutes = require('../routes/authRouter')
const kbRouter = require('../routes/kbRouter')
const chatRouter = require('../routes/chatRouter')
const { startupCheck } = require('../controllers/supabaseController')
const healthRouter = require('../routes/healthRouter')
const testRouter = require('../routes/testRouter')
const sessionRouter = require('../routes/sessionRouter')


startupCheck()


const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api', supaRouter)
app.use('/api/health', healthRouter)
app.use('/api/auth', authRoutes)
app.use('/api/kb', kbRouter)
app.use('/api/chat', chatRouter)
app.use('/api/test', testRouter)
app.use('/api/session', sessionRouter)

const server = http.createServer(app)
const io = new Server(server, {
    cors: {
        origin: "*",
    }
})

// Wire up socket authentication + events
setupSocket(io)

const PORT = process.env.PORT || 5180
server.listen(PORT, () => {
    console.log(` Server running at http://localhost:${PORT}`)
    console.log(` Health Check: http://localhost:${PORT}/api/health `)
})
