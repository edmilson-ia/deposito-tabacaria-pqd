import { z } from 'zod'

/**
 * Login do admin por telefone SEM SMS: o Supabase Auth só aceita e-mail+senha sem provedor de SMS,
 * então o telefone (só dígitos, com DDD, sem o 55) vira o e-mail interno `<telefone>@admin.example.com`.
 * Ao criar o usuário no painel do Supabase use exatamente esse e-mail (veja o README).
 * `example.com` é domínio reservado pela IANA: ninguém consegue receber e-mail nele (sem risco de
 * sequestro de conta por "esqueci a senha").
 */
export const DOMINIO_TELEFONE = 'admin.example.com'

const emailSchema = z.string().email()

export function resolverIdentificador(texto: string): { email: string } | { erro: string } {
  const t = texto.trim()
  if (!t) return { erro: 'Informe o e-mail' }

  if (t.includes('@')) {
    return emailSchema.safeParse(t).success ? { email: t } : { erro: 'Informe um e-mail válido' }
  }

  const digitos = t.replace(/\D/g, '')
  const nacional = digitos.length >= 12 && digitos.startsWith('55') ? digitos.slice(2) : digitos
  if (nacional.length !== 10 && nacional.length !== 11) {
    return { erro: 'Informe um e-mail válido' }
  }
  return { email: `${nacional}@${DOMINIO_TELEFONE}` }
}
