const { Pool } = require('pg')

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'assistiq',
    user: process.env.DB_USER || 'assistiq',
    password: process.env.DB_PASSWORD || 'assistiq_password'
})

pool.on('error', (err) => {
    console.error('[PostgreSQL] Unexpected error:', err)
})

module.exports = {
    pool
}