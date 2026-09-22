import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import {
  useAdminCategorias,
  useAdminProdutos,
  useExcluirCategoria,
  useReordenarCategorias,
  useSalvarCategoria,
} from '@/hooks/useAdmin'
import { categoriaSchema } from '@/lib/schemas'
import type { Categoria } from '@/lib/types'
import { cn } from '@/lib/utils'

const inputCls = (erro?: string) =>
  cn('h-11 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto', erro ? 'border-red-800' : 'border-preto')

const mensagemErro = (e: Error) =>
  /duplicate|unique/i.test(e.message) ? 'Já existe uma categoria com este nome.' : e.message

function LinhaCategoria({
  cat,
  total,
  primeira,
  ultima,
  onMover,
}: {
  cat: Categoria
  total: number
  primeira: boolean
  ultima: boolean
  onMover: (dir: -1 | 1) => void
}) {
  const salvar = useSalvarCategoria()
  const excluir = useExcluirCategoria()
  const [nome, setNome] = useState(cat.nome)
  const [erro, setErro] = useState<string>()
  const [confirmar, setConfirmar] = useState(false)
  const mudou = nome.trim() !== cat.nome

  function gravar(e: FormEvent) {
    e.preventDefault()
    const r = categoriaSchema.safeParse({ nome })
    if (!r.success) return setErro(r.error.issues[0].message)
    setErro(undefined)
    salvar.mutate(
      { id: cat.id, nome: r.data.nome },
      {
        onSuccess: () => toast.success('Categoria renomeada'),
        onError: (err) => {
          setErro(mensagemErro(err))
          toast.error(mensagemErro(err))
        },
      },
    )
  }

  return (
    <li className="rounded-xl border-2 border-preto bg-bege p-3 text-preto shadow-adesivo-sm">
      <form onSubmit={gravar} noValidate className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-preto bg-ambar">
          <CategoryIcon nome={cat.nome} className="h-4 w-4" />
        </span>
        <div className="min-w-40 flex-1">
          <label htmlFor={`cat-${cat.id}`} className="sr-only">
            Nome da categoria
          </label>
          <input
            id={`cat-${cat.id}`}
            value={nome}
            onChange={(e) => {
              setNome(e.target.value)
              setErro(undefined)
            }}
            aria-invalid={!!erro}
            className={inputCls(erro)}
          />
        </div>
        <span className="text-xs font-bold text-preto/70">
          {total} {total === 1 ? 'produto' : 'produtos'}
        </span>

        {mudou && (
          <Button type="submit" size="sm" disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Salvar
          </Button>
        )}
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={primeira} onClick={() => onMover(-1)} aria-label={`Subir ${cat.nome}`}>
            <ArrowUp className="h-4 w-4" aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={ultima} onClick={() => onMover(1)} aria-label={`Descer ${cat.nome}`}>
            <ArrowDown className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-red-800 hover:bg-red-800/10"
            disabled={total > 0}
            title={total > 0 ? 'Mova ou exclua os produtos desta categoria antes' : 'Excluir categoria'}
            onClick={() => setConfirmar(true)}
            aria-label={total > 0 ? `${cat.nome} tem produtos e não pode ser excluída` : `Excluir ${cat.nome}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </form>

      {erro && (
        <p role="alert" className="mt-1 text-xs font-bold text-red-800">
          {erro}
        </p>
      )}

      {confirmar && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border-2 border-red-800/40 p-2">
          <p className="text-sm font-bold">Excluir a categoria “{cat.nome}”?</p>
          <Button
            size="sm"
            className="bg-red-700 text-white hover:bg-red-800"
            disabled={excluir.isPending}
            onClick={() =>
              excluir.mutate(cat.id, {
                onSuccess: () => toast.success('Categoria excluída'),
                onError: (err) => toast.error(mensagemErro(err)),
              })
            }
          >
            {excluir.isPending ? 'Excluindo…' : 'Sim, excluir'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
        </div>
      )}
    </li>
  )
}

export default function Categorias() {
  const categorias = useAdminCategorias()
  const produtos = useAdminProdutos()
  const reordenar = useReordenarCategorias()
  const criar = useSalvarCategoria()
  const [novo, setNovo] = useState('')
  const [erroNovo, setErroNovo] = useState<string>()

  const contagem = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of produtos.data ?? []) if (p.categoria_id) m.set(p.categoria_id, (m.get(p.categoria_id) ?? 0) + 1)
    return m
  }, [produtos.data])

  const lista = categorias.data ?? []

  function mover(indice: number, dir: -1 | 1) {
    const alvo = indice + dir
    if (alvo < 0 || alvo >= lista.length) return
    const nova = [...lista]
    ;[nova[indice], nova[alvo]] = [nova[alvo], nova[indice]]
    reordenar.mutate(nova, { onError: (e) => toast.error(`Não foi possível reordenar: ${e.message}`) })
  }

  function adicionar(e: FormEvent) {
    e.preventDefault()
    const r = categoriaSchema.safeParse({ nome: novo })
    if (!r.success) return setErroNovo(r.error.issues[0].message)
    setErroNovo(undefined)
    criar.mutate(
      { nome: r.data.nome, ordem: lista.length + 1 },
      {
        onSuccess: () => {
          toast.success('Categoria criada')
          setNovo('')
        },
        onError: (err) => {
          setErroNovo(mensagemErro(err))
          toast.error(mensagemErro(err))
        },
      },
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-3xl">Categorias</h1>
      <p className="text-sm text-bege/80">A ordem abaixo é a ordem dos botões de categoria no catálogo. Categorias sem produtos não aparecem para o cliente.</p>

      <form onSubmit={adicionar} noValidate className="rounded-xl border-2 border-preto bg-bege p-3 text-preto">
        <label htmlFor="nova-cat" className="mb-1 block text-sm font-extrabold">
          Nova categoria
        </label>
        <div className="flex gap-2">
          <input
            id="nova-cat"
            value={novo}
            onChange={(e) => {
              setNovo(e.target.value)
              setErroNovo(undefined)
            }}
            aria-invalid={!!erroNovo}
            placeholder="Ex.: Whisky"
            className={inputCls(erroNovo)}
          />
          <Button type="submit" disabled={criar.isPending} className="shrink-0">
            {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Adicionar
          </Button>
        </div>
        {erroNovo && (
          <p role="alert" className="mt-1 text-xs font-bold text-red-800">
            {erroNovo}
          </p>
        )}
      </form>

      {categorias.isError ? (
        <ErrorState onRetry={() => categorias.refetch()} mensagem="Não foi possível carregar as categorias." />
      ) : categorias.isPending ? (
        <ul className="space-y-3" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="shimmer h-16 rounded-xl border-2 border-preto" />
          ))}
        </ul>
      ) : lista.length === 0 ? (
        <EmptyState titulo="Nenhuma categoria" texto="Crie a primeira acima." />
      ) : (
        <ul className={cn('space-y-3', reordenar.isPending && 'opacity-70')}>
          {lista.map((c, i) => (
            <LinhaCategoria key={`${c.id}-${c.nome}`} cat={c} total={contagem.get(c.id) ?? 0} primeira={i === 0} ultima={i === lista.length - 1} onMover={(d) => mover(i, d)} />
          ))}
        </ul>
      )}
    </div>
  )
}
