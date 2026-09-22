import { Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/useCatalogo'
import { useSalvarConfig } from '@/hooks/useAdmin'
import { configSchema } from '@/lib/schemas'
import { cn } from '@/lib/utils'

const inputCls = (erro?: string) =>
  cn('h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto', erro ? 'border-red-800' : 'border-preto')

export default function Configuracoes() {
  const config = useConfig()
  const salvar = useSalvarConfig()
  const [f, setF] = useState({ nome_loja: '', whatsapp_numero: '', taxa_entrega: '' })
  const [erros, setErros] = useState<Partial<Record<keyof typeof f, string>>>({})

  useEffect(() => {
    if (config.data) {
      setF({
        nome_loja: config.data.nome_loja ?? '',
        whatsapp_numero: config.data.whatsapp_numero ?? '',
        taxa_entrega: (config.data.taxa_entrega ?? '0').replace('.', ','),
      })
    }
  }, [config.data])

  function enviar(e: FormEvent) {
    e.preventDefault()
    const r = configSchema.safeParse(f)
    if (!r.success) {
      const novos: typeof erros = {}
      for (const i of r.error.issues) novos[i.path[0] as keyof typeof f] ??= i.message
      setErros(novos)
      toast.error('Confira os campos destacados.')
      return
    }
    setErros({})
    salvar.mutate(
      { nome_loja: r.data.nome_loja, whatsapp_numero: r.data.whatsapp_numero, taxa_entrega: String(r.data.taxa_entrega) },
      {
        onSuccess: () => toast.success('Configurações salvas'),
        onError: (err) => toast.error(`Não foi possível salvar: ${err.message}`),
      },
    )
  }

  if (config.isError) return <ErrorState onRetry={() => config.refetch()} />

  const campo = (k: keyof typeof f, label: string, dica: string, extra?: object) => (
    <div>
      <label htmlFor={`c-${k}`} className="mb-1 block text-sm font-extrabold">{label}</label>
      <input
        id={`c-${k}`}
        value={f[k]}
        onChange={(e) => { setF((s) => ({ ...s, [k]: e.target.value })); setErros((s) => ({ ...s, [k]: undefined })) }}
        aria-invalid={!!erros[k]}
        aria-describedby={`c-${k}-dica`}
        className={inputCls(erros[k])}
        {...extra}
      />
      <p id={`c-${k}-dica`} className={cn('mt-1 text-xs', erros[k] ? 'font-bold text-red-800' : 'text-preto/70')} role={erros[k] ? 'alert' : undefined}>
        {erros[k] ?? dica}
      </p>
    </div>
  )

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-3xl">Configurações da loja</h1>
      {config.isPending ? (
        <div className="shimmer h-64 rounded-xl border-2 border-preto" aria-busy="true" />
      ) : (
        <form onSubmit={enviar} noValidate className="space-y-4 rounded-xl border-2 border-preto bg-bege p-4 text-preto shadow-adesivo">
          {campo('nome_loja', 'Nome da loja', 'Aparece no site e na mensagem do WhatsApp.')}
          {campo('whatsapp_numero', 'WhatsApp da loja', 'Com DDI e DDD, só números. Ex.: 5521999999999. É para onde os pedidos são enviados.', { inputMode: 'numeric', placeholder: '5521999999999' })}
          {campo('taxa_entrega', 'Taxa de entrega (R$)', 'Deixe 0 para "a combinar com o cliente" (o carrinho e o WhatsApp avisam). Se informar um valor, ele é somado ao total de todo pedido.', { inputMode: 'decimal', placeholder: '0,00' })}
          <Button type="submit" disabled={salvar.isPending} className="h-12 w-full text-base">
            {salvar.isPending ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Salvando…</> : 'Salvar configurações'}
          </Button>
        </form>
      )}
    </div>
  )
}
