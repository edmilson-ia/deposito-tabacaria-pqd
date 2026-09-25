import { Printer, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { STATUS_LABEL, useAdminPedidos, useAtualizarStatus, type PedidoAdmin, type StatusPedido } from '@/hooks/useAdmin'
import { imprimirCupom, imprimirCupomAutomatico } from '@/lib/cupom'
import { supabase } from '@/lib/supabase'
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
        {p.taxa_entrega > 0 ? ` · entrega ${formatBRL(p.taxa_entrega)}${p.distancia_km ? ` (${Number(p.distancia_km).toFixed(1).replace('.', ',')} km)` : ''}` : ' · entrega a combinar'}
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
        <Button
          variant="outline"
          className="ml-auto h-10"
          onClick={() => { if (!imprimirCupom(p)) toast.error('O navegador bloqueou a janela de impressão. Permita pop-ups para este site.') }}
        >
          <Printer className="h-4 w-4" aria-hidden /> Imprimir cupom
        </Button>
      </div>
    </li>
  )
}

const AUTO_KEY = 'pqd_auto_imprimir'
const IMPRESSOS_KEY = 'pqd_pedidos_impressos'

function lerImpressos(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(IMPRESSOS_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : []
  } catch {
    return []
  }
}
function gravarImpressos(ids: number[]) {
  try {
    localStorage.setItem(IMPRESSOS_KEY, JSON.stringify(ids.slice(-500)))
  } catch {
    /* sem armazenamento: pode reimprimir ao recarregar */
  }
}

/** Beep curto para avisar que chegou pedido (alguns navegadores só tocam depois de um clique na página). */
function apitar() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    osc.frequency.value = 880
    osc.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    /* sem áudio: só imprime */
  }
}

export default function Pedidos() {
  const [status, setStatus] = useState<StatusPedido | 'todos'>('todos')
  const [auto, setAuto] = useState(() => {
    try {
      return localStorage.getItem(AUTO_KEY) !== '0' // ligado por padrão
    } catch {
      return true
    }
  })
  // Realtime avisa na hora; o intervalo de 10 s é só a garantia se a conexão cair.
  const pedidos = useAdminPedidos(status, auto ? 10000 : undefined)

  useEffect(() => {
    if (!auto) return
    const canal = supabase
      .channel('pedidos-novos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, () => {
        pedidos.refetch()
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  function alternarAuto(ligar: boolean) {
    setAuto(ligar)
    try {
      localStorage.setItem(AUTO_KEY, ligar ? '1' : '0')
    } catch {
      /* ignora */
    }
    // Ao ligar, os pedidos que já existem contam como impressos: só os NOVOS saem sozinhos.
    if (ligar && pedidos.data) gravarImpressos([...new Set([...lerImpressos(), ...pedidos.data.map((p) => p.id)])])
  }

  // Impressão automática: imprime cada pedido novo que ainda não saiu nesta máquina.
  useEffect(() => {
    if (!auto || !pedidos.data) return
    // Primeira vez nesta máquina: o que já existe conta como impresso (só pedidos NOVOS saem sozinhos).
    if (localStorage.getItem(IMPRESSOS_KEY) === null) {
      gravarImpressos(pedidos.data.map((p) => p.id))
      return
    }
    const impressos = new Set(lerImpressos())
    const novos = pedidos.data.filter((p) => p.status === 'novo' && !impressos.has(p.id)).reverse()
    if (!novos.length) return
    gravarImpressos([...impressos, ...novos.map((p) => p.id)])
    apitar()
    novos.forEach((p, i) => setTimeout(() => imprimirCupomAutomatico(p), i * 1500))
    toast.success(`${novos.length} pedido(s) novo(s): imprimindo o talão.`)
  }, [auto, pedidos.data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-3xl">Pedidos</h1>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-preto bg-bege px-3 py-2 text-xs font-extrabold text-preto">
          <input type="checkbox" checked={auto} onChange={(e) => alternarAuto(e.target.checked)} className="h-4 w-4" />
          Imprimir pedidos novos automaticamente
        </label>
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
