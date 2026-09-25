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

/** Os preços do site são os do cartão (+10%); Pix/dinheiro dividem por 1,10 (≈ 9,09% de desconto). */
export const FATOR_CARTAO = 1.1

/** Instagram da Evolua Automação (crédito discreto no admin e na página Empresa). Vazio = só o texto, sem link. */
export const EVOLUA_INSTAGRAM_URL = 'https://www.instagram.com/evolua_automacao/'

export const NOME_LOJA = 'Depósito e Tabacaria do PQD'
