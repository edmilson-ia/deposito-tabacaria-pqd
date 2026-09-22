import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { CampoSenha } from '@/components/ui/campo-senha'
import { useAuth } from '@/lib/auth'
import { novaSenhaSchema } from '@/lib/schemas'

const emailSchema = z.string().trim().email('Informe um e-mail válido')

function CardEmail() {
  const { sessao, definirEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string>()
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = emailSchema.safeParse(email)
    if (!r.success) return setErro(r.error.issues[0].message)
    setErro(undefined)
    setEnviando(true)
    const falha = await definirEmail(r.data)
    setEnviando(false)
    if (falha) {
      setErro(falha)
      return toast.error(falha)
    }
    toast.success('Enviamos um link de confirmação para o novo e-mail.')
    setEmail('')
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-preto bg-bege p-5 text-preto shadow-adesivo">
      <h2 className="text-2xl">Trocar e-mail</h2>
      <p className="text-sm">
        E-mail atual: <strong>{sessao?.user.email}</strong>
      </p>
      <form onSubmit={enviar} noValidate className="space-y-3">
        <div>
          <label htmlFor="novo-email" className="mb-1 block text-sm font-extrabold">
            Novo e-mail
          </label>
          <input
            id="novo-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setErro(undefined)
            }}
            aria-invalid={!!erro}
            aria-describedby={erro ? 'novo-email-erro' : undefined}
            placeholder="novo@email.com"
            className={`h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto ${erro ? 'border-red-800' : 'border-preto'}`}
          />
          {erro && (
            <p id="novo-email-erro" role="alert" className="mt-1 text-xs font-bold text-red-800">
              {erro}
            </p>
          )}
        </div>
        <p className="text-xs text-preto/70">
          Você vai receber um link de confirmação nesse e-mail novo. O e-mail da conta só muda depois de você clicar no link. Se o login também for feito por
          telefone, ele continua funcionando normalmente — só passa a usar este e-mail novo para entrar e recuperar a senha.
        </p>
        <Button type="submit" disabled={enviando} className="h-11 w-full text-sm sm:w-auto">
          {enviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Enviando…
            </>
          ) : (
            'Enviar link de confirmação'
          )}
        </Button>
      </form>
    </div>
  )
}

function CardSenha() {
  const { definirSenha } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erros, setErros] = useState<{ senha?: string; confirmar?: string }>({})
  const [enviando, setEnviando] = useState(false)

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
    if (falha) return toast.error(falha)
    toast.success('Senha alterada!')
    setSenha('')
    setConfirmar('')
  }

  const cls = (erro?: string) =>
    `h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto ${erro ? 'border-red-800' : 'border-preto'}`

  return (
    <div className="space-y-4 rounded-2xl border-2 border-preto bg-bege p-5 text-preto shadow-adesivo">
      <h2 className="text-2xl">Trocar senha</h2>
      <form onSubmit={enviar} noValidate className="space-y-3">
        <div>
          <label htmlFor="conta-nova-senha" className="mb-1 block text-sm font-extrabold">
            Nova senha
          </label>
          <CampoSenha
            id="conta-nova-senha"
            autoComplete="new-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              setErros({})
            }}
            aria-invalid={!!erros.senha}
            className={cls(erros.senha)}
          />
          <p className={erros.senha ? 'mt-1 text-xs font-bold text-red-800' : 'mt-1 text-xs text-preto/70'} role={erros.senha ? 'alert' : undefined}>
            {erros.senha ?? 'Mínimo de 8 caracteres, com letras e números.'}
          </p>
        </div>
        <div>
          <label htmlFor="conta-confirmar-senha" className="mb-1 block text-sm font-extrabold">
            Repita a nova senha
          </label>
          <CampoSenha
            id="conta-confirmar-senha"
            autoComplete="new-password"
            value={confirmar}
            onChange={(e) => {
              setConfirmar(e.target.value)
              setErros({})
            }}
            aria-invalid={!!erros.confirmar}
            className={cls(erros.confirmar)}
          />
          {erros.confirmar && (
            <p role="alert" className="mt-1 text-xs font-bold text-red-800">
              {erros.confirmar}
            </p>
          )}
        </div>
        <Button type="submit" disabled={enviando} className="h-11 w-full text-sm sm:w-auto">
          {enviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Salvando…
            </>
          ) : (
            'Salvar nova senha'
          )}
        </Button>
      </form>
    </div>
  )
}

export default function AdminConta() {
  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <h1 className="text-3xl">Minha conta</h1>
      <CardEmail />
      <CardSenha />
    </div>
  )
}
