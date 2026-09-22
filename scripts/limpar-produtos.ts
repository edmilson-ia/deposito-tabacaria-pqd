/**
 * Apaga TODOS os produtos do catálogo, depois de fazer um backup em JSON.
 * Uso: tsx scripts/limpar-produtos.ts --confirmar
 * (sem --confirmar só mostra quantos produtos seriam apagados, não faz nada)
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { writeFileSync } from 'node:fs'

async function main() {
  const confirmar = process.argv.includes('--confirmar')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: produtos, error } = await sb.from('produtos').select('*').order('id')
  if (error) throw error

  const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
  const caminho = `dados/backup-produtos-${carimbo}.json`
  writeFileSync(caminho, JSON.stringify(produtos, null, 2), 'utf8')
  console.log(`Backup de ${produtos!.length} produto(s) salvo em ${caminho}`)

  if (!confirmar) {
    console.log('Nada apagado (rode com --confirmar para apagar de verdade).')
    return
  }

  const { error: delErro, count } = await sb.from('produtos').delete({ count: 'exact' }).not('id', 'is', null)
  if (delErro) throw delErro
  console.log(`Apagados ${count} produto(s).`)
}

main().catch((e) => {
  console.error('ERRO:', e.message ?? e)
  process.exit(1)
})
