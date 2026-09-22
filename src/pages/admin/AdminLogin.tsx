import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CampoSenha } from '@/components/ui/campo-senha'
import { useAuth } from '@/lib/auth'
import { emailPorTelefone, normalizarIdentificador } from '@/lib/login'
import { NOME_LOJA } from '@/lib/utils'

export default function AdminLogin({ destino = '/admin', titulo = 'Painel administrativo' }: { destino?: string; titulo?: string }) {
  const { carregando, sessao, entrar } = useAuth()
  const local = useLocation()
  const [identificador, setIdentificador] = useState('')
  const [senha, setSenha] = useState('')
  const [erros, setErros] = useState<{ identificador?: string; senha?: string; geral?: string }>({})
  const [enviando, setEnviando] = useState(false)

  if (!carregando && sessao) {
    const para = (local.state as { de?: string } | null)?.de ?? destino
    return <Navigate to={para} replace />
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const id = normalizarIdentificador(identificador)
    if ('erro' in id || !senha) {
      setErros({ identificador: 'erro' in id ? id.erro : undefined, senha: senha ? undefined : 'Informe a senha' })
      return
    }
    setErros({})
    setEnviando(true)
    const email = id.tipo === 'email' ? id.email : await emailPorTelefone(id.telefone)
    if (!email) {
      setEnviando(false)
      const erro = 'E-mail (ou telefone) ou senha incorretos.'
      setErros({ geral: erro })
      toast.error(erro)
      return
    }
    const erro = await entrar(email, senha)
    setEnviando(false)
    if (erro) {
      setErros({ geral: erro })
      toast.error(erro)
    }
  }

  const cls = (erro?: string) =>
    `h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto ${erro ? 'border-red-800' : 'border-preto'}`

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <img
        src="/branding/hero.webp"
        alt={NOME_LOJA}
        width={1080}
        height={653}
        className="w-full rounded-2xl border-2 border-preto shadow-adesivo"
      />
      <form onSubmit={enviar} noValidate className="space-y-4 rounded-2xl border-2 border-preto bg-bege p-5 text-preto shadow-adesivo">
        <h1 className="text-3xl">{titulo}</h1>
        <div>
          <label htmlFor="identificador" className="mb-1 block text-sm font-extrabold">
            E-mail ou telefone
          </label>
          <input
            id="identificador"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            aria-invalid={!!erros.identificador}
            aria-describedby={erros.identificador ? 'identificador-erro' : undefined}
            placeholder="seu@email.com ou (21) 99999-8888"
            className={cls(erros.identificador)}
          />
          {erros.identificador && (
            <p id="identificador-erro" role="alert" className="mt-1 text-xs font-bold text-red-800">
              {erros.identificador}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="senha" className="mb-1 block text-sm font-extrabold">
            Senha
          </label>
          <CampoSenha id="senha" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} aria-invalid={!!erros.senha} className={cls(erros.senha)} />
          {erros.senha && (
            <p role="alert" className="mt-1 text-xs font-bold text-red-800">
              {erros.senha}
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
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Entrando…
            </>
          ) : (
            'Entrar'
          )}
        </Button>
        <p className="text-center text-sm">
          <Link to="/admin/esqueci" className="font-bold underline underline-offset-2">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </div>
  )
}
