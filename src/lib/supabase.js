import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create the client and force it to ignore Local Storage
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false // This stops it from using old cached tokens
  }
})