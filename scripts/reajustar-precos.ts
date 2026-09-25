/**
 * Reajusta o preço de TODOS os produtos em +10% (preço de vitrine = preço no cartão).
 * Faz backup dos preços atuais em dados/backup-precos-<data>.json e calcula SEMPRE a partir
 * do backup (rodar de novo não acumula reajuste). Sem --apply só mostra o que faria.
 *
 *   tsx scripts/reajustar-precos.ts            -> simulação
 *   tsx scripts/reajustar-precos.ts --apply    -> grava
 *   tsx scripts/reajustar-precos.ts --desfazer -> volta aos preços do backup
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const FATOR = 1.1
const ARQ = `dados/backup-precos-${new Date().toISOString().slice(0, 10)}.json`

async function main() {
  const apply = process.argv.includes('--apply')
  const desfazer = process.argv.includes('--desfazer')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  let base: { id: number; nome: string; unidade: string; preco: number }[]
  if (existsSync(ARQ)) {
    base = JSON.parse(readFileSync(ARQ, 'utf8'))
    console.log(`Usando o backup existente: ${ARQ} (${base.length} produtos)`)
  } else {
    const { data, error } = await sb.from('produtos').select('id, nome, unidade, preco').order('id')
    if (error) throw error
    base = data!.map((p) => ({ ...p, preco: Number(p.preco) }))
    if (apply) {
      mkdirSync('dados', { recursive: true })
      writeFileSync(ARQ, JSON.stringify(base, null, 2))
      console.log(`Backup salvo: ${ARQ} (${base.length} produtos)`)
    }
  }

  let n = 0
  for (const p of base) {
    const novo = desfazer ? p.preco : Math.round(p.preco * FATOR * 100) / 100
    if (n < 8) console.log(`  ${p.nome} [${p.unidade}]: R$ ${p.preco.toFixed(2)} -> R$ ${novo.toFixed(2)}`)
    n++
    if (!apply && !desfazer) continue
    const { error } = await sb.from('produtos').update({ preco: novo }).eq('id', p.id)
    if (error) throw new Error(`${p.nome}: ${error.message}`)
  }
  console.log(`\n${apply || desfazer ? 'Aplicado' : 'Simulação (nada gravado)'}: ${base.length} produtos.`)
}

main().catch((e) => {
  console.error('\nERRO:', e instanceof Error ? e.message : e)
  process.exit(1)
})
