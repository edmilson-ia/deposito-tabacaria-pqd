import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

interface AuthValue {
  carregando: boolean
  sessao: Session | null
  /** true só se o usuário logado existe na tabela `admins` (checado pelo RLS) */
  admin: boolean
  /** true só se o usuário logado existe em `superadmins` (dono do sistema) */
  master: boolean
  entrar: (email: string, senha: string) => Promise<string | null>
  /** Envia o link de recuperação. Sempre devolve null em caso de "não existe" (não revela quem é admin). */
  pedirRecuperacao: (email: string) => Promise<string | null>
  definirSenha: (senha: string) => Promise<string | null>
  /** Pede a troca do e-mail da conta logada. O Supabase manda um link de confirmação para o e-mail NOVO. */
  definirEmail: (novoEmail: string) => Promise<string | null>
  sair: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [sessaoPronta, setSessaoPronta] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [master, setMaster] = useState(false)
  const [adminPronto, setAdminPronto] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setSessaoPronta(true)
    })
    // Não chamar o Supabase de dentro deste callback (risco de travar); só guardar a sessão.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setSessaoPronta(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const uid = sessao?.user.id
  useEffect(() => {
    if (!sessaoPronta) return
    if (!uid) {
      setAdmin(false)
      setMaster(false)
      setAdminPronto(true)
      return
    }
    setAdminPronto(false)
    let cancelado = false
    Promise.all([
      supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
      // se a migration 0003 ainda não foi aplicada a tabela não existe: trata como "não é master"
      supabase.from('superadmins').select('user_id').eq('user_id', uid).maybeSingle(),
    ]).then(([a, m]) => {
      if (cancelado) return
      setAdmin(!!a.data)
      setMaster(!!m.data)
      setAdminPronto(true)
    })
    return () => {
      cancelado = true
    }
  }, [uid, sessaoPronta])

  const entrar = useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (!error) return null
    if (/invalid login/i.test(error.message)) return 'E-mail (ou telefone) ou senha incorretos.'
    if (/email not confirmed/i.test(error.message)) return 'Usuário ainda não confirmado no Supabase (marque Auto Confirm ao criar).'
    if (/fetch|network/i.test(error.message)) return 'Sem conexão com o servidor. Tente novamente.'
    return 'Não foi possível entrar agora. Tente novamente.'
  }, [])

  const pedirRecuperacao = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin/redefinir` })
    if (!error) return null
    if (/rate limit|too many|seconds/i.test(error.message)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    if (/fetch|network/i.test(error.message)) return 'Sem conexão com o servidor. Tente novamente.'
    return 'Não foi possível enviar agora. Tente novamente em instantes.'
  }, [])

  const definirSenha = useCallback(async (senha: string) => {
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (!error) return null
    if (/same password|different from the old/i.test(error.message)) return 'A nova senha precisa ser diferente da atual.'
    if (/weak|at least|short/i.test(error.message)) return 'Senha fraca. Use ao menos 8 caracteres, com letras e números.'
    if (/session|not authenticated|jwt/i.test(error.message)) return 'O link expirou. Peça um novo em "Esqueci minha senha".'
    return 'Não foi possível salvar a nova senha agora. Tente novamente.'
  }, [])

  const definirEmail = useCallback(async (novoEmail: string) => {
    const { error } = await supabase.auth.updateUser({ email: novoEmail }, { emailRedirectTo: `${window.location.origin}/admin/login` })
    if (!error) return null
    if (/same email|different from the old/i.test(error.message)) return 'Esse já é o e-mail atual da conta.'
    if (/already registered|already exists|already been registered/i.test(error.message)) return 'Esse e-mail já está sendo usado por outra conta.'
    if (/rate limit|too many|seconds/i.test(error.message)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
    if (/fetch|network/i.test(error.message)) return 'Sem conexão com o servidor. Tente novamente.'
    return 'Não foi possível trocar o e-mail agora. Tente novamente.'
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(
    () => ({ carregando: !sessaoPronta || !adminPronto, sessao, admin, master, entrar, pedirRecuperacao, definirSenha, definirEmail, sair }),
    [sessaoPronta, adminPronto, sessao, admin, master, entrar, pedirRecuperacao, definirSenha, definirEmail, sair],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
