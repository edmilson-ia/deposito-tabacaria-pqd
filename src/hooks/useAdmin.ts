import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Categoria, Produto } from '@/lib/types'

export type StatusPedido = 'novo' | 'confirmado' | 'em_entrega' | 'entregue' | 'cancelado'
export const STATUS_LABEL: Record<StatusPedido, string> = {
  novo: 'Novo',
  confirmado: 'Confirmado',
  em_entrega: 'Em entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export interface PedidoAdmin {
  id: number
  numero_diario: number | null
  nome_cliente: string
  telefone: string
  endereco: string
  status: StatusPedido
  total: number
  taxa_entrega: number
  distancia_km: number | null
  desconto: number
  forma_pagamento: 'pix' | 'dinheiro' | 'cartao'
  troco_para: number | null
  observacoes: string | null
  criado_em: string
  itens_pedido: { id: number; nome_produto: string; quantidade: number; preco_unitario: number }[]
}

/** Erro de "0 linhas" = o RLS barrou (usuário sem permissão) ou o registro não existe. */
function exigirLinha<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Sem permissão ou registro não encontrado.')
  return data
}

function invalidarPublico(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['produtos'] })
  qc.invalidateQueries({ queryKey: ['categorias'] })
  qc.invalidateQueries({ queryKey: ['total-produtos'] })
  qc.invalidateQueries({ queryKey: ['admin', 'produtos'] })
  qc.invalidateQueries({ queryKey: ['admin', 'categorias'] })
}

export function useAdminCategorias() {
  return useQuery({
    queryKey: ['admin', 'categorias'],
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase.from('categorias').select('id, nome, ordem').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAdminProdutos() {
  return useQuery({
    queryKey: ['admin', 'produtos'],
    queryFn: async (): Promise<Produto[]> => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, nome, descricao, categoria_id, preco, unidade, estoque, imagem_url, ativo')
        .order('nome')
        .limit(5000)
      if (error) throw error
      return (data ?? []) as Produto[]
    },
    refetchOnWindowFocus: true,
  })
}

export type ProdutoInput = Omit<Produto, 'id'> & { id?: number }

export function useSalvarProduto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: ProdutoInput) => {
      const q = id
        ? supabase.from('produtos').update(campos).eq('id', id)
        : supabase.from('produtos').insert(campos)
      const { data, error } = await q.select('id').maybeSingle()
      return exigirLinha(data, error)
    },
    onSuccess: () => invalidarPublico(qc),
  })
}

export function useExcluirProduto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from('produtos').delete().eq('id', id).select('id').maybeSingle()
      return exigirLinha(data, error)
    },
    onSuccess: () => invalidarPublico(qc),
  })
}

export function useAdminPedidos(status: StatusPedido | 'todos', atualizarACada?: number) {
  return useQuery({
    queryKey: ['admin', 'pedidos', status],
    queryFn: async (): Promise<PedidoAdmin[]> => {
      let q = supabase
        .from('pedidos')
        .select(
          'id, numero_diario, nome_cliente, telefone, endereco, status, total, taxa_entrega, distancia_km, desconto, forma_pagamento, troco_para, observacoes, criado_em, itens_pedido(id, nome_produto, quantidade, preco_unitario)',
        )
        .order('criado_em', { ascending: false })
        .limit(200)
      if (status !== 'todos') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PedidoAdmin[]
    },
    refetchOnWindowFocus: true,
    refetchInterval: atualizarACada || false,
  })
}

export function useAtualizarStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: StatusPedido }) => {
      const { data, error } = await supabase.from('pedidos').update({ status }).eq('id', id).select('id').maybeSingle()
      return exigirLinha(data, error)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'pedidos'] }),
  })
}

export function useSalvarConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (valores: Record<string, string>) => {
      const linhas = Object.entries(valores).map(([chave, valor]) => ({ chave, valor }))
      const { data, error } = await supabase.from('configuracoes').upsert(linhas, { onConflict: 'chave' }).select('chave')
      if (error) throw new Error(error.message)
      if (!data || data.length !== linhas.length) throw new Error('Sem permissão para salvar as configurações.')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config'] }),
  })
}

/* ------------------------------ categorias ------------------------------ */

export function useSalvarCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nome, ordem }: { id?: number; nome: string; ordem?: number }) => {
      const q = id
        ? supabase.from('categorias').update({ nome }).eq('id', id)
        : supabase.from('categorias').insert({ nome, ordem: ordem ?? 0 })
      const { data, error } = await q.select('id').maybeSingle()
      return exigirLinha(data, error)
    },
    onSuccess: () => invalidarPublico(qc),
  })
}

export function useExcluirCategoria() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await supabase.from('categorias').delete().eq('id', id).select('id').maybeSingle()
      return exigirLinha(data, error)
    },
    onSuccess: () => invalidarPublico(qc),
  })
}

/** Regrava a ordem 1..N de todas as categorias (evita empates). */
export function useReordenarCategorias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (lista: Categoria[]) => {
      const linhas = lista.map((c, i) => ({ id: c.id, nome: c.nome, ordem: i + 1 }))
      const { data, error } = await supabase.from('categorias').upsert(linhas, { onConflict: 'id' }).select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length !== linhas.length) throw new Error('Sem permissão para reordenar.')
    },
    onSuccess: () => {
      invalidarPublico(qc)
      qc.invalidateQueries({ queryKey: ['admin', 'categorias'] })
    },
  })
}
