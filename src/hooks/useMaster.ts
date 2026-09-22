import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Licenca } from './useLicenca'

export interface LicencaCompleta {
  id: number
  plano: 'teste' | 'mensal' | 'isento'
  valido_ate: string | null
  carencia_dias: number
  bloqueada: boolean
  motivo_bloqueio: string | null
  cliente_nome: string | null
  valor_mensal: number | null
  ultimo_pagamento_em: string | null
  iniciado_em: string | null
  atualizado_em: string
}

export interface HistoricoItem {
  id: number
  criado_em: string
  acao: string
  dias: number | null
  valor: number | null
  valido_ate_novo: string | null
  observacao: string | null
}

export interface MasterEstado {
  licenca: LicencaCompleta
  estado: Licenca
  historico: HistoricoItem[]
}

/** Todas as chamadas passam por funções `master_*` que o banco só executa para superadmin. */
export function useMasterEstado() {
  return useQuery({
    queryKey: ['master', 'estado'],
    queryFn: async (): Promise<MasterEstado> => {
      const { data, error } = await supabase.rpc('master_estado')
      if (error) throw new Error(error.message)
      return data as MasterEstado
    },
    refetchOnWindowFocus: true,
  })
}

type Acao =
  | { fn: 'master_registrar_pagamento'; args: { p_dias: number; p_valor: number | null; p_obs: string | null } }
  | { fn: 'master_iniciar_teste'; args: { p_dias: number } }
  | { fn: 'master_definir_vencimento'; args: { p_valido_ate: string | null; p_carencia: number | null } }
  | { fn: 'master_definir_plano'; args: { p_plano: 'teste' | 'mensal' | 'isento' } }
  | { fn: 'master_bloquear'; args: { p_motivo: string | null } }
  | { fn: 'master_liberar'; args: Record<string, never> }
  | { fn: 'master_definir_cliente'; args: { p_nome: string | null; p_valor: number | null } }

export function useMasterAcao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ fn, args }: Acao): Promise<MasterEstado> => {
      const { data, error } = await supabase.rpc(fn, args)
      if (error) throw new Error(error.message)
      return data as MasterEstado
    },
    onSuccess: (data) => {
      qc.setQueryData(['master', 'estado'], data)
      qc.invalidateQueries({ queryKey: ['licenca'] }) // o site e o painel da loja releem o estado
    },
  })
}
