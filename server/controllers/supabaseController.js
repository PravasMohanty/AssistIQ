const { supabase } = require('../config/supabase')

// Core logic to verify connection and schema
const verifySchema = async () => {
    const tables = ['profiles', 'chat_sessions', 'messages', 'knowledge_base']
    const results = {}
    let allOk = true

    for (const table of tables) {
        const { error } = await supabase.from(table).select('*').limit(0)
        if (error) {
            results[table] = `Error: ${error.message}`
            allOk = false
        } else {
            results[table] = '✅ Accessible'
        }
    }

    return { allOk, results }
}

// Request handler for supaRouter
const testConnection = async (req, res) => {
    try {
        const { allOk, results } = await verifySchema()

        res.json({
            status: allOk ? "success" : "partial_success",
            message: "Supabase Schema Verification",
            tables: results
        })
    } catch (err) {
        res.status(500).json({ status: "error", error: err.message })
    }
}

// Logic for server startup check
const startupCheck = async () => {
    try {
        const { allOk } = await verifySchema()
        if (allOk) {
            console.log('✅ Supabase Connection: Successful')
        } else {
            console.warn('⚠️ Supabase Connection: Partial Success (Check tables)')
        }
    } catch (err) {
        console.error('❌ Supabase Connection Error:', err.message)
    }
}

module.exports = { testConnection, startupCheck }
