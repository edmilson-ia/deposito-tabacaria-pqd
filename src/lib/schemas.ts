import { z } from 'zod'

/** "100", "100,50", "R$ 1.000,50" → 1000.5 (ou NaN) */
export function parseValor(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  return limpo ? Number(limpo) : NaN
}

export const apenasDigitos = (s: string) => s.replace(/\D/g, '')

/** (21) 99999-8888 enquanto digita */
export function mascararTelefone(s: string): string {
  const d = apenasDigitos(s).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** 21725030 → 21725-030 enquanto digita */
export function mascararCep(s: string): string {
  const d = apenasDigitos(s).slice(0, 8)
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`
}

export const FORMAS_PAGAMENTO = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão (débito/crédito)',
} as const

export const checkoutSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe seu nome').max(120, 'Nome muito longo'),
    telefone: z
      .string()
      .transform(apenasDigitos)
      .refine((d) => d.length === 10 || d.length === 11, 'Telefone com DDD, ex.: (21) 99999-8888'),
    endereco: z.string().trim().min(3, 'Informe o nome da rua').max(150, 'Nome da rua muito longo'),
    numero: z.string().trim().min(1, 'Informe o número').max(20, 'Número muito longo'),
    bairro: z.string().trim().min(2, 'Informe o bairro').max(80, 'Bairro muito longo'),
    cidade: z.string().trim().min(2, 'Informe a cidade').max(80, 'Cidade muito longa'),
    complemento: z.string().trim().max(100, 'Máximo de 100 caracteres').optional(),
    cep: z
      .string()
      .transform(apenasDigitos)
      .refine((d) => d.length === 8, 'CEP com 8 números, ex.: 21725-030'),
    forma_pagamento: z.enum(['pix', 'dinheiro', 'cartao'], { error: 'Escolha a forma de pagamento' }),
    troco_para: z.string().trim().optional(),
    observacoes: z.string().trim().max(500, 'Máximo de 500 caracteres').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.forma_pagamento === 'dinheiro' && v.troco_para) {
      const n = parseValor(v.troco_para)
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', path: ['troco_para'], message: 'Valor de troco inválido' })
      }
    }
  })

/** Texto único do endereço (gravado no pedido, na mensagem e no cupom). */
export function enderecoCompleto(d: { endereco: string; numero: string; bairro: string; cidade: string; complemento?: string; cep: string }): string {
  return `${d.endereco}, nº ${d.numero}${d.complemento ? ` (${d.complemento})` : ''} - ${d.bairro}, ${d.cidade} - CEP ${mascararCep(d.cep)}`
}

export type CheckoutInput = z.input<typeof checkoutSchema>
export type CheckoutDados = z.output<typeof checkoutSchema>

export const produtoSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(150, 'Nome muito longo'),
  descricao: z.string().trim().max(300, 'Máximo de 300 caracteres').optional(),
  categoria_id: z.number({ error: 'Escolha a categoria' }).int().positive('Escolha a categoria'),
  preco: z
    .string()
    .transform(parseValor)
    .refine((n) => Number.isFinite(n) && n >= 0 && n < 100000, 'Preço inválido'),
  unidade: z.enum(['un', 'cx', 'fardo'], { error: 'Escolha a unidade' }),
  estoque: z
    .string()
    .transform((s) => Number(s.trim()))
    .refine((n) => Number.isInteger(n) && n >= 0 && n <= 1_000_000, 'Estoque deve ser um número inteiro ≥ 0'),
  ativo: z.boolean(),
})

export const configSchema = z.object({
  nome_loja: z.string().trim().min(2, 'Informe o nome da loja').max(120),
  whatsapp_numero: z
    .string()
    .transform(apenasDigitos)
    .refine((d) => d.length >= 12 && d.length <= 13, 'Use DDI+DDD+número, ex.: 5521999999999'),
  taxa_entrega: z
    .string()
    .transform((s) => (s.trim() === '' ? 0 : parseValor(s)))
    .refine((n) => Number.isFinite(n) && n >= 0 && n < 10000, 'Taxa inválida'),
  grupo_promocao_url: z
    .string()
    .trim()
    .refine((s) => s === '' || /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//.test(s), 'Cole o link do grupo do WhatsApp (começa com https://chat.whatsapp.com/)'),
})

export const categoriaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome (mín. 2 letras)').max(60, 'Máximo de 60 caracteres'),
})

export const novaSenhaSchema = z
  .object({
    senha: z
      .string()
      .min(8, 'Use ao menos 8 caracteres')
      .regex(/[A-Za-z]/, 'Inclua ao menos uma letra')
      .regex(/\d/, 'Inclua ao menos um número'),
    confirmar: z.string(),
  })
  .refine((v) => v.senha === v.confirmar, { path: ['confirmar'], message: 'As senhas não são iguais' })
