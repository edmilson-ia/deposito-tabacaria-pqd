import type { CartItem } from './cart'
import { parseValor, type CheckoutDados } from './schemas'
import { supabase } from './supabase'

export class PedidoError extends Error {}

/**
 * Salva o pedido via RPC (o servidor recalcula preços e total).
 * Só é chamado com o carrinho ainda intacto: quem chama limpa o carrinho apenas se isto retornar.
 */
export async function criarPedido(dados: CheckoutDados, itens: CartItem[]): Promise<number> {
  const troco =
    dados.forma_pagamento === 'dinheiro' && dados.troco_para ? parseValor(dados.troco_para) : null

  const { data, error } = await supabase.rpc('criar_pedido', {
    payload: {
      nome: dados.nome,
      telefone: dados.telefone,
      endereco: dados.endereco,
      forma_pagamento: dados.forma_pagamento,
      troco_para: troco,
      observacoes: dados.observacoes || null,
      itens: itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
    },
  })

  if (error) {
    // Mensagens levantadas pela função (P0001) já vêm em português e são seguras para exibir.
    if (error.code === 'P0001') throw new PedidoError(error.message)
    if (/fetch|network|failed/i.test(error.message) || !error.code) {
      throw new PedidoError('Sem conexão com o servidor. Verifique sua internet e tente de novo. Seu carrinho foi mantido.')
    }
    throw new PedidoError('Não foi possível registrar o pedido agora. Seu carrinho foi mantido; tente novamente.')
  }
  if (typeof data !== 'number') throw new PedidoError('Resposta inesperada do servidor. Tente novamente.')
  return data
}
