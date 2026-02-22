const express = require('express')
const supaRouter = express.Router()
const { supabase } = require('../config/supabase')

supaRouter.get('/test-supabase', async (req, res) => {
    try {
        const { error } = await supabase.from('_test').select('*').limit(1)

        if (!error || error.code === 'PGRST116' || error.message.includes('Could not find the table')) {
            return res.json({
                status: "success",
                message: "Supabase connected!",
                details: "Successfully reached Supabase API (Note: _test table may not exist yet, which is fine)"
            })
        }

        throw error
    } catch (err) {
        res.status(500).json({ status: "error", error: err.message })
    }
})

module.exports = supaRouter
