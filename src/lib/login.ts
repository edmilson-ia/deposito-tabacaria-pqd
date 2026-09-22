import { z } from 'zod'
import { supabase } from './supabase'

/**
 * Login do admin por e-mail ou telefone. O telefone NÃO vira mais um e-mail sintético:
 * fica salvo em `admins.telefone` e é traduzido para o e-mail real da conta pela função
 * `email_login_por_telefone` no servidor (migration 0004). Isso permite trocar o e-mail
 * da conta a qualquer momento (Authentication → Users) sem quebrar o login por telefone,
 * e faz a recuperação de senha mandar e-mail de verdade.
 */
export type Identificador = { tipo: 'email'; email: string } | { tipo: 'telefone'; telefone: string } | { erro: string }

const emailSchema = z.string().email()

export function normalizarIdentificador(texto: string): Identificador {
  const t = texto.trim()
  if (!t) return { erro: 'Informe o e-mail ou telefone' }

  if (t.includes('@')) {
    return emailSchema.safeParse(t).success ? { tipo: 'email', email: t } : { erro: 'Informe um e-mail válido' }
  }

  const digitos = t.replace(/\D/g, '')
  const nacional = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos
  if (nacional.length !== 10 && nacional.length !== 11) {
    return { erro: 'Informe um e-mail ou telefone válido' }
  }
  return { tipo: 'telefone', telefone: nacional }
}

/** Busca o e-mail real cadastrado para um telefone de admin. Devolve null se não existir (não revela quem é admin). */
export async function emailPorTelefone(telefone: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('email_login_por_telefone', { p_telefone: telefone })
  if (error) return null
  return (data as string | null) ?? null
}
