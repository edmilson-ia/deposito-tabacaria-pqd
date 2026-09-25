import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Unidade } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatBRL = (v: number) => brl.format(v)

// O código interno `cx` (banco) é exibido como "pack" para o cliente final e no painel.
export const UNIDADE_LABEL: Record<Unidade, string> = {
  un: 'unidade',
  cx: 'pack',
  fardo: 'fardo',
}

/** Forma curta (etiqueta do card, mensagem do WhatsApp, lista do admin). */
export const UNIDADE_SIGLA: Record<Unidade, string> = {
  un: 'un',
  cx: 'pack',
  fardo: 'fardo',
}

/** Acréscimo aplicado sobre o valor dos produtos quando o pagamento é no cartão (débito/crédito). */
export const ACRESCIMO_CARTAO = 0.1

export const NOME_LOJA = 'Depósito e Tabacaria do PQD'
