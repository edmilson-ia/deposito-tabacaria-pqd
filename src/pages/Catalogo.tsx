import { Loader2, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ProductCard, ProductCardSkeleton } from '@/components/ProductCard'
import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { PAGE_SIZE, useCategorias, useProdutos } from '@/hooks/useCatalogo'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cn } from '@/lib/utils'

function useDebounced<T>(valor: T, ms = 300) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

export default function Catalogo() {
  usePageTitle('Catálogo')
  const [params, setParams] = useSearchParams()
  const categoriaId = Number(params.get('cat')) || null
  const [texto, setTexto] = useState(params.get('q') ?? '')
  const busca = useDebounced(texto.trim())

  // mantém a URL compartilhável (?cat=&q=)
  useEffect(() => {
    setParams(
      (atual) => {
        const n = new URLSearchParams(atual)
        if (busca) n.set('q', busca)
        else n.delete('q')
        return n
      },
      { replace: true },
    )
  }, [busca, setParams])

  const categorias = useCategorias()
  const produtos = useProdutos({ busca, categoriaId })
  const itens = produtos.data?.pages.flatMap((p) => p.itens) ?? []
  const total = produtos.data?.pages[0]?.total ?? 0

  function escolherCategoria(id: number | null) {
    setParams(
      (atual) => {
        const n = new URLSearchParams(atual)
        if (id) n.set('cat', String(id))
        else n.delete('cat')
        return n
      },
      { replace: true },
    )
    window.scrollTo({ top: 0 })
  }

  const chip = (ativo: boolean) =>
    cn(
      'flex shrink-0 items-center gap-1.5 rounded-full border-2 border-preto px-3 py-1.5 text-xs font-extrabold transition',
      ativo ? 'bg-ambar text-preto shadow-adesivo-sm' : 'bg-bege text-preto hover:bg-bege-escuro',
    )

  return (
    <div className="space-y-4">
      <h1 className="text-4xl">Catálogo</h1>

      <div className="sticky top-[60px] z-30 -mx-4 space-y-3 border-b-2 border-preto bg-verde px-4 pb-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-preto/70" aria-hidden />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar produto por nome…"
            aria-label="Buscar produto por nome"
            className="h-12 w-full rounded-xl border-2 border-preto bg-bege pl-10 pr-10 text-sm font-semibold text-preto placeholder:text-preto/70"
          />
          {texto && (
            <button
              onClick={() => setTexto('')}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-preto"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        <div role="group" aria-label="Filtrar por categoria" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button className={chip(!categoriaId)} aria-pressed={!categoriaId} onClick={() => escolherCategoria(null)}>
            Todos
          </button>
          {categorias.data?.map((c) => (
            <button key={c.id} className={chip(categoriaId === c.id)} aria-pressed={categoriaId === c.id} onClick={() => escolherCategoria(c.id)}>
              <CategoryIcon nome={c.nome} className="h-3.5 w-3.5" />
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      {produtos.isError ? (
        <ErrorState onRetry={() => produtos.refetch()} />
      ) : produtos.isPending ? (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Carregando produtos">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <ProductCardSkeleton />
            </li>
          ))}
        </ul>
      ) : itens.length === 0 ? (
        <EmptyState
          titulo="Nada encontrado"
          texto={busca ? `Nenhum produto para “${busca}”.` : 'Nenhum produto nesta categoria.'}
          acao={{
            label: 'Limpar filtros',
            onClick: () => {
              setTexto('')
              escolherCategoria(null)
            },
          }}
        />
      ) : (
        <>
          <p className="text-sm text-bege/80" aria-live="polite">
            {total} {total === 1 ? 'produto' : 'produtos'}
          </p>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {itens.map((p) => (
              <li key={p.id} className="h-full">
                <ProductCard produto={p} />
              </li>
            ))}
          </ul>
          {produtos.hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => produtos.fetchNextPage()} disabled={produtos.isFetchingNextPage} className="min-w-52">
                {produtos.isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
                  </>
                ) : (
                  `Carregar mais (${Math.min(PAGE_SIZE, total - itens.length)})`
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
