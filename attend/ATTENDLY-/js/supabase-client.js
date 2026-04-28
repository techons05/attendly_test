import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

const supabaseURL = 'https://iyshoegwxmjvpdlpwoap.supabase.co'
const supabseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5c2hvZWd3eG1qdnBkbHB3b2FwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjQ3NzEsImV4cCI6MjA4NjY0MDc3MX0._1fw6MkgPusdRrprLjWc5KvAI5V6Z_Th_FHkvA_uvWA'

const supabase =createClient(supabaseURL,supabseKey)

export default supabase