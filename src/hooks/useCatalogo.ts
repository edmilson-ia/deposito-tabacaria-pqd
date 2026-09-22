import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CategoriaComContagem, Produto } from '@/lib/types'

export const PAGE_SIZE = 24

export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    queryFn: async (): Promise<CategoriaComContagem[]> => {
      const { data, error } = await supabase
        .from('categorias')
        .select('id, nome, ordem, produtos(count)')
        .order('ordem')
      if (error) throw error
      return (data ?? [])
        .map((c) => ({
          id: c.id,
          nome: c.nome,
          ordem: c.ordem,
          total: (c.produtos as unknown as { count: number }[])?.[0]?.count ?? 0,
        }))
        .filter((c) => c.total > 0)
    },
    staleTime: 5 * 60_000,
  })
}

interface Filtros {
  busca: string
  categoriaId: number | null
}

export function useProdutos({ busca, categoriaId }: Filtros) {
  return useInfiniteQuery({
    queryKey: ['produtos', busca, categoriaId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('produtos')
        .select('id, nome, descricao, categoria_id, preco, unidade, estoque, imagem_url, ativo', { count: 'exact' })
        .order('nome')
        .range(pageParam, pageParam + PAGE_SIZE - 1)
      if (categoriaId) q = q.eq('categoria_id', categoriaId)
      if (busca) q = q.ilike('nome', `%${busca.replace(/[%_,]/g, ' ')}%`)
      const { data, error, count } = await q
      if (error) throw error
      return { itens: (data ?? []) as Produto[], total: count ?? 0, proximo: pageParam + PAGE_SIZE }
    },
    getNextPageParam: (ultima) => (ultima.proximo < ultima.total ? ultima.proximo : undefined),
  })
}

export function useTotalProdutos() {
  return useQuery({
    queryKey: ['total-produtos'],
    queryFn: async () => {
      const { count, error } = await supabase.from('produtos').select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
    staleTime: 5 * 60_000,
  })
}

export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('configuracoes').select('chave, valor')
      if (error) throw error
      return Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor]))
    },
    staleTime: 5 * 60_000,
  })
}
