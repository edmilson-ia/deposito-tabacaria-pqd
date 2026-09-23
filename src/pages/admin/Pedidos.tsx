import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { STATUS_LABEL, useAdminPedidos, useAtualizarStatus, type PedidoAdmin, type StatusPedido } from '@/hooks/useAdmin'
import { FORMAS_PAGAMENTO } from '@/lib/schemas'
import { cn, formatBRL } from '@/lib/utils'

const COR: Record<StatusPedido, string> = {
  novo: 'bg-ambar',
  confirmado: 'bg-sky-300',
  em_entrega: 'bg-violet-300',
  entregue: 'bg-zap',
  cancelado: 'bg-red-300',
}

const ORDEM_STATUS = Object.keys(STATUS_LABEL) as StatusPedido[]

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function CartaoPedido({ p }: { p: PedidoAdmin }) {
  const atualizar = useAtualizarStatus()
  const tel = p.telefone.replace(/\D/g, '')

  return (
    <li className="rounded-xl border-2 border-preto bg-bege p-4 text-preto shadow-adesivo-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-titulo text-2xl leading-none">#{p.numero_diario ?? p.id}</span>
        <span className={cn('rounded-md border-2 border-preto px-2 py-0.5 text-xs font-extrabold uppercase', COR[p.status])}>{STATUS_LABEL[p.status]}</span>
        <span className="text-xs text-preto/70">{formatarData(p.criado_em)}</span>
        <span className="ml-auto text-lg font-extrabold">{formatBRL(p.total)}</span>
      </div>

      <p className="mt-2 text-sm font-extrabold">{p.nome_cliente}</p>
      <p className="text-sm">
        <a href={`https://wa.me/55${tel}`} target="_blank" rel="noopener noreferrer" className="font-bold underline">{p.telefone}</a>
        {' · '}{p.endereco}
      </p>
      <p className="text-sm">
        {FORMAS_PAGAMENTO[p.forma_pagamento]}
        {p.troco_para ? ` · troco para ${formatBRL(p.troco_para)}` : ''}
        {p.taxa_entrega > 0 ? ` · entrega ${formatBRL(p.taxa_entrega)}` : ' · entrega a combinar'}
      </p>
      {p.observacoes && <p className="mt-1 rounded bg-white/60 p-2 text-sm italic">“{p.observacoes}”</p>}

      <ul className="mt-2 divide-y divide-preto/15 rounded-lg border-2 border-preto bg-white text-sm">
        {p.itens_pedido.map((i) => (
          <li key={i.id} className="flex justify-between gap-2 px-3 py-1.5">
            <span>{i.quantidade}× {i.nome_produto}</span>
            <span className="font-bold">{formatBRL(i.quantidade * i.preco_unitario)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor={`st-${p.id}`} className="text-sm font-extrabold">Status</label>
        <select
          id={`st-${p.id}`}
          value={p.status}
          disabled={atualizar.isPending}
          onChange={(e) =>
            atualizar.mutate(
              { id: p.id, status: e.target.value as StatusPedido },
              {
                onSuccess: () => toast.success(`Pedido #${p.numero_diario ?? p.id}: ${STATUS_LABEL[e.target.value as StatusPedido]}`),
                onError: (err) => toast.error(`Não foi possível atualizar: ${err.message}`),
              },
            )
          }
          className="h-10 rounded-lg border-2 border-preto bg-white px-2 text-sm font-bold"
        >
          {ORDEM_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
    </li>
  )
}

export default function Pedidos() {
  const [status, setStatus] = useState<StatusPedido | 'todos'>('todos')
  const pedidos = useAdminPedidos(status)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl">Pedidos</h1>
        <Button variant="outline" onClick={() => pedidos.refetch()} disabled={pedidos.isFetching}>
          <RefreshCw className={cn('h-4 w-4', pedidos.isFetching && 'animate-spin')} aria-hidden /> Atualizar
        </Button>
      </div>

      <div role="group" aria-label="Filtrar por status" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {(['todos', ...ORDEM_STATUS] as const).map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn('shrink-0 rounded-full border-2 border-preto px-3 py-1.5 text-xs font-extrabold text-preto', status === s ? 'bg-ambar shadow-adesivo-sm' : 'bg-bege hover:bg-bege-escuro')}
          >
            {s === 'todos' ? 'Todos' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {pedidos.isError ? (
        <ErrorState onRetry={() => pedidos.refetch()} mensagem="Não foi possível carregar os pedidos." />
      ) : pedidos.isPending ? (
        <ul className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <li key={i} className="shimmer h-44 rounded-xl border-2 border-preto" />)}
        </ul>
      ) : pedidos.data.length === 0 ? (
        <EmptyState titulo="Nenhum pedido" texto={status === 'todos' ? 'Quando chegar um pedido, ele aparece aqui.' : 'Nenhum pedido com este status.'} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {pedidos.data.map((p) => <CartaoPedido key={p.id} p={p} />)}
        </ul>
      )}
    </div>
  )
}
