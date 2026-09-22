/**
 * Importa/atualiza o catálogo a partir de uma planilha Google Sheets.
 *
 *   npm run import:dry -- --sheet=<link>        -> só mostra o que mudaria (não grava nada)
 *   npm run import:apply -- --sheet=<link>      -> grava de verdade (usa SUPABASE_SERVICE_KEY do .env)
 *
 * Origem dos dados (uma das duas é obrigatória):
 *   --sheet=<link ou ID da planilha do Google>  (compartilhada como "qualquer pessoa com o link")
 *   --csv=<arquivo.csv>                         (planilha salva como CSV UTF-8 no computador)
 * Opcional:
 *   --gid=<número da aba>                       (planilha com várias abas; está na URL: ...#gid=123)
 *
 * A planilha precisa estar compartilhada como "qualquer pessoa com o link". Cabeçalhos aceitos (sem
 * diferenciar maiúsculas/acentos): produto|nome, categoria|grupo, valor|preço, descricao|descrição,
 * unidade|tipo (opcional), imagem|foto|link (ignorado aqui; fotos vêm do import-imagens).
 *
 * Idempotente: produtos são identificados por (nome, unidade). Reexecutar não duplica.
 * Em produtos que já existem só atualiza preço, descrição e categoria — nunca estoque,
 * "ativo" nem imagem (esses você edita no admin).
 * Produtos que estão no banco mas NÃO na planilha são apenas listados: nada é apagado nem desativado.
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import Papa from 'papaparse'

const ESTOQUE_INICIAL = 999

type Unidade = 'un' | 'cx' | 'fardo' // `cx` é exibido como "pack" no site
type Linha = Partial<Record<'produto' | 'categoria' | 'valor' | 'descricao' | 'unidade' | 'imagem' | 'link', string>>
type Item = { nome: string; descricao: string | null; categoria: string; preco: number; unidade: Unidade; origem: number }
type Existente = { id: number; nome: string; unidade: Unidade; preco: number; descricao: string | null; categoria_id: number | null }

// Ajuste aqui se quiser outros nomes de categoria.
const CATEGORIA_MAP: Record<string, string> = {
  'Vinhos Chopp': 'Vinhos e Chopp',
  Cigarros: 'Tabacaria',
  Acessórios: 'Tabacaria',
}
const ORDEM_CATEGORIAS = [
  'Cervejas', 'Refrigerantes', 'Energéticos', 'Bebidas Mistas', 'Vinhos e Chopp',
  'Águas e Sucos', 'Gelo', 'Tabacaria', 'Doces e Balas', 'Alimentos', 'Diversos',
]

const limpar = (s: string) => s.replace(/\s+/g, ' ').trim()
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const chave = (nome: string, un: string) => `${semAcento(nome)}|${un}`

const argValor = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3)
const idDaPlanilha = (txt: string) => txt.match(/\/d\/([\w-]+)/)?.[1] ?? txt.trim()

// Cabeçalhos diferentes viram os nomes padrão.
const ALIAS: Record<string, keyof Linha> = {
  produto: 'produto', nome: 'produto', item: 'produto',
  categoria: 'categoria', grupo: 'categoria',
  valor: 'valor', preco: 'valor', price: 'valor',
  descricao: 'descricao', detalhe: 'descricao', detalhes: 'descricao',
  unidade: 'unidade', tipo: 'unidade', und: 'unidade',
  imagem: 'imagem', foto: 'imagem', link: 'link', url: 'link',
}

function categoriaFinal(cat: string, nome: string): string {
  const c = limpar(cat)
  if (c.toLowerCase() === 'outros') {
    return /isqueiro|carv[aã]o/i.test(nome) ? 'Tabacaria' : 'Diversos'
  }
  return CATEGORIA_MAP[c] ?? c
}

/** Coluna "unidade" explícita: un | pack | cx | caixa | fardo. Devolve null se não reconhecer. */
function unidadeExplicita(v: string): Unidade | null {
  const t = semAcento(v)
  if (!t) return null
  if (/^(un|und|unid|unidade|unitario)$/.test(t)) return 'un'
  if (/^(pack|packs|cx|caixa|caixas)$/.test(t)) return 'cx'
  if (/^fardo(s)?$/.test(t)) return 'fardo'
  return null
}

/** Sem coluna explícita, infere do texto: "pack", "caixa", "cx" ou "c/12" => pack; "fardo" => fardo; senão un. */
function inferirUnidade(texto: string): Unidade {
  if (/fardo/i.test(texto)) return 'fardo'
  if (/\bc\s*\/\s*\d+/i.test(texto) || /\b(caixa|pack|cx)\b/i.test(texto)) return 'cx'
  return 'un'
}

/** Aceita "R$ 1.234,56", "12,5", "12.50", "12" e números puros. Devolve null se não for número. */
function parsePreco(v: string): number | null {
  let t = v.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.') // 1.234,56 -> 1234.56
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '') // 1.234 -> 1234 (milhar)
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brl = (n: number) => moeda.format(n).replace(/ /g, ' ')

async function main() {
  const apply = process.argv.includes('--apply')
  const arquivoCsv = argValor('csv')
  const sheetArg = argValor('sheet')
  if (!arquivoCsv && !sheetArg) {
    throw new Error('Informe a planilha: --sheet=<link ou ID do Google Sheets> ou --csv=<arquivo.csv>. (A planilha original do cliente foi removida do Google.)')
  }
  const sheetId = sheetArg ? idDaPlanilha(sheetArg) : ''
  const gid = argValor('gid')

  let texto: string
  if (arquivoCsv) {
    texto = readFileSync(arquivoCsv, 'utf8').replace(/^﻿/, '')
  } else {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`
    const res = await fetch(csvUrl)
    if (res.status === 410 || res.status === 404) throw new Error(`A planilha não existe mais ou o link está errado (HTTP ${res.status}).`)
    if (!res.ok) throw new Error(`Falha ao baixar a planilha (HTTP ${res.status}). Ela está compartilhada como "qualquer pessoa com o link"?`)
    texto = await res.text()
    if (/^\s*<!doctype html|<html/i.test(texto)) throw new Error('O Google devolveu uma página de login: compartilhe a planilha como "qualquer pessoa com o link" (leitor).')
  }

  const { data, meta } = Papa.parse<Linha>(texto, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => ALIAS[semAcento(h)] ?? semAcento(h),
  })
  const colunas = new Set(meta.fields ?? [])
  const faltando = (['produto', 'valor'] as const).filter((c) => !colunas.has(c))
  if (faltando.length) {
    throw new Error(`Coluna(s) obrigatória(s) não encontrada(s): ${faltando.join(', ')}. Colunas lidas: ${[...colunas].join(', ')}`)
  }
  const temCategoria = colunas.has('categoria')

  const itens: Item[] = []
  const puladas: string[] = []
  const avisos: string[] = []

  data.forEach((l, i) => {
    const linhaNum = i + 2 // +1 cabeçalho, +1 base 1
    const nome = limpar(l.produto ?? '')
    const preco = parsePreco(l.valor ?? '')
    if (!nome) return puladas.push(`linha ${linhaNum}: sem nome`)
    if (preco === null) return puladas.push(`linha ${linhaNum} "${nome}": preço não numérico "${l.valor}" (precisa de decisão)`)
    const desc = limpar(l.descricao ?? '')
    const bruta = limpar(l.unidade ?? '')
    const explicita = unidadeExplicita(bruta)
    if (bruta && !explicita) avisos.push(`linha ${linhaNum} "${nome}": unidade "${bruta}" não reconhecida; usei a inferência pelo texto`)
    itens.push({
      nome,
      descricao: desc && desc.toLowerCase() !== 'unid' ? desc : null,
      categoria: temCategoria ? categoriaFinal(l.categoria ?? '', nome) : 'Diversos',
      preco,
      unidade: explicita ?? inferirUnidade(`${nome} ${desc}`),
      origem: linhaNum,
    })
  })
  if (!temCategoria) avisos.push('A planilha não tem coluna de categoria: tudo iria para "Diversos".')

  // Duplicidade de chave (nome, unidade)
  const chaves = new Map<string, Item[]>()
  for (const it of itens) chaves.set(chave(it.nome, it.unidade), [...(chaves.get(chave(it.nome, it.unidade)) ?? []), it])
  const duplicadas = [...chaves.values()].filter((g) => g.length > 1)

  // Heurísticas de conferência de preço
  const porNome = new Map<string, Item[]>()
  for (const it of itens) porNome.set(semAcento(it.nome), [...(porNome.get(semAcento(it.nome)) ?? []), it])
  for (const g of porNome.values()) {
    const un = g.find((x) => x.unidade === 'un')
    const cx = g.find((x) => x.unidade === 'cx')
    if (un && cx && cx.preco <= un.preco) {
      avisos.push(`"${cx.nome}": pack (linha ${cx.origem}, ${brl(cx.preco)}) não é mais caro que a unidade (linha ${un.origem}, ${brl(un.preco)})`)
    }
  }
  for (const it of itens) {
    const n = it.descricao?.match(/c\s*\/\s*(\d+)/i)
    if (it.unidade === 'cx' && n && it.preco < Number(n[1]) * 1.5) {
      avisos.push(`"${it.nome}" (linha ${it.origem}): pack c/${n[1]} custando ${brl(it.preco)} parece preço unitário`)
    }
  }

  const categorias = [...new Set(itens.map((i) => i.categoria))].sort(
    (a, b) => (ORDEM_CATEGORIAS.indexOf(a) + 1 || 99) - (ORDEM_CATEGORIAS.indexOf(b) + 1 || 99) || a.localeCompare(b, 'pt-BR'),
  )

  // ---- Compara com o que já está no banco (se houver chaves no .env) ----
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (apply && (!url || !key)) throw new Error('Preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  const sb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null

  let existentes: Existente[] | null = null
  let catPorId = new Map<number, string>()
  if (sb) {
    const [p, c] = await Promise.all([
      sb.from('produtos').select('id, nome, unidade, preco, descricao, categoria_id').limit(5000),
      sb.from('categorias').select('id, nome'),
    ])
    if (p.error) throw p.error
    if (c.error) throw c.error
    existentes = p.data as Existente[]
    catPorId = new Map(c.data!.map((x) => [x.id, x.nome]))
  }
  const porChave = new Map((existentes ?? []).map((e) => [chave(e.nome, e.unidade), e]))

  type Mudanca = { item: Item; antes: Existente; campos: string[] }
  const novos: Item[] = []
  const alterados: Mudanca[] = []
  const iguais: Item[] = []
  for (const it of itens) {
    const e = porChave.get(chave(it.nome, it.unidade))
    if (!e) { novos.push(it); continue }
    const campos: string[] = []
    if (Number(e.preco) !== it.preco) campos.push(`preço ${brl(Number(e.preco))} → ${brl(it.preco)}`)
    if ((e.descricao ?? null) !== it.descricao) campos.push('descrição')
    if (temCategoria && (catPorId.get(e.categoria_id ?? -1) ?? null) !== it.categoria) campos.push(`categoria ${catPorId.get(e.categoria_id ?? -1) ?? '—'} → ${it.categoria}`)
    if (campos.length) alterados.push({ item: it, antes: e, campos })
    else iguais.push(it)
  }
  const chavesPlanilha = new Set(itens.map((i) => chave(i.nome, i.unidade)))
  const foraDaPlanilha = (existentes ?? []).filter((e) => !chavesPlanilha.has(chave(e.nome, e.unidade)))

  const un = (u: Unidade) => (u === 'cx' ? 'pack' : u)
  console.log(`\nModo: ${apply ? 'APLICAR (grava no Supabase)' : 'DRY-RUN (nada é gravado)'}`)
  console.log(`Origem: ${arquivoCsv ? `arquivo ${arquivoCsv}` : `planilha ${sheetId}${gid ? ` (aba ${gid})` : ''}`}`)
  console.log(`Colunas lidas: ${[...colunas].join(', ')}`)
  console.log(`Linhas lidas: ${data.length} | produtos válidos: ${itens.length} | puladas: ${puladas.length}`)

  if (existentes) {
    console.log(`\nRESUMO: ${novos.length} NOVOS | ${alterados.length} ALTERADOS | ${iguais.length} sem mudança | ${foraDaPlanilha.length} no banco fora da planilha (não serão mexidos)`)
    console.log(`\nNOVOS (${novos.length}):`)
    for (const it of novos) console.log(`  + ${it.nome} | ${un(it.unidade)} | ${brl(it.preco)} | [${it.categoria}] | estoque ${ESTOQUE_INICIAL}${it.descricao ? ` | ${it.descricao}` : ''}`)
    console.log(`\nALTERADOS (${alterados.length}):`)
    for (const m of alterados) console.log(`  ~ ${m.item.nome} [${un(m.item.unidade)}]: ${m.campos.join('; ')}`)
    if (foraDaPlanilha.length) {
      console.log(`\nESTÃO NO BANCO MAS NÃO NA PLANILHA (${foraDaPlanilha.length}) — nada é apagado; se saíram do catálogo, desative no admin:`)
      if (foraDaPlanilha.length <= 15 || process.argv.includes('--listar-fora')) {
        for (const e of foraDaPlanilha) console.log(`  ? ${e.nome} [${un(e.unidade)}]`)
      } else {
        console.log('  (lista longa omitida: a planilha parece trazer só parte do catálogo. Use --listar-fora para ver todos.)')
      }
    }
  } else {
    console.log('\n(Sem chaves do Supabase no .env: não consigo comparar com o banco; mostrando só a planilha.)')
    console.log(`\nCATEGORIAS (${categorias.length}):`)
    categorias.forEach((c, i) => console.log(`  ${i + 1}. ${c} (${itens.filter((x) => x.categoria === c).length})`))
    for (const c of categorias) {
      console.log(`\n  [${c}]`)
      for (const it of itens.filter((x) => x.categoria === c)) console.log(`   - ${it.nome} | ${un(it.unidade)} | ${brl(it.preco)}${it.descricao ? ` | ${it.descricao}` : ''}`)
    }
  }

  const novasCategorias = existentes ? categorias.filter((c) => ![...catPorId.values()].includes(c)) : []
  if (novasCategorias.length) console.log(`\nCATEGORIAS NOVAS que serão criadas: ${novasCategorias.join(', ')}`)
  if (puladas.length) console.log('\nPULADAS:\n  ' + puladas.join('\n  '))
  if (duplicadas.length) {
    console.log('\nDUPLICADAS (mesmo nome+unidade) — resolva na planilha antes de aplicar:')
    duplicadas.forEach((g) => console.log('  ' + g.map((x) => `linha ${x.origem} (${brl(x.preco)})`).join(' vs ') + ` -> ${g[0].nome} [${un(g[0].unidade)}]`))
  }
  if (avisos.length) console.log('\nCONFERIR:\n  ' + avisos.join('\n  '))

  if (!apply) return console.log('\nDry-run concluído. Nada foi gravado.')
  if (duplicadas.length) throw new Error('Existem duplicadas; abortando.')
  if (!sb) throw new Error('Sem conexão com o Supabase.')

  // categorias: cria as que faltam; as existentes mantêm a ordem que você definiu no admin
  const { data: cats, error: eCat } = await sb.from('categorias').select('id, nome, ordem')
  if (eCat) throw eCat
  const catId = new Map(cats!.map((c) => [c.nome, c.id]))
  let ordemMax = Math.max(0, ...cats!.map((c) => c.ordem))
  for (const nome of categorias) {
    if (catId.has(nome)) continue
    const { data: nova, error } = await sb.from('categorias').insert({ nome, ordem: ++ordemMax }).select('id').single()
    if (error) throw error
    catId.set(nome, nova.id)
  }

  let criados = 0, atualizados = 0
  for (const it of novos) {
    const { error } = await sb.from('produtos').insert({
      nome: it.nome, descricao: it.descricao, categoria_id: catId.get(it.categoria)!, preco: it.preco,
      unidade: it.unidade, estoque: ESTOQUE_INICIAL, ativo: true,
    })
    if (error) throw error
    criados++
  }
  for (const m of alterados) {
    const { error } = await sb.from('produtos').update({
      descricao: m.item.descricao, categoria_id: catId.get(m.item.categoria)!, preco: m.item.preco,
    }).eq('id', m.antes.id)
    if (error) throw error
    atualizados++
  }
  console.log(`\nConcluído: ${criados} novos, ${atualizados} atualizados, ${iguais.length} sem mudança.`)
}

main().catch((e) => {
  console.error('\nERRO:', e instanceof Error ? e.message : e)
  process.exit(1)
})
