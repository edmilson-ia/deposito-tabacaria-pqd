/**
 * Importa as fotos de uma pasta PÚBLICA do Google Drive e associa aos produtos pelo NOME do arquivo.
 *
 *   npm run imagens:dry     -> só lista as correspondências e o que ficou sem par (não baixa, não grava)
 *   npm run imagens:apply   -> baixa, reduz (900px), converte para WebP, envia ao bucket `produtos`
 *                              e grava produtos.imagem_url (usa SUPABASE_SERVICE_KEY do .env)
 *
 * Opções: --force (troca também produtos que já têm foto)
 *
 * NÃO há "chute": só associa quando o nome normalizado do arquivo é IGUAL ao nome do produto.
 * Tudo que não bate exatamente é listado (com sugestões) para você decidir em scripts/imagens-mapa.json.
 *
 * Regras de correspondência (normalização: sem acento, minúsculas, sem pontuação):
 *  - "pack", "fardo", "caixa", "cx", "com 18", "c/12"  no nome do arquivo  => variante caixa (cx)
 *  - "und", "unid", "unidade", "un"                    => variante unidade (un)
 *  - a palavra "sabores" no fim é ignorada (ex.: "Gatorade sabores" => produto "Gatorade")
 *  - arquivo SEM indicação de variante e produto com un E cx => vale para as duas, exceto onde
 *    outro arquivo indicar a variante explicitamente (o explícito ganha)
 *  - dois arquivos explícitos para o mesmo produto => conflito: nenhum é aplicado
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import sharp from 'sharp'

const idDaPasta = (txt: string) => txt.match(/\/folders\/([\w-]+)/)?.[1] ?? txt.trim()
const argValor = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const PASTA_ID_PADRAO = '1nGBUfN2HHFFqZEENWIQhje4nViKYdS5D'
const PASTA_ID = (() => {
  const arg = argValor('pasta')
  return arg ? idDaPasta(arg) : PASTA_ID_PADRAO
})()
const MAPA_PATH = 'scripts/imagens-mapa.json'

type Unidade = 'un' | 'cx' | 'fardo'
interface Arquivo { id: string; nome: string }
interface Produto { id: number; nome: string; unidade: Unidade; imagem_url: string | null }
type Dica = 'cx' | 'un' | null

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const semExtensao = (n: string) => n.replace(/\.(jfif|jpe?g|png|webp|gif)$/i, '')

function interpretar(arquivo: string): { base: string; baseComSabores: string; dica: Dica; conflitoDica: boolean } {
  let t = ' ' + norm(semExtensao(arquivo)) + ' '
  const eCx = /\s(pack|fardo|caixa|cx)\s|\s(com|c)\s\d+\s/.test(t)
  const eUn = /\s(und|unid|unidade|un)\s/.test(t)
  t = t.replace(/\s(pack|fardo|caixa|cx|und|unid|unidade|un)\s/g, ' ').replace(/\s(com|c)\s\d+\s/g, ' ')
  const limpar = (x: string) => x.replace(/\s+/g, ' ').trim()
  // "sabores" às vezes é parte do nome do produto (ex.: "Ice 51 Sabores"): tenta com e sem.
  return {
    baseComSabores: limpar(t),
    base: limpar(t.replace(/\ssabores\s/g, ' ')),
    dica: eCx && !eUn ? 'cx' : eUn && !eCx ? 'un' : null,
    conflitoDica: eCx && eUn,
  }
}

async function listarPasta(): Promise<Arquivo[]> {
  // A visão "embeddedfolderview" lista a pasta inteira (a visão normal só mostra os primeiros 50).
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${PASTA_ID}`)
  if (!res.ok) throw new Error(`Não consegui abrir a pasta do Drive (HTTP ${res.status}). Ela está pública?`)
  const html = await res.text()
  const arquivos = new Map<string, string>()
  for (const bloco of html.split('id="entry-').slice(1)) {
    const id = bloco.match(/^([\w-]{20,})"/)?.[1]
    const nome = bloco.match(/class="flip-entry-title">([^<]+)</)?.[1]
    if (id && nome) arquivos.set(id, nome.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
  }
  return [...arquivos].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function sugestoes(base: string, produtos: Produto[]): string[] {
  const alvo = new Set(base.split(' ').filter((p) => p.length > 1))
  return produtos
    .map((p) => {
      const toks = new Set(norm(p.nome).split(' ').filter((x) => x.length > 1))
      const comum = [...alvo].filter((x) => toks.has(x)).length
      return { p, score: comum / Math.max(alvo.size, toks.size, 1) }
    })
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => `${x.p.nome} [${x.p.unidade}]`)
}

const slug = (s: string) => norm(s).replace(/ /g, '-').slice(0, 50) || 'produto'

async function main() {
  const apply = process.argv.includes('--apply')
  const force = process.argv.includes('--force')

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: prods, error } = await sb.from('produtos').select('id, nome, unidade, imagem_url').order('nome')
  if (error) throw error
  const produtos = prods as Produto[]
  const porNome = new Map<string, Produto[]>()
  for (const p of produtos) porNome.set(norm(p.nome), [...(porNome.get(norm(p.nome)) ?? []), p])
  const porChave = new Map(produtos.map((p) => [`${norm(p.nome)}|${p.unidade}`, p]))

  const arquivos = await listarPasta()
  const mapa: Record<string, string | string[]> = existsSync(MAPA_PATH) ? JSON.parse(readFileSync(MAPA_PATH, 'utf8')) : {}

  // produtoId -> { arquivo, explicito }
  const explicitos = new Map<number, Arquivo[]>()
  const genericos = new Map<number, Arquivo[]>()
  const semPar: { arquivo: Arquivo; motivo: string; dicas: string[] }[] = []
  const nota: string[] = []

  for (const a of arquivos) {
    const manual = mapa[a.nome]
    if (manual !== undefined) {
      const alvos = Array.isArray(manual) ? manual : [manual]
      let ok = true
      for (const alvo of alvos) {
        const [nomeP, un = 'un'] = alvo.split('|')
        const p = porChave.get(`${norm(nomeP)}|${un}`)
        if (!p) { semPar.push({ arquivo: a, motivo: `mapa manual aponta para "${alvo}", que não existe`, dicas: [] }); ok = false; continue }
        explicitos.set(p.id, [...(explicitos.get(p.id) ?? []), a])
      }
      if (ok) nota.push(`  (mapa manual) ${a.nome} -> ${alvos.join(' + ')}`)
      continue
    }

    const { base, baseComSabores, dica, conflitoDica } = interpretar(a.nome)
    if (conflitoDica) { semPar.push({ arquivo: a, motivo: 'nome indica caixa E unidade ao mesmo tempo', dicas: [] }); continue }
    const candidatos = porNome.get(baseComSabores) ?? porNome.get(base) ?? []
    if (candidatos.length === 0) { semPar.push({ arquivo: a, motivo: 'nenhum produto com este nome', dicas: sugestoes(base, produtos) }); continue }

    if (dica) {
      const p = candidatos.find((c) => c.unidade === dica)
      if (!p) { semPar.push({ arquivo: a, motivo: `o produto existe, mas não na variante "${dica}"`, dicas: candidatos.map((c) => `${c.nome} [${c.unidade}]`) }); continue }
      explicitos.set(p.id, [...(explicitos.get(p.id) ?? []), a])
    } else {
      for (const p of candidatos) genericos.set(p.id, [...(genericos.get(p.id) ?? []), a])
    }
  }

  // Resolve: explícito ganha; 2+ explícitos = conflito; genérico só onde não há explícito
  const final = new Map<number, Arquivo>()
  const conflitos: string[] = []
  for (const [pid, lista] of explicitos) {
    const p = produtos.find((x) => x.id === pid)!
    if (lista.length > 1) conflitos.push(`${p.nome} [${p.unidade}]: ${lista.map((l) => l.nome).join('  E  ')}`)
    else final.set(pid, lista[0])
  }
  for (const [pid, lista] of genericos) {
    if (explicitos.has(pid)) continue
    const p = produtos.find((x) => x.id === pid)!
    if (lista.length > 1) conflitos.push(`${p.nome} [${p.unidade}]: ${lista.map((l) => l.nome).join('  E  ')}`)
    else final.set(pid, lista[0])
  }

  const jaTemFoto = [...final.keys()].filter((pid) => produtos.find((p) => p.id === pid)!.imagem_url)
  const aplicar = [...final].filter(([pid]) => force || !produtos.find((p) => p.id === pid)!.imagem_url)

  console.log(`\nModo: ${apply ? 'APLICAR (baixa e grava)' : 'DRY-RUN (nada é baixado nem gravado)'}${force ? ' + --force' : ''}`)
  console.log(`Arquivos na pasta: ${arquivos.length} | produtos no catálogo: ${produtos.length}\n`)

  console.log(`CORRESPONDÊNCIAS (${final.size}):`)
  for (const [pid, a] of [...final].sort((x, y) => x[1].nome.localeCompare(y[1].nome, 'pt-BR'))) {
    const p = produtos.find((x) => x.id === pid)!
    const variantes = porNome.get(norm(p.nome)) ?? []
    const generico = (genericos.get(pid)?.length ?? 0) > 0 && !explicitos.has(pid) && variantes.length > 1
    const outraTemFotoPropria = variantes.some((v) => v.id !== pid && explicitos.has(v.id))
    const aviso = !generico
      ? ''
      : outraTemFotoPropria
        ? '  (arquivo SEM indicação de variante: assumido esta porque a outra variante tem foto própria — CONFIRME)'
        : '  (arquivo sem indicação de variante: vale p/ un e cx)'
    console.log(`  ${a.nome.padEnd(42)} -> ${p.nome} [${p.unidade}]${aviso}${p.imagem_url ? '  (já tinha foto)' : ''}`)
  }
  if (nota.length) console.log('\n' + nota.join('\n'))

  if (conflitos.length) console.log(`\nCONFLITOS — nenhum aplicado (dois arquivos para a mesma variante):\n  ` + conflitos.join('\n  '))

  console.log(`\nSEM CORRESPONDÊNCIA (${semPar.length}) — decida em ${MAPA_PATH}:`)
  for (const s of semPar) console.log(`  ${s.arquivo.nome}\n      ${s.motivo}${s.dicas.length ? `\n      parecidos: ${s.dicas.join(' | ')}` : ''}`)

  const comFoto = new Set(final.keys())
  const semFoto = produtos.filter((p) => !p.imagem_url && !comFoto.has(p.id))
  console.log(`\nPRODUTOS que continuarão SEM foto: ${semFoto.length} de ${produtos.length}`)
  for (const p of semFoto) console.log(`  ${p.nome} [${p.unidade}]`)
  if (jaTemFoto.length && !force) console.log(`(${jaTemFoto.length} produto(s) já tinham foto e não serão trocados; use --force para trocar)`)

  if (!apply) return console.log(`\nDry-run concluído. Serão baixadas ${aplicar.length} fotos ao aplicar. Nada foi gravado.`)
  if (conflitos.length) console.log('\nAviso: os conflitos acima serão ignorados.')

  let ok = 0, falhas = 0
  const cache = new Map<string, { buf: Buffer; hash: string }>() // mesmo arquivo para 2 variantes: baixa 1 vez
  for (const [pid, a] of aplicar) {
    const p = produtos.find((x) => x.id === pid)!
    try {
      let item = cache.get(a.id)
      if (!item) {
        const r = await fetch(`https://drive.usercontent.google.com/download?id=${a.id}&export=download&confirm=t`)
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`download falhou (HTTP ${r.status})`)
        const entrada = Buffer.from(await r.arrayBuffer())
        const buf = await sharp(entrada)
          .rotate()
          .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .webp({ quality: 85 })
          .toBuffer()
        item = { buf, hash: createHash('sha1').update(buf).digest('hex').slice(0, 8) }
        cache.set(a.id, item)
      }
      const caminho = `${slug(p.nome)}-${p.unidade}-${p.id}.webp`
      const up = await sb.storage.from('produtos').upload(caminho, item.buf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      if (up.error) throw up.error
      const publica = sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl + `?v=${item.hash}`
      const { error: eUp } = await sb.from('produtos').update({ imagem_url: publica }).eq('id', pid)
      if (eUp) throw eUp
      ok++
      console.log(`  ok  ${p.nome} [${p.unidade}] <- ${a.nome}`)
    } catch (e) {
      falhas++
      console.log(`  ERRO ${p.nome} [${p.unidade}] <- ${a.nome}: ${e instanceof Error ? e.message : JSON.stringify(e)}`)
    }
  }
  console.log(`\nConcluído: ${ok} fotos aplicadas, ${falhas} falhas.`)
}

main().catch((e) => {
  console.error('\nERRO:', e instanceof Error ? e.message : e)
  process.exit(1)
})
