import { Download, Loader2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ProductImage } from '@/components/ProductImage'
import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import {
  useAdminCategorias,
  useAdminProdutos,
  useExcluirProduto,
  useSalvarProduto,
  type ProdutoInput,
} from '@/hooks/useAdmin'
import { enviarImagemProduto } from '@/lib/imagem'
import { parseValor, produtoSchema } from '@/lib/schemas'
import type { Categoria, Produto, Unidade } from '@/lib/types'
import { cn, UNIDADE_SIGLA } from '@/lib/utils'

const inputCls = (erro?: string) =>
  cn('h-11 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto', erro ? 'border-red-800' : 'border-preto')

type Filtro = 'todos' | 'sem_foto' | 'sem_estoque' | 'inativos'

/* ------------------------------ linha da lista ------------------------------ */

function LinhaProduto({ produto, categoria, onEditar }: { produto: Produto; categoria?: string; onEditar: () => void }) {
  const salvar = useSalvarProduto()
  const [preco, setPreco] = useState(produto.preco.toFixed(2).replace('.', ','))
  const [estoque, setEstoque] = useState(String(produto.estoque))

  const precoNum = parseValor(preco)
  const estoqueNum = Number(estoque)
  const valido = Number.isFinite(precoNum) && precoNum >= 0 && Number.isInteger(estoqueNum) && estoqueNum >= 0
  const mudou = precoNum !== produto.preco || estoqueNum !== produto.estoque

  const { id, ...resto } = produto
  function gravar(campos: Partial<ProdutoInput>, msg: string) {
    salvar.mutate(
      { id, ...resto, ...campos },
      {
        onSuccess: () => toast.success(msg, { duration: 1500 }),
        onError: (e) => toast.error(`Não foi possível salvar: ${e.message}`),
      },
    )
  }

  return (
    <li className={cn('flex flex-wrap items-center gap-3 rounded-xl border-2 border-preto bg-bege p-3 text-preto shadow-adesivo-sm', !produto.ativo && 'opacity-70')}>
      <ProductImage legenda={false} src={produto.imagem_url} alt={produto.nome} className="h-14 w-14 shrink-0 rounded-lg border-2 border-preto" />
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-extrabold leading-tight">{produto.nome}</p>
        <p className="text-xs text-preto/70">
          {categoria ?? 'Sem categoria'} · {UNIDADE_SIGLA[produto.unidade]}
          {!produto.ativo && <span className="ml-1 rounded bg-preto px-1 font-bold text-bege">INATIVO</span>}
        </p>
      </div>

      <label className="flex flex-col text-xs font-bold">
        Preço (R$)
        <input
          inputMode="decimal"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && mudou && valido && gravar({ preco: precoNum, estoque: estoqueNum }, 'Salvo')}
          aria-label={`Preço de ${produto.nome}`}
          className={cn(inputCls(), 'mt-0.5 w-24 text-right')}
        />
      </label>
      <label className="flex flex-col text-xs font-bold">
        Estoque
        <input
          inputMode="numeric"
          value={estoque}
          onChange={(e) => setEstoque(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && mudou && valido && gravar({ preco: precoNum, estoque: estoqueNum }, 'Salvo')}
          aria-label={`Estoque de ${produto.nome}`}
          className={cn(inputCls(), 'mt-0.5 w-20 text-right')}
        />
      </label>

      <div className="flex items-center gap-2">
        {mudou && (
          <Button size="sm" disabled={!valido || salvar.isPending} onClick={() => gravar({ preco: precoNum, estoque: estoqueNum }, 'Preço/estoque salvos')}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />} Salvar
          </Button>
        )}
        <button
          role="switch"
          aria-checked={produto.ativo}
          aria-label={`${produto.ativo ? 'Desativar' : 'Ativar'} ${produto.nome}`}
          onClick={() => gravar({ ativo: !produto.ativo }, produto.ativo ? 'Produto desativado' : 'Produto ativado')}
          className={cn('relative h-7 w-12 shrink-0 rounded-full border-2 border-preto transition', produto.ativo ? 'bg-zap' : 'bg-preto/30')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full border-2 border-preto bg-white transition-all', produto.ativo ? 'left-5' : 'left-0.5')} />
        </button>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={onEditar} aria-label={`Editar ${produto.nome}`}>
          <Pencil className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  )
}

/* ------------------------------ formulário (drawer) ------------------------------ */

interface Estado {
  nome: string
  descricao: string
  categoria_id: number | undefined
  preco: string
  unidade: Unidade
  estoque: string
  ativo: boolean
}

function FormProduto({ produto, categorias, onFechar }: { produto: Produto | null; categorias: Categoria[]; onFechar: () => void }) {
  const salvar = useSalvarProduto()
  const excluir = useExcluirProduto()
  const [f, setF] = useState<Estado>({
    nome: produto?.nome ?? '',
    descricao: produto?.descricao ?? '',
    categoria_id: produto?.categoria_id ?? undefined,
    preco: produto ? produto.preco.toFixed(2).replace('.', ',') : '',
    unidade: produto?.unidade ?? 'un',
    estoque: String(produto?.estoque ?? 0),
    ativo: produto?.ativo ?? true,
  })
  const [erros, setErros] = useState<Partial<Record<keyof Estado | 'imagem', string>>>({})
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<string | null>(produto?.imagem_url ?? null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => {
    setF((s) => ({ ...s, [k]: v }))
    setErros((e) => ({ ...e, [k]: undefined }))
  }

  function escolherArquivo(file: File | undefined) {
    if (!file) return
    if (previa && arquivo) URL.revokeObjectURL(previa)
    setArquivo(file)
    setRemoverImagem(false)
    setPrevia(URL.createObjectURL(file))
    setErros((e) => ({ ...e, imagem: undefined }))
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = produtoSchema.safeParse(f)
    if (!r.success) {
      const novos: typeof erros = {}
      for (const i of r.error.issues) novos[i.path[0] as keyof Estado] ??= i.message
      setErros(novos)
      toast.error('Confira os campos destacados.')
      return
    }
    setSalvando(true)
    try {
      let imagem_url = removerImagem ? null : (produto?.imagem_url ?? null)
      if (arquivo) imagem_url = await enviarImagemProduto(arquivo, r.data.nome)
      await salvar.mutateAsync({
        id: produto?.id,
        nome: r.data.nome,
        descricao: r.data.descricao || null,
        categoria_id: r.data.categoria_id,
        preco: r.data.preco,
        unidade: r.data.unidade,
        estoque: r.data.estoque,
        ativo: r.data.ativo,
        imagem_url,
      })
      toast.success(produto ? 'Produto atualizado' : 'Produto criado')
      onFechar()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      if (/duplicate|unique/i.test(msg)) setErros({ nome: 'Já existe um produto com este nome e unidade.' })
      toast.error(/duplicate|unique/i.test(msg) ? 'Já existe um produto com este nome e unidade.' : msg)
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!produto) return
    try {
      await excluir.mutateAsync(produto.id)
      toast.success('Produto excluído')
      onFechar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir')
    }
  }

  const erro = (k: keyof Estado | 'imagem') =>
    erros[k] ? <p role="alert" className="mt-1 text-xs font-bold text-red-800">{erros[k]}</p> : null

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <label htmlFor="p-nome" className="mb-1 block text-sm font-extrabold">Nome</label>
          <input id="p-nome" value={f.nome} onChange={(e) => set('nome', e.target.value)} aria-invalid={!!erros.nome} className={inputCls(erros.nome)} />
          {erro('nome')}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="p-cat" className="mb-1 block text-sm font-extrabold">Categoria</label>
            <select id="p-cat" value={f.categoria_id ?? ''} onChange={(e) => set('categoria_id', e.target.value ? Number(e.target.value) : undefined)} aria-invalid={!!erros.categoria_id} className={inputCls(erros.categoria_id)}>
              <option value="">Escolha…</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            {erro('categoria_id')}
          </div>
          <div>
            <label htmlFor="p-un" className="mb-1 block text-sm font-extrabold">Unidade</label>
            <select id="p-un" value={f.unidade} onChange={(e) => set('unidade', e.target.value as Unidade)} className={inputCls()}>
              <option value="un">Unidade (un)</option>
              <option value="cx">Pack</option>
              <option value="fardo">Fardo</option>
            </select>
          </div>
          <div>
            <label htmlFor="p-preco" className="mb-1 block text-sm font-extrabold">Preço (R$)</label>
            <input id="p-preco" inputMode="decimal" value={f.preco} onChange={(e) => set('preco', e.target.value)} aria-invalid={!!erros.preco} className={inputCls(erros.preco)} placeholder="0,00" />
            {erro('preco')}
          </div>
          <div>
            <label htmlFor="p-est" className="mb-1 block text-sm font-extrabold">Estoque</label>
            <input id="p-est" inputMode="numeric" value={f.estoque} onChange={(e) => set('estoque', e.target.value)} aria-invalid={!!erros.estoque} className={inputCls(erros.estoque)} />
            {erro('estoque')}
          </div>
        </div>

        <div>
          <label htmlFor="p-desc" className="mb-1 block text-sm font-extrabold">Descrição (opcional)</label>
          <textarea id="p-desc" rows={2} value={f.descricao} onChange={(e) => set('descricao', e.target.value)} aria-invalid={!!erros.descricao} className={cn(inputCls(erros.descricao), 'h-auto py-2')} />
          {erro('descricao')}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-extrabold">Imagem</legend>
          <div className="flex items-center gap-3">
            <ProductImage src={removerImagem ? null : previa} alt={f.nome || 'Produto'} className="h-24 w-24 shrink-0 rounded-lg border-2 border-preto" />
            <div className="space-y-2">
              <input ref={inputArquivo} type="file" accept="image/jpeg,image/png,image/webp,.jfif" className="sr-only" id="p-img" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
              <Button variant="outline" size="sm" onClick={() => inputArquivo.current?.click()}>
                {previa && !removerImagem ? 'Trocar imagem' : 'Enviar imagem'}
              </Button>
              {(previa || produto?.imagem_url) && !removerImagem && (
                <Button variant="ghost" size="sm" className="text-red-800 hover:bg-red-800/10" onClick={() => { setRemoverImagem(true); setArquivo(null) }}>
                  Remover
                </Button>
              )}
              <p className="text-[11px] text-preto/70">JPG, PNG ou WebP. É reduzida e convertida automaticamente.</p>
            </div>
          </div>
          {erro('imagem')}
        </fieldset>

        <label className="flex items-center gap-2 text-sm font-extrabold">
          <input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-5 w-5 accent-verde" />
          Produto ativo (aparece no catálogo)
        </label>

        {produto && (
          <div className="rounded-lg border-2 border-red-800/40 p-3">
            {!confirmarExcluir ? (
              <Button variant="ghost" size="sm" className="text-red-800 hover:bg-red-800/10" onClick={() => setConfirmarExcluir(true)}>
                <Trash2 className="h-4 w-4" aria-hidden /> Excluir produto
              </Button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-bold">Excluir “{produto.nome}”? Pedidos antigos continuam guardando o nome e o preço.</p>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-red-700 text-white hover:bg-red-800" onClick={apagar} disabled={excluir.isPending}>
                    {excluir.isPending ? 'Excluindo…' : 'Sim, excluir'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmarExcluir(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t-2 border-preto bg-bege-escuro p-4">
        <Button type="submit" disabled={salvando} className="h-12 w-full text-base">
          {salvando ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Salvando…</> : produto ? 'Salvar alterações' : 'Criar produto'}
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------ página ------------------------------ */

export default function Produtos() {
  const produtos = useAdminProdutos()
  const categorias = useAdminCategorias()
  const [busca, setBusca] = useState('')
  const [catId, setCatId] = useState<number | ''>('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [editando, setEditando] = useState<Produto | 'novo' | null>(null)

  const nomeCategoria = useMemo(() => new Map((categorias.data ?? []).map((c) => [c.id, c.nome])), [categorias.data])

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (produtos.data ?? []).filter((p) => {
      if (q && !p.nome.toLowerCase().includes(q)) return false
      if (catId && p.categoria_id !== catId) return false
      if (filtro === 'sem_foto') return !p.imagem_url
      if (filtro === 'sem_estoque') return p.estoque <= 0
      if (filtro === 'inativos') return !p.ativo
      return true
    })
  }, [produtos.data, busca, catId, filtro])

  function exportarJson() {
    const dados = {
      exportado_em: new Date().toISOString(),
      categorias: categorias.data ?? [],
      produtos: produtos.data ?? [],
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `catalogo-pqd-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Catálogo exportado (${dados.produtos.length} produtos)`)
  }

  const semFoto = (produtos.data ?? []).filter((p) => !p.imagem_url).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl">Produtos</h1>
        <Button variant="outline" onClick={exportarJson} disabled={!produtos.data}>
          <Download className="h-4 w-4" aria-hidden /> Exportar JSON
        </Button>
        <Button onClick={() => setEditando('novo')} disabled={!categorias.data}>
          <Plus className="h-4 w-4" aria-hidden /> Novo produto
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border-2 border-preto bg-bege p-3 text-preto">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-preto/70" aria-hidden />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…" aria-label="Buscar produto" className={cn(inputCls(), 'pl-9')} />
        </div>
        <select value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')} aria-label="Filtrar por categoria" className={cn(inputCls(), 'w-auto')}>
          <option value="">Todas as categorias</option>
          {categorias.data?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtro rápido" className={cn(inputCls(), 'w-auto')}>
          <option value="todos">Todos</option>
          <option value="sem_foto">Sem foto ({semFoto})</option>
          <option value="sem_estoque">Sem estoque</option>
          <option value="inativos">Inativos</option>
        </select>
      </div>

      {produtos.isError ? (
        <ErrorState onRetry={() => produtos.refetch()} mensagem="Não foi possível carregar os produtos." />
      ) : produtos.isPending ? (
        <ul className="space-y-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <li key={i} className="shimmer h-20 rounded-xl border-2 border-preto" />)}
        </ul>
      ) : lista.length === 0 ? (
        <EmptyState titulo="Nenhum produto" texto="Ajuste os filtros ou crie um novo produto." />
      ) : (
        <>
          <p className="text-sm text-bege/80" aria-live="polite">{lista.length} {lista.length === 1 ? 'produto' : 'produtos'}</p>
          <ul className="space-y-3">
            {lista.map((p) => (
              <LinhaProduto key={`${p.id}-${p.preco}-${p.estoque}`} produto={p} categoria={p.categoria_id ? nomeCategoria.get(p.categoria_id) : undefined} onEditar={() => setEditando(p)} />
            ))}
          </ul>
        </>
      )}

      <Sheet open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <SheetContent aria-describedby="prod-desc">
          <div className="flex items-center border-b-2 border-preto bg-verde-escuro px-4 py-3 text-bege">
            <SheetTitle className="font-titulo text-2xl leading-none">{editando === 'novo' ? 'Novo produto' : 'Editar produto'}</SheetTitle>
            <SheetClose aria-label="Fechar" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
              <X className="h-5 w-5" aria-hidden />
            </SheetClose>
          </div>
          <SheetDescription id="prod-desc" className="sr-only">Formulário de produto</SheetDescription>
          {editando !== null && (
            <FormProduto key={editando === 'novo' ? 'novo' : editando.id} produto={editando === 'novo' ? null : editando} categorias={categorias.data ?? []} onFechar={() => setEditando(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
