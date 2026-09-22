import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Licenca {
  /** false = loja travada: o servidor recusa pedidos novos */
  ativa: boolean
  plano: 'teste' | 'mensal' | 'isento'
  em_teste: boolean
  /** bloqueio manual feito pelo dono do sistema */
  bloqueada: boolean
  /** mensalidade vencida, mas ainda dentro dos dias de tolerância */
  em_carencia: boolean
  valido_ate: string | null
  dias_restantes: number | null
}

/**
 * Estado do período de teste (hora do SERVIDOR). Se a consulta falhar (ex.: função ainda não criada
 * no banco, sem internet), devolve null e o site trata como "liberada": um erro de checagem nunca
 * pode travar as vendas. Quem realmente bloqueia é a função criar_pedido no banco.
 */
export function useLicenca() {
  return useQuery({
    queryKey: ['licenca'],
    queryFn: async (): Promise<Licenca | null> => {
      const { data, error } = await supabase.rpc('estado_licenca')
      if (error || !data) return null
      return data as Licenca
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}

/** true somente quando temos certeza de que o teste terminou. */
export function usePedidosPausados(): boolean {
  const { data } = useLicenca()
  return data?.ativa === false
}
