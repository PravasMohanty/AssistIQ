const { supabase } = require('../config/supabase')


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
            results[table] = 'Accessible'
        }
    }

    return { allOk, results }
}

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

const startupCheck = async () => {
    try {
        const { allOk, results } = await verifySchema()
        if (allOk) {
            console.log('Supabase Connection: Successful')
        } else {
            console.warn('Supabase Connection: Partial Success (Check tables)')
            console.log('Table results:', results) // ← add this
        }
    } catch (err) {
        console.error('Supabase Connection Error:', err.message)
    }
}

module.exports = { testConnection, startupCheck }
