import type { CartItem } from './cart'
import { FORMAS_PAGAMENTO, parseValor, type CheckoutDados } from './schemas'
import { formatBRL, NOME_LOJA, UNIDADE_SIGLA } from './utils'

interface Resumo {
  pedidoId: number
  itens: CartItem[]
  subtotal: number
  taxaEntrega: number
  total: number
  dados: CheckoutDados
}

export function montarMensagem({ pedidoId, itens, subtotal, taxaEntrega, total, dados }: Resumo): string {
  const linhas = itens.map((i) => `• ${i.quantidade}x ${i.nome} (${UNIDADE_SIGLA[i.unidade]}) — ${formatBRL(i.quantidade * i.preco)}`)
  const pagamento =
    dados.forma_pagamento === 'dinheiro' && dados.troco_para
      ? `${FORMAS_PAGAMENTO.dinheiro} (troco para ${formatBRL(parseValor(dados.troco_para))})`
      : FORMAS_PAGAMENTO[dados.forma_pagamento]

  return [
    `Olá! Quero fazer um pedido (#${pedidoId}) na ${NOME_LOJA}:`,
    '',
    ...linhas,
    '',
    `Subtotal: ${formatBRL(subtotal)}`,
    // taxa 0 = entrega "a combinar" (valor depende da distância, combinado pelo WhatsApp)
    taxaEntrega > 0 ? `Entrega: ${formatBRL(taxaEntrega)}` : 'Entrega: a combinar',
    taxaEntrega > 0 ? `*Total: ${formatBRL(total)}*` : `*Total (sem entrega): ${formatBRL(total)}*`,
    '',
    `Nome: ${dados.nome}`,
    `Telefone: ${dados.telefone}`,
    `Endereço: ${dados.endereco}`,
    `Pagamento: ${pagamento}`,
    ...(dados.observacoes ? [`Observações: ${dados.observacoes}`] : []),
  ].join('\n')
}

/** Número da loja vem de configuracoes.whatsapp_numero. Aceita com ou sem 55. */
export function urlWhatsapp(numeroBruto: string, texto: string): string | null {
  let n = numeroBruto.replace(/\D/g, '')
  if (n.length === 10 || n.length === 11) n = `55${n}`
  if (n.length < 12) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}
