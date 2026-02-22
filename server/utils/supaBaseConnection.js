const { supabase } = require('../config/supabase')

const checkSupabaseConnection = async () => {
    try {
        const { error } = await supabase.from('_test').select('*').limit(1)

        // If there's no error, or if the error is just that the table/rows don't exist, 
        // it means we successfully connected to the Supabase API.
        if (!error || error.code === 'PGRST116' || error.message.includes('Could not find the table')) {
            console.log('✅ Supabase Connection: Successful')
        } else {
            throw error
        }
    } catch (err) {
        console.error('❌ Supabase Connection Error:', err.message)
    }
}

module.exports = checkSupabaseConnection