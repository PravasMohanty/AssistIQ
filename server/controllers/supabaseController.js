const { pool } = require('../config/db')


const verifySchema = async () => {
    const tables = [
        'profiles',
        'chat_sessions',
        'messages',
    ]

    const results = {}
    let allOk = true

    for (const table of tables) {
        try {
            const result = await pool.query(
                `
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = $1
                ) AS exists
                `,
                [table]
            )

            if (result.rows[0].exists) {
                results[table] = 'Accessible'
            } else {
                results[table] = 'Table not found'
                allOk = false
            }

        } catch (err) {
            results[table] = `Error: ${err.message}`
            allOk = false
        }
    }

    return { allOk, results }
}


const testConnection = async (req, res) => {
    try {
        const { allOk, results } = await verifySchema()

        res.json({
            status: allOk ? 'success' : 'partial_success',
            message: 'PostgreSQL Schema Verification',
            tables: results
        })

    } catch (err) {
        res.status(500).json({
            status: 'error',
            error: err.message
        })
    }
}


const startupCheck = async () => {
    try {
        const { allOk, results } = await verifySchema()

        if (allOk) {
            console.log('PostgreSQL Connection: Successful')
        } else {
            console.warn(
                'PostgreSQL Connection: Partial Success (Check tables)'
            )

            console.log('Table results:', results)
        }

    } catch (err) {
        console.error(
            'PostgreSQL Connection Error:',
            err.message
        )
    }
}


module.exports = {
    testConnection,
    startupCheck
}