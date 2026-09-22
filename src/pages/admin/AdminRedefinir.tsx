import { CheckCircle2, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { novaSenhaSchema } from '@/lib/schemas'
import { NOME_LOJA } from '@/lib/utils'

/** Página aberta pelo link do e-mail de recuperação: o Supabase já cria uma sessão temporária a partir do link. */
export default function AdminRedefinir() {
  const { carregando, sessao, definirSenha } = useAuth()
  const navegar = useNavigate()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erros, setErros] = useState<{ senha?: string; confirmar?: string; geral?: string }>({})
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = novaSenhaSchema.safeParse({ senha, confirmar })
    if (!r.success) {
      const novos: typeof erros = {}
      for (const i of r.error.issues) novos[i.path[0] as 'senha' | 'confirmar'] ??= i.message
      return setErros(novos)
    }
    setErros({})
    setEnviando(true)
    const falha = await definirSenha(r.data.senha)
    setEnviando(false)
    if (falha) {
      setErros({ geral: falha })
      return toast.error(falha)
    }
    setPronto(true)
    toast.success('Senha alterada!')
    setTimeout(() => navegar('/admin', { replace: true }), 1500)
  }

  const cls = (erro?: string) =>
    `h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto ${erro ? 'border-red-800' : 'border-preto'}`

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <img src="/branding/hero.webp" alt={NOME_LOJA} width={1080} height={653} className="w-full rounded-2xl border-2 border-preto shadow-adesivo" />
      <div className="space-y-4 rounded-2xl border-2 border-preto bg-bege p-5 text-preto shadow-adesivo">
        <h1 className="text-3xl">Nova senha</h1>

        {carregando ? (
          <div className="shimmer h-24 rounded-xl border-2 border-preto" role="status" aria-label="Verificando o link" />
        ) : pronto ? (
          <div role="status" className="flex items-center gap-2 text-sm font-bold">
            <CheckCircle2 className="h-6 w-6 text-verde" aria-hidden /> Senha alterada. Entrando no painel…
          </div>
        ) : !sessao ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm font-bold">Este link é inválido ou expirou.</p>
            <p className="text-sm">Peça um novo link em “Esqueci minha senha”.</p>
            <Link to="/admin/esqueci" className="inline-flex h-11 items-center rounded-lg border-2 border-preto bg-ambar px-4 text-sm font-bold shadow-adesivo-sm">
              Pedir novo link
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate className="space-y-4">
            <div>
              <label htmlFor="nova-senha" className="mb-1 block text-sm font-extrabold">
                Nova senha
              </label>
              <input id="nova-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => { setSenha(e.target.value); setErros({}) }} aria-invalid={!!erros.senha} className={cls(erros.senha)} />
              <p className={erros.senha ? 'mt-1 text-xs font-bold text-red-800' : 'mt-1 text-xs text-preto/70'} role={erros.senha ? 'alert' : undefined}>
                {erros.senha ?? 'Mínimo de 8 caracteres, com letras e números.'}
              </p>
            </div>
            <div>
              <label htmlFor="confirmar-senha" className="mb-1 block text-sm font-extrabold">
                Repita a nova senha
              </label>
              <input id="confirmar-senha" type="password" autoComplete="new-password" value={confirmar} onChange={(e) => { setConfirmar(e.target.value); setErros({}) }} aria-invalid={!!erros.confirmar} className={cls(erros.confirmar)} />
              {erros.confirmar && (
                <p role="alert" className="mt-1 text-xs font-bold text-red-800">
                  {erros.confirmar}
                </p>
              )}
            </div>
            {erros.geral && (
              <p role="alert" className="rounded-lg border-2 border-red-800 bg-red-800/10 p-2 text-sm font-bold text-red-900">
                {erros.geral}
              </p>
            )}
            <Button type="submit" disabled={enviando} className="h-12 w-full text-base">
              {enviando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Salvando…
                </>
              ) : (
                'Salvar nova senha'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
