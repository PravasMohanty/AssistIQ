// src/config/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper to get current session
export const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session
}

// Helper to get token
export const getToken = async () => {
    const session = await getSession()
    return session?.access_token || null
}