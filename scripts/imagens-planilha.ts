/**
 * Aplica fotos vindas de links avulsos do Google Drive (arquivo por arquivo, não pasta),
 * indicados manualmente como { nome, unidade, arquivoId, force? }.
 * Uso: tsx scripts/imagens-diretas.ts --apply   (sem --apply só confere se os produtos existem)
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import Papa from 'papaparse'
import { readFileSync } from 'node:fs'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Lê a coluna de link do Drive de uma planilha CSV (UTF-8, separador ; ou ,) e casa por nome exato (un).
// Uso: tsx scripts/imagens-planilha.ts --csv=dados/arquivo.csv [--apply] [--force]
const arquivoCsv = process.argv.find((a) => a.startsWith('--csv='))?.slice(6)
if (!arquivoCsv) throw new Error('Informe --csv=<arquivo.csv>')
const force = process.argv.includes('--force')
const { data: linhas } = Papa.parse<Record<string, string>>(readFileSync(arquivoCsv, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true })
const ITENS: { nome: string; unidade: 'un' | 'cx'; arquivoId: string; force?: boolean }[] = []
for (const l of linhas) {
  const chaves = Object.keys(l)
  const nome = l[chaves.find((k) => /^produto$/i.test(k.trim())) ?? '']?.trim()
  const link = l[chaves.find((k) => /imagen|imagem|foto|link/i.test(k)) ?? '']?.trim()
  const id = link?.match(/\/d\/([\w-]+)/)?.[1]
  if (nome && id) ITENS.push({ nome, unidade: 'un', arquivoId: id, force })
}

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: produtos, error } = await sb.from('produtos').select('id, nome, unidade, imagem_url')
  if (error) throw error

  let ok = 0, falhas = 0, pulados = 0
  const cache = new Map<string, Buffer>()
  for (const it of ITENS) {
    const p = produtos!.find((x) => x.nome === it.nome && x.unidade === it.unidade)
    if (!p) { console.log(`  NÃO ACHEI produto "${it.nome}" [${it.unidade}]`); falhas++; continue }
    if (p.imagem_url && !it.force) { console.log(`  pulado (já tem foto, sem --force): ${it.nome} [${it.unidade}]`); pulados++; continue }
    if (!apply) { console.log(`  OK (dry-run) ${it.nome} [${it.unidade}] <- ${it.arquivoId}`); continue }
    try {
      let buf = cache.get(it.arquivoId)
      if (!buf) {
        const r = await fetch(`https://drive.usercontent.google.com/download?id=${it.arquivoId}&export=download&confirm=t`)
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`download falhou (HTTP ${r.status})`)
        const entrada = Buffer.from(await r.arrayBuffer())
        buf = await sharp(entrada)
          .rotate()
          .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .webp({ quality: 85 })
          .toBuffer()
        cache.set(it.arquivoId, buf)
      }
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 8)
      const caminho = `${norm(p.nome)}-${p.unidade}-${p.id}.webp`
      const up = await sb.storage.from('produtos').upload(caminho, buf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      if (up.error) throw up.error
      const publica = sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl + `?v=${hash}`
      const { error: eUp } = await sb.from('produtos').update({ imagem_url: publica }).eq('id', p.id)
      if (eUp) throw eUp
      ok++
      console.log(`  ok  ${it.nome} [${it.unidade}]`)
    } catch (e) {
      falhas++
      console.log(`  ERRO ${it.nome} [${it.unidade}]: ${e instanceof Error ? e.message : JSON.stringify(e)}`)
    }
  }
  console.log(`\n${apply ? 'Aplicado' : 'Dry-run'}: ${ok} ok, ${pulados} pulados, ${falhas} falha(s).`)
}

main().catch((e) => {
  console.error('\nERRO:', e instanceof Error ? e.message : e)
  process.exit(1)
})
