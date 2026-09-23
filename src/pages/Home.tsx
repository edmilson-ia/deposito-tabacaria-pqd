import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ErrorState } from '@/components/States'
import { buttonVariants } from '@/components/ui/button'
import { useCategorias, useTotalProdutos } from '@/hooks/useCatalogo'
import { usePageTitle } from '@/hooks/usePageTitle'
import type { CategoriaComContagem } from '@/lib/types'
import { cn, NOME_LOJA } from '@/lib/utils'

/** Categorias em destaque na tela inicial (na ordem). O restante fica em "Ver todas as categorias". */
const DESTAQUES = ['Cervejas', 'Refrigerantes', 'Chopp de Vinho', 'Energéticos', 'Tabacaria', 'Whisky']

function escolherDestaques(todas: CategoriaComContagem[]): CategoriaComContagem[] {
  const achadas = DESTAQUES.map((nome) => todas.find((c) => c.nome === nome)).filter((c): c is CategoriaComContagem => !!c)
  // Se as categorias foram renomeadas no admin, não deixa a tela vazia: usa as 6 primeiras da ordem.
  return achadas.length > 0 ? achadas : todas.slice(0, 6)
}

export default function Home() {
  usePageTitle()
  const categorias = useCategorias()
  const total = useTotalProdutos()

  return (
    <div className="space-y-5">
      <section aria-label={NOME_LOJA} className="-mx-4 -mt-4 sm:mx-0 sm:mt-0">
        <h1 className="sr-only">{NOME_LOJA}</h1>
        <img
          src="/branding/hero.webp"
          alt={`${NOME_LOJA}: dois canecos de chopp brindando`}
          width={1080}
          height={653}
          fetchPriority="high"
          className="block w-full border-b-2 border-preto object-cover sm:rounded-2xl sm:border-2 sm:shadow-adesivo"
        />
      </section>

      <section className="flex flex-col items-center gap-3 text-center">
        <p className="font-titulo text-3xl leading-tight">Bebida gelada, pedido em minutos</p>
        <Link to="/catalogo" className={cn(buttonVariants(), 'h-12 w-full max-w-sm text-base')}>
          Ver catálogo completo{total.data ? ` · ${total.data} itens` : ''}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </section>

      <section aria-labelledby="cat-titulo">
        <h2 id="cat-titulo" className="mb-3 text-2xl">
          Mais pedidos
        </h2>
        {categorias.isError ? (
          <ErrorState onRetry={() => categorias.refetch()} />
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {categorias.isPending
              ? Array.from({ length: 6 }, (_, i) => <li key={i} className="shimmer h-16 rounded-xl border-2 border-preto" aria-hidden />)
              : escolherDestaques(categorias.data ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/catalogo?cat=${c.id}`}
                      className="flex h-16 items-center gap-2 rounded-xl border-2 border-preto bg-bege px-3 text-preto shadow-adesivo-sm transition hover:bg-bege-escuro"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-preto bg-ambar">
                        <CategoryIcon nome={c.nome} className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-extrabold leading-tight">{c.nome}</span>
                    </Link>
                  </li>
                ))}
          </ul>
        )}
        <p className="mt-3 text-center text-sm">
          <Link to="/catalogo" className="font-bold underline underline-offset-2">
            Ver todas as categorias
          </Link>
        </p>
      </section>
    </div>
  )
}
