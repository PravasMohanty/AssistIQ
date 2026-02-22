const express = require('express')
const dotenv = require('dotenv')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')

dotenv.config()

const supaRouter = require('../routes/supaRouter')
const authRoutes = require('../routes/authRoutes')
const { supabase } = require('../config/supabase')
const checkSupabaseConnection = require('../utils/supaBaseConnection')
const healthRouter = require('../routes/healthRouter')


checkSupabaseConnection()


const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api', supaRouter)
app.use('/api/health', healthRouter)
app.use('/api/auth', authRoutes)

const server = http.Server(app)
const PORT = process.env.PORT
server.listen(PORT || 5180, () => {
    console.log(` Server running at http://localhost:${PORT}`)
    console.log(` Health Check: http://localhost:${PORT}/api/health `)
})
