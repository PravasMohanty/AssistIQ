const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_PROJECT_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_PROJECT_URL or SUPABASE_SECRET_KEY in environment variables')
}

const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = { supabase }
