import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Plus, ShoppingCart, X, ZoomIn } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ProductImage } from '@/components/ProductImage'
import { usePedidosPausados } from '@/hooks/useLicenca'
import { useCart } from '@/lib/cart'
import type { Produto } from '@/lib/types'
import { cn, formatBRL, UNIDADE_LABEL, UNIDADE_SIGLA } from '@/lib/utils'

export function ProductCard({ produto }: { produto: Produto }) {
  const { adicionar, alterar, quantidadeDe } = useCart()
  const pausados = usePedidosPausados()
  const disponivel = produto.estoque > 0
  const qtd = quantidadeDe(produto.id)

  return (
    <article
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-xl border-2 border-preto bg-bege text-preto shadow-adesivo',
        !disponivel && 'opacity-90',
      )}
    >
      <div className="relative">
        {produto.imagem_url ? (
          <Dialog.Root>
            <Dialog.Trigger
              aria-label={`Ampliar foto de ${produto.nome}`}
              className="relative block w-full cursor-zoom-in"
            >
              <ProductImage src={produto.imagem_url} alt={produto.nome} className="aspect-square w-full border-b-2 border-preto" />
              <span className="pointer-events-none absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-preto bg-bege" aria-hidden>
                <ZoomIn className="h-4 w-4" />
              </span>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/80" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[90] flex max-h-[92vh] w-[94vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border-2 border-preto bg-white text-preto shadow-adesivo">
                <div className="flex items-center gap-2 border-b-2 border-preto bg-bege px-3 py-2">
                  <Dialog.Title className="flex-1 text-sm font-extrabold leading-tight">{produto.nome}</Dialog.Title>
                  <Dialog.Close aria-label="Fechar foto" className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-preto bg-white">
                    <X className="h-5 w-5" aria-hidden />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">Foto ampliada do produto</Dialog.Description>
                <img src={produto.imagem_url} alt={produto.nome} className="max-h-[80vh] w-full flex-1 object-contain p-3" />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        ) : (
          <ProductImage src={produto.imagem_url} alt={produto.nome} className="aspect-square w-full border-b-2 border-preto" />
        )}
        {!disponivel && (
          <span className="absolute left-2 top-2 rounded-md border-2 border-preto bg-preto px-2 py-0.5 text-[11px] font-extrabold uppercase text-bege">
            Indisponível
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-md border-2 border-preto bg-ambar px-1.5 py-0.5 text-[11px] font-extrabold uppercase">
          {UNIDADE_SIGLA[produto.unidade]}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="font-sans text-sm font-extrabold leading-tight">{produto.nome}</h3>
        {produto.descricao && produto.descricao.toLowerCase() !== produto.nome.toLowerCase() && (
          <p className="line-clamp-2 text-xs text-preto/70">{produto.descricao}</p>
        )}

        <div className="mt-auto pt-2">
          <p className="text-lg font-extrabold leading-none">
            {formatBRL(produto.preco)}
            <span className="ml-1 text-[11px] font-semibold text-preto/70">/ {UNIDADE_LABEL[produto.unidade]}</span>
          </p>

          <div className="mt-2">
            {!disponivel ? (
              <Button disabled variant="outline" className="w-full">
                Indisponível
              </Button>
            ) : pausados ? (
              <Button disabled variant="outline" className="w-full">
                Pedidos pausados
              </Button>
            ) : qtd === 0 ? (
              <Button
                className="w-full"
                onClick={() => {
                  adicionar(produto)
                  toast.success(`${produto.nome} adicionado`, { duration: 1500 })
                }}
                aria-label={`Adicionar ${produto.nome} ao carrinho`}
              >
                <ShoppingCart className="h-4 w-4" aria-hidden /> Adicionar
              </Button>
            ) : (
              <div className="flex h-11 items-center justify-between rounded-lg border-2 border-preto bg-white px-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 px-0"
                  onClick={() => alterar(produto.id, -1)}
                  aria-label={`Diminuir quantidade de ${produto.nome}`}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
                <span className="min-w-8 text-center text-base font-extrabold" aria-live="polite">
                  {qtd}
                </span>
                <Button
                  size="sm"
                  className="h-8 w-8 px-0"
                  onClick={() => alterar(produto.id, 1)}
                  aria-label={`Aumentar quantidade de ${produto.nome}`}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border-2 border-preto bg-bege shadow-adesivo" aria-hidden>
      <div className="shimmer aspect-square w-full border-b-2 border-preto" />
      <div className="space-y-2 p-3">
        <div className="shimmer h-4 w-4/5 rounded" />
        <div className="shimmer h-3 w-3/5 rounded" />
        <div className="shimmer mt-3 h-6 w-2/5 rounded" />
        <div className="shimmer h-11 w-full rounded-lg" />
      </div>
    </div>
  )
}
