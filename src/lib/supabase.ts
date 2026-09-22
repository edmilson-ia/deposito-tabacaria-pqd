import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

// Somente a chave pública (anon/publishable). A service key NUNCA vai para o navegador.
export const supabase = createClient(url ?? '', anon ?? '')
