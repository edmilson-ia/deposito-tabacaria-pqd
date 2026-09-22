import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { NOME_LOJA } from '@/lib/utils'

const emailSchema = z.string().trim().email('Informe um e-mail válido')

export default function AdminEsqueci() {
  const { pedirRecuperacao } = useAuth()
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string>()
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const r = emailSchema.safeParse(email)
    if (!r.success) return setErro(r.error.issues[0].message)
    setErro(undefined)
    setEnviando(true)
    const falha = await pedirRecuperacao(r.data)
    setEnviando(false)
    if (falha) return setErro(falha)
    setEnviado(true)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <img src="/branding/hero.webp" alt={NOME_LOJA} width={1080} height={653} className="w-full rounded-2xl border-2 border-preto shadow-adesivo" />
      <div className="space-y-4 rounded-2xl border-2 border-preto bg-bege p-5 text-preto shadow-adesivo">
        <h1 className="text-3xl">Esqueci minha senha</h1>
        {enviado ? (
          <div role="status" className="space-y-3">
            <MailCheck className="h-10 w-10 text-verde" aria-hidden />
            <p className="text-sm">
              Se <strong>{email.trim()}</strong> for o e-mail de um administrador, enviamos um link para criar uma nova senha. Confira também a caixa de spam. O link vale por pouco tempo.
            </p>
            <p className="rounded-lg border-2 border-preto bg-white/70 p-2 text-xs font-bold">
              Abra o link no <u>mesmo navegador e aparelho</u> em que você pediu; em outro, ele não funciona.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate className="space-y-4">
            <p className="text-sm">Informe o e-mail da sua conta. Você receberá um link para criar uma nova senha.</p>
            <div>
              <label htmlFor="esqueci-email" className="mb-1 block text-sm font-extrabold">
                E-mail
              </label>
              <input
                id="esqueci-email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setErro(undefined)
                }}
                aria-invalid={!!erro}
                aria-describedby={erro ? 'esqueci-erro' : undefined}
                placeholder="seu@email.com"
                className={`h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto ${erro ? 'border-red-800' : 'border-preto'}`}
              />
              {erro && (
                <p id="esqueci-erro" role="alert" className="mt-1 text-xs font-bold text-red-800">
                  {erro}
                </p>
              )}
            </div>
            <Button type="submit" disabled={enviando} className="h-12 w-full text-base">
              {enviando ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Enviando…
                </>
              ) : (
                'Enviar link'
              )}
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link to="/admin/login" className="inline-flex items-center gap-1 font-bold underline underline-offset-2">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
