import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/useCatalogo'
import { useSalvarConfig } from '@/hooks/useAdmin'
import { calcularTaxa, lerTabelaFrete, validarTabelaFrete } from '@/lib/frete'
import { configSchema } from '@/lib/schemas'
import { cn, formatBRL } from '@/lib/utils'

const inputCls = (erro?: string) =>
  cn('h-12 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto', erro ? 'border-red-800' : 'border-preto')

export default function Configuracoes() {
  const config = useConfig()
  const salvar = useSalvarConfig()
  const [f, setF] = useState({ nome_loja: '', whatsapp_numero: '', taxa_entrega: '', grupo_promocao_url: '' })
  const [erros, setErros] = useState<Partial<Record<keyof typeof f, string>>>({})
  // Tabela de frete por distância (a loja edita aqui; o n8n só informa os km)
  const [faixas, setFaixas] = useState<{ ate: string; valor: string }[]>([])
  const [kmExtra, setKmExtra] = useState('1')
  const [erroFrete, setErroFrete] = useState('')

  useEffect(() => {
    if (config.data) {
      setF({
        nome_loja: config.data.nome_loja ?? '',
        whatsapp_numero: config.data.whatsapp_numero ?? '',
        taxa_entrega: (config.data.taxa_entrega ?? '0').replace('.', ','),
        grupo_promocao_url: config.data.grupo_promocao_url ?? '',
      })
      const t = lerTabelaFrete(config.data)
      setFaixas(t.faixas.map((x) => ({ ate: String(x.ate).replace('.', ','), valor: x.valor.toFixed(2).replace('.', ',') })))
      setKmExtra(String(t.kmExtra).replace('.', ','))
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
    const frete = validarTabelaFrete(faixas, kmExtra)
    if (!frete.ok) {
      setErroFrete(frete.erro)
      toast.error(frete.erro)
      return
    }
    setErros({})
    setErroFrete('')
    salvar.mutate(
      {
        frete_faixas: JSON.stringify(frete.tabela.faixas),
        frete_km_extra: String(frete.tabela.kmExtra),
        nome_loja: r.data.nome_loja,
        whatsapp_numero: r.data.whatsapp_numero,
        taxa_entrega: String(r.data.taxa_entrega),
        grupo_promocao_url: r.data.grupo_promocao_url,
      },
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
          {campo('taxa_entrega', 'Taxa de entrega (R$)', 'Usada só quando o cálculo por distância não funciona (endereço não encontrado). Deixe 0 para "a combinar com o cliente".', { inputMode: 'decimal', placeholder: '0,00' })}
          {campo('grupo_promocao_url', 'Link do grupo de promoção (WhatsApp)', 'Cole aqui o link de convite do grupo. Deixe em branco para o botão "Promoção" não aparecer na tela inicial.', { placeholder: 'https://chat.whatsapp.com/...' })}
          <fieldset className="space-y-2 rounded-lg border-2 border-preto bg-white p-3">
            <legend className="px-1 text-sm font-extrabold">Taxa de entrega por distância</legend>
            <p className="text-xs text-preto/80">
              O aplicativo calcula a distância de carro até o cliente e cobra pela faixa. Ex.: “até 3 km = R$ 5,00”. Depois da última faixa, soma-se o valor por km extra.
            </p>
            {faixas.map((fx, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor={`fx-ate-${i}`} className="text-xs font-bold">Até (km)</label>
                  <input id={`fx-ate-${i}`} inputMode="decimal" value={fx.ate} onChange={(e) => setFaixas((l) => l.map((x, j) => (j === i ? { ...x, ate: e.target.value } : x)))} className={inputCls()} placeholder="3" />
                </div>
                <div className="flex-1">
                  <label htmlFor={`fx-valor-${i}`} className="text-xs font-bold">Valor (R$)</label>
                  <input id={`fx-valor-${i}`} inputMode="decimal" value={fx.valor} onChange={(e) => setFaixas((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} className={inputCls()} placeholder="5,00" />
                </div>
                <button type="button" onClick={() => setFaixas((l) => l.filter((_, j) => j !== i))} aria-label={`Remover faixa ${i + 1}`} disabled={faixas.length <= 1} className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-preto bg-bege disabled:opacity-40">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setFaixas((l) => [...l, { ate: '', valor: '' }])} disabled={faixas.length >= 10} className="inline-flex items-center gap-1 rounded-lg border-2 border-preto bg-bege px-3 py-1.5 text-xs font-extrabold disabled:opacity-40">
              <Plus className="h-4 w-4" aria-hidden /> Adicionar faixa
            </button>
            <div>
              <label htmlFor="fx-extra" className="text-xs font-bold">Depois da última faixa, somar por km inteiro (R$)</label>
              <input id="fx-extra" inputMode="decimal" value={kmExtra} onChange={(e) => setKmExtra(e.target.value)} className={inputCls()} placeholder="1,00" />
            </div>
            {erroFrete && <p role="alert" className="text-xs font-bold text-red-800">{erroFrete}</p>}
            {(() => {
              const v = validarTabelaFrete(faixas, kmExtra)
              if (!v.ok) return null
              const ex = [2, 3.5, 6, 9.4]
              return (
                <p className="text-xs text-preto/80">
                  Exemplos: {ex.map((km) => `${String(km).replace('.', ',')} km = ${formatBRL(calcularTaxa(km, v.tabela))}`).join(' · ')}
                </p>
              )
            })()}
          </fieldset>
          <Button type="submit" disabled={salvar.isPending} className="h-12 w-full text-base">
            {salvar.isPending ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Salvando…</> : 'Salvar configurações'}
          </Button>
        </form>
      )}

      <details className="rounded-xl border-2 border-preto bg-bege p-4 text-sm text-preto shadow-adesivo">
        <summary className="cursor-pointer font-extrabold">Como trocar a impressora dos pedidos</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5">
          <li>Instale a impressora nova no computador da loja (driver do fabricante) e imprima uma página de teste.</li>
          <li>Abra as Configurações do Windows → Impressoras e scanners. Desligue <b>“Permitir que o Windows gerencie minha impressora padrão”</b>.</li>
          <li>Clique na impressora nova → <b>Gerenciar → Definir como padrão</b>.</li>
          <li>Feche a janela do painel de pedidos e abra de novo pelo atalho (pasta de Inicialização do Windows).</li>
          <li>Faça um pedido de teste e confira se o talão saiu na impressora nova.</li>
        </ol>
        <p className="mt-3 font-extrabold">Impressora térmica de 80 mm</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Nas preferências da impressora, escolha papel de <b>80 mm contínuo</b> (rolo).</li>
          <li>Se ela tiver guilhotina, ative “cortar ao final do documento”.</li>
          <li>O talão já cabe em 80 mm e em folha A4: não precisa mudar nada no site.</li>
        </ul>
        <p className="mt-3 text-xs text-preto/70">
          A impressão automática só funciona com a janela do painel de pedidos aberta no computador da loja e a caixa “Imprimir pedidos novos automaticamente” marcada.
        </p>
      </details>
    </div>
  )
}
