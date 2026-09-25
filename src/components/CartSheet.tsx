import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useConfig } from '@/hooks/useCatalogo'
import { usePedidosPausados } from '@/hooks/useLicenca'
import { useCart } from '@/lib/cart'
import { buscarCep } from '@/lib/cep'
import { calcularFrete, lerTabelaFrete, type Frete } from '@/lib/frete'
import { criarPedido, PedidoError } from '@/lib/pedido'
import { apenasDigitos, checkoutSchema, enderecoCompleto, FORMAS_PAGAMENTO, mascararCep, mascararTelefone, parseValor, type CheckoutInput } from '@/lib/schemas'
import { cn, FATOR_CARTAO, formatBRL, UNIDADE_LABEL } from '@/lib/utils'

const CLIENTE_KEY = 'pqd_cliente_v1'

function lerCliente(): Partial<CheckoutInput> {
  try {
    const raw = localStorage.getItem(CLIENTE_KEY)
    const o = raw ? JSON.parse(raw) : {}
    return { nome: String(o.nome ?? ''), telefone: String(o.telefone ?? ''), endereco: String(o.endereco ?? ''), numero: String(o.numero ?? ''), bairro: String(o.bairro ?? ''), cidade: String(o.cidade ?? ''), complemento: String(o.complemento ?? ''), cep: String(o.cep ?? '') }
  } catch {
    return {}
  }
}

function salvarCliente(d: { nome: string; telefone: string; endereco: string; numero: string; bairro: string; cidade: string; complemento?: string; cep: string }) {
  try {
    localStorage.setItem(CLIENTE_KEY, JSON.stringify(d))
  } catch {
    /* sem armazenamento: cliente digita de novo na próxima vez */
  }
}

type Etapa = 'itens' | 'dados' | 'ok'
type Erros = Partial<Record<keyof CheckoutInput, string>>

function Campo({ id, label, erro, children }: { id: string; label: string; erro?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-extrabold">
        {label}
      </label>
      {children}
      {erro && (
        <p id={`${id}-erro`} role="alert" className="mt-1 text-xs font-bold text-red-800">
          {erro}
        </p>
      )}
    </div>
  )
}

const inputCls = (erro?: string) =>
  cn(
    'h-11 w-full rounded-lg border-2 bg-white px-3 text-sm font-semibold text-preto placeholder:text-preto/70',
    erro ? 'border-red-800' : 'border-preto',
  )

export function CartSheet() {
  const { aberto, fechar, itens, subtotal, alterar, remover, limpar } = useCart()
  const config = useConfig()
  const pausados = usePedidosPausados()
  const taxaConfig = Number(config.data?.taxa_entrega ?? 0) || 0
  const tabelaFrete = useMemo(() => lerTabelaFrete(config.data), [config.data])

  const [etapa, setEtapa] = useState<Etapa>('itens')
  const [enviando, setEnviando] = useState(false)
  const [erros, setErros] = useState<Erros>({})
  const [form, setForm] = useState<CheckoutInput>(() => ({
    nome: '',
    telefone: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    complemento: '',
    cep: '',
    forma_pagamento: undefined as unknown as CheckoutInput['forma_pagamento'],
    troco_para: '',
    observacoes: '',
    ...lerCliente(),
  }))
  // Frete por km (n8n): 'calculando' | Frete (ok) | 'combinar' (endereço não achado ou serviço fora)
  const [frete, setFrete] = useState<'idle' | 'calculando' | 'combinar' | Frete>('idle')
  const seq = useRef(0)
  const taxa = typeof frete === 'object' ? frete.taxa : taxaConfig
  const aVista = form.forma_pagamento === 'pix' || form.forma_pagamento === 'dinheiro'
  const desconto = aVista ? Math.round((subtotal - subtotal / FATOR_CARTAO) * 100) / 100 : 0
  const total = subtotal - desconto + (itens.length ? taxa : 0)
  // Endereço lembrado do último pedido: mostra resumo com botão "Alterar endereço" em vez dos campos.
  const [resumoEndereco, setResumoEndereco] = useState(() => {
    const c = lerCliente()
    return !!c.endereco && c.endereco.trim().length >= 3 && !!c.bairro && !!c.cidade && !!c.numero && apenasDigitos(c.cep ?? '').length === 8
  })
  // CEP primeiro: 'idle' (só o CEP) | 'buscando' | 'ok' (rua/bairro/cidade vieram do CEP: só falta o número) | 'manual' (digitar tudo)
  const [cepModo, setCepModo] = useState<'idle' | 'buscando' | 'ok' | 'manual'>('idle')
  const [cepAviso, setCepAviso] = useState('')
  // CEP já preenchido (dados antigos ou salvos) sem busca feita: mostra todos os campos para conferir
  const modoCep = cepModo === 'idle' && apenasDigitos(form.cep).length === 8 ? 'manual' : cepModo
  const [confirmado, setConfirmado] = useState<{ numero: number } | null>(null)

  const set = <K extends keyof CheckoutInput>(k: K, v: CheckoutInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErros((e) => ({ ...e, [k]: undefined }))
  }

  const temErroEndereco = !!(erros.endereco || erros.numero || erros.bairro || erros.cep || erros.complemento)
  const enderecoPronto = form.endereco.trim().length >= 3 && form.bairro.trim().length >= 2 && form.cidade.trim().length >= 2 && form.numero.trim().length > 0 && apenasDigitos(form.cep).length === 8

  useEffect(() => {
    if (etapa !== 'dados' || !enderecoPronto) {
      setFrete('idle')
      return
    }
    const minha = ++seq.current
    setFrete('calculando')
    const t = setTimeout(async () => {
      const r = await calcularFrete({ endereco: form.endereco.trim(), numero: form.numero.trim(), bairro: form.bairro.trim(), cidade: form.cidade.trim(), cep: apenasDigitos(form.cep) }, tabelaFrete)
      if (seq.current === minha) setFrete(r ?? 'combinar')
    }, 900)
    return () => clearTimeout(t)
  }, [etapa, enderecoPronto, form.endereco, form.numero, form.bairro, form.cidade, form.cep, tabelaFrete])

  const temEnderecoPreenchido = !!(form.endereco || form.numero || form.bairro || form.cidade || form.complemento || form.cep)

  /** Limpa os campos de endereço para o cliente digitar outro (não mexe em nome, telefone e pagamento). */
  function usarOutroEndereco() {
    setForm((f) => ({ ...f, endereco: '', numero: '', bairro: '', cidade: '', complemento: '', cep: '' }))
    setErros((e) => ({ ...e, endereco: undefined, numero: undefined, bairro: undefined, cidade: undefined, complemento: undefined, cep: undefined }))
    setResumoEndereco(false)
    setCepModo('idle')
    setTimeout(() => document.getElementById('cep')?.focus(), 0)
  }

  async function aoDigitarCep(valor: string) {
    const mascarado = mascararCep(valor)
    set('cep', mascarado)
    const d = apenasDigitos(mascarado)
    if (d.length < 8) {
      setCepModo('idle')
      setCepAviso('')
      return
    }
    setCepModo('buscando')
    setCepAviso('')
    const r = await buscarCep(d)
    if (typeof r === 'object') {
      if (r.rua) {
        setForm((f) => ({ ...f, endereco: r.rua, bairro: r.bairro || f.bairro, cidade: r.cidade || f.cidade }))
        setErros((e) => ({ ...e, endereco: undefined, bairro: undefined, cidade: undefined, cep: undefined }))
        setCepModo('ok')
      } else {
        // CEP geral da cidade/bairro: sem rua, o cliente completa
        setForm((f) => ({ ...f, endereco: '', bairro: r.bairro || f.bairro, cidade: r.cidade || f.cidade }))
        setCepAviso('Esse CEP não tem rua definida. Digite a rua abaixo.')
        setCepModo('manual')
      }
    } else {
      setCepAviso(r === 'nao_encontrado' ? 'CEP não encontrado. Confira os números ou digite o endereço.' : 'Não consegui buscar o CEP agora. Digite o endereço.')
      setCepModo('manual')
    }
  }

  function aoMudarAberto(open: boolean) {
    if (open) return
    fechar()
    if (etapa === 'ok') {
      setEtapa('itens')
      setConfirmado(null)
    }
  }

  async function finalizar(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    if (pausados) {
      toast.error('Estamos sem receber novos pedidos no momento. Seu carrinho foi mantido.')
      return
    }

    const r = checkoutSchema.safeParse(form)
    if (!r.success) {
      const novos: Erros = {}
      for (const issue of r.error.issues) {
        const campo = issue.path[0] as keyof CheckoutInput
        novos[campo] ??= issue.message
      }
      setErros(novos)
      toast.error('Confira os campos destacados.')
      // espera o React aplicar aria-invalid antes de focar o primeiro campo com erro
      setTimeout(() => {
        const el = document.getElementById('checkout-form')?.querySelector<HTMLElement>('[aria-invalid="true"]')
        el?.focus()
        el?.scrollIntoView({ block: 'center' })
      }, 0)
      return
    }
    const dados = r.data

    if (dados.forma_pagamento === 'dinheiro' && dados.troco_para && parseValor(dados.troco_para) < total) {
      setErros({ troco_para: `O troco deve ser para um valor maior ou igual a ${formatBRL(total)}` })
      return
    }

    if (frete === 'calculando') {
      toast.info('Calculando a entrega… aguarde um instante.')
      return
    }

    setEnviando(true)
    try {
      const freteOk = typeof frete === 'object' ? frete : null
      const pedido = await criarPedido(dados, itens, freteOk)
      salvarCliente({ nome: dados.nome, telefone: form.telefone, endereco: dados.endereco, numero: dados.numero, bairro: dados.bairro, cidade: dados.cidade, complemento: dados.complemento, cep: form.cep })
      limpar()
      setConfirmado({ numero: pedido.numeroDiario })
      setEtapa('ok')
    } catch (err) {
      toast.error(err instanceof PedidoError ? err.message : 'Erro inesperado. Seu carrinho foi mantido; tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Sheet open={aberto} onOpenChange={aoMudarAberto}>
      <SheetContent aria-describedby="carrinho-desc">
        <div className="flex items-center gap-2 border-b-2 border-preto bg-verde-escuro px-4 py-3 text-bege">
          {etapa === 'dados' && (
            <button onClick={() => setEtapa('itens')} aria-label="Voltar para os itens" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          <SheetTitle className="font-titulo text-2xl leading-none">
            {etapa === 'itens' ? 'Seu pedido' : etapa === 'dados' ? 'Seus dados' : 'Pedido enviado'}
          </SheetTitle>
          <SheetClose aria-label="Fechar carrinho" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
            <X className="h-5 w-5" aria-hidden />
          </SheetClose>
        </div>
        <SheetDescription id="carrinho-desc" className="sr-only">
          Revise os itens, informe seus dados e finalize o pedido.
        </SheetDescription>

        {etapa === 'ok' && confirmado ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-verde" aria-hidden />
            <p className="font-titulo text-3xl">Pedido #{confirmado.numero} registrado!</p>
            <p className="text-sm">Recebemos o seu pedido e já vamos separá-lo. Guarde o número acima para qualquer dúvida.</p>
            <Button variant="outline" className="w-full" onClick={() => aoMudarAberto(false)}>
              Voltar ao catálogo
            </Button>
          </div>
        ) : itens.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <ShoppingCart className="h-12 w-12 text-verde/60" aria-hidden />
            <p className="font-titulo text-3xl">Carrinho vazio</p>
            <p className="text-sm">Adicione produtos do catálogo para montar seu pedido.</p>
            <Button onClick={fechar}>Ver catálogo</Button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {etapa === 'itens' ? (
                <ul className="divide-y-2 divide-preto/15 px-4">
                  {itens.map((i) => (
                    <li key={i.produtoId} className="flex gap-3 py-3">
                      <ProductImage legenda={false} src={i.imagemUrl} alt={i.nome} className="h-16 w-16 shrink-0 rounded-lg border-2 border-preto" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold leading-tight">{i.nome}</p>
                        <p className="text-xs text-preto/70">
                          {formatBRL(i.preco)} / {UNIDADE_LABEL[i.unidade]}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="flex items-center rounded-lg border-2 border-preto bg-white">
                            <button onClick={() => alterar(i.produtoId, -1)} aria-label={`Diminuir ${i.nome}`} className="flex h-8 w-8 items-center justify-center">
                              <Minus className="h-4 w-4" aria-hidden />
                            </button>
                            <span className="min-w-7 text-center text-sm font-extrabold" aria-live="polite">
                              {i.quantidade}
                            </span>
                            <button onClick={() => alterar(i.produtoId, 1)} aria-label={`Aumentar ${i.nome}`} className="flex h-8 w-8 items-center justify-center">
                              <Plus className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                          <button onClick={() => remover(i.produtoId)} aria-label={`Remover ${i.nome}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-800 hover:bg-red-800/10">
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                          <span className="ml-auto text-sm font-extrabold">{formatBRL(i.quantidade * i.preco)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <form id="checkout-form" onSubmit={finalizar} noValidate className="space-y-4 p-4">
                  <Campo id="nome" label="Nome" erro={erros.nome}>
                    <input id="nome" autoComplete="name" value={form.nome} onChange={(e) => set('nome', e.target.value)} aria-invalid={!!erros.nome} aria-describedby={erros.nome ? 'nome-erro' : undefined} className={inputCls(erros.nome)} placeholder="Seu nome" />
                  </Campo>
                  <Campo id="telefone" label="Telefone (WhatsApp)" erro={erros.telefone}>
                    <input id="telefone" type="tel" inputMode="tel" autoComplete="tel-national" value={form.telefone} onChange={(e) => set('telefone', mascararTelefone(e.target.value))} aria-invalid={!!erros.telefone} aria-describedby={erros.telefone ? 'telefone-erro' : undefined} className={inputCls(erros.telefone)} placeholder="(21) 99999-8888" />
                  </Campo>
                  {resumoEndereco && !temErroEndereco ? (
                    <div className="rounded-lg border-2 border-preto bg-white p-3 text-sm">
                      <p className="font-extrabold">Entregar em:</p>
                      <p>{enderecoCompleto({ endereco: form.endereco, numero: form.numero, bairro: form.bairro, cidade: form.cidade, complemento: form.complemento, cep: form.cep })}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setResumoEndereco(false); setCepModo('manual') }} className="rounded-lg border-2 border-preto bg-bege px-3 py-1.5 text-xs font-extrabold">
                          Alterar endereço
                        </button>
                        <button type="button" onClick={usarOutroEndereco} className="rounded-lg border-2 border-preto bg-ambar px-3 py-1.5 text-xs font-extrabold">
                          Usar outro endereço
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {temEnderecoPreenchido && (
                        <button type="button" onClick={usarOutroEndereco} className="rounded-lg border-2 border-preto bg-ambar px-3 py-1.5 text-xs font-extrabold">
                          Usar outro endereço
                        </button>
                      )}
                      <Campo id="cep" label="CEP" erro={erros.cep}>
                        <input id="cep" inputMode="numeric" autoComplete="postal-code" value={form.cep} onChange={(e) => void aoDigitarCep(e.target.value)} aria-invalid={!!erros.cep} aria-describedby={erros.cep ? 'cep-erro' : undefined} className={inputCls(erros.cep)} placeholder="Digite o CEP, ex.: 21725-030" />
                      </Campo>
                      {modoCep === 'buscando' && (
                        <p className="-mt-2 flex items-center gap-2 text-xs font-bold" role="status">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando o endereço…
                        </p>
                      )}
                      {cepAviso && <p className="-mt-2 text-xs font-bold text-red-800" role="status">{cepAviso}</p>}

                      {modoCep === 'ok' && (
                        <div className="rounded-lg border-2 border-preto bg-white p-3 text-sm">
                          <p className="font-extrabold">{form.endereco}</p>
                          <p>{form.bairro} · {form.cidade}</p>
                          <button type="button" onClick={() => setCepModo('manual')} className="mt-1 text-xs font-bold underline">
                            Corrigir endereço
                          </button>
                        </div>
                      )}

                      {modoCep === 'manual' && (
                        <>
                          <Campo id="endereco" label="Rua" erro={erros.endereco}>
                            <input id="endereco" autoComplete="street-address" value={form.endereco} onChange={(e) => set('endereco', e.target.value)} aria-invalid={!!erros.endereco} aria-describedby={erros.endereco ? 'endereco-erro' : undefined} className={inputCls(erros.endereco)} placeholder="Ex.: Rua Piraquara" />
                          </Campo>
                          <div className="grid grid-cols-2 gap-3">
                            <Campo id="bairro" label="Bairro" erro={erros.bairro}>
                              <input id="bairro" autoComplete="address-level3" value={form.bairro} onChange={(e) => set('bairro', e.target.value)} aria-invalid={!!erros.bairro} aria-describedby={erros.bairro ? 'bairro-erro' : undefined} className={inputCls(erros.bairro)} placeholder="Ex.: Realengo" />
                            </Campo>
                            <Campo id="cidade" label="Cidade" erro={erros.cidade}>
                              <input id="cidade" autoComplete="address-level2" value={form.cidade} onChange={(e) => set('cidade', e.target.value)} aria-invalid={!!erros.cidade} aria-describedby={erros.cidade ? 'cidade-erro' : undefined} className={inputCls(erros.cidade)} placeholder="Ex.: Rio de Janeiro" />
                            </Campo>
                          </div>
                        </>
                      )}

                      {(modoCep === 'ok' || modoCep === 'manual') && (
                        <div className="grid grid-cols-2 gap-3">
                          <Campo id="numero" label="Número" erro={erros.numero}>
                            <input id="numero" inputMode="numeric" autoComplete="off" value={form.numero} onChange={(e) => set('numero', e.target.value)} aria-invalid={!!erros.numero} aria-describedby={erros.numero ? 'numero-erro' : undefined} className={inputCls(erros.numero)} placeholder="Ex.: 100" />
                          </Campo>
                          <Campo id="complemento" label="Complemento (opcional)" erro={erros.complemento}>
                            <input id="complemento" value={form.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} aria-invalid={!!erros.complemento} className={inputCls(erros.complemento)} placeholder="Ex.: casa 2" />
                          </Campo>
                        </div>
                      )}
                    </>
                  )}
                  {typeof frete === 'object' && (
                    <p className="-mt-2 text-xs text-preto/80">Distância aproximada até você: {frete.km.toFixed(1).replace('.', ',')} km</p>
                  )}

                  <fieldset>
                    <legend className="mb-1 text-sm font-extrabold">Forma de pagamento (obrigatória)</legend>
                    <p className="mb-2 rounded-lg border-2 border-preto bg-ambar px-3 py-2 text-center font-titulo text-xl leading-tight shadow-adesivo-sm">
                      Desconto de 10% no Dinheiro e Pix
                    </p>
                    <div className="grid grid-cols-3 gap-2" role="radiogroup" id="pagamento-grupo" tabIndex={-1} aria-invalid={!!erros.forma_pagamento} aria-label="Forma de pagamento">
                      {(Object.keys(FORMAS_PAGAMENTO) as (keyof typeof FORMAS_PAGAMENTO)[]).map((k) => (
                        <label
                          key={k}
                          className={cn(
                            'flex h-14 cursor-pointer items-center justify-center rounded-lg border-2 border-preto px-1 text-center text-xs font-extrabold leading-tight has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ambar',
                            form.forma_pagamento === k ? 'bg-ambar shadow-adesivo-sm' : 'bg-white',
                          )}
                        >
                          <input type="radio" name="pagamento" value={k} checked={form.forma_pagamento === k} onChange={() => set('forma_pagamento', k)} className="sr-only" />
                          {FORMAS_PAGAMENTO[k]}
                        </label>
                      ))}
                    </div>
                    {erros.forma_pagamento && (
                      <p role="alert" className="mt-1 text-xs font-bold text-red-800">
                        {erros.forma_pagamento}
                      </p>
                    )}
                  </fieldset>

                  {form.forma_pagamento === 'dinheiro' && (
                    <Campo id="troco" label="Troco para quanto? (opcional)" erro={erros.troco_para}>
                      <input id="troco" inputMode="decimal" value={form.troco_para ?? ''} onChange={(e) => set('troco_para', e.target.value)} aria-invalid={!!erros.troco_para} aria-describedby={erros.troco_para ? 'troco-erro' : undefined} className={inputCls(erros.troco_para)} placeholder="Ex.: 100" />
                    </Campo>
                  )}

                  <Campo id="obs" label="Observações (opcional)" erro={erros.observacoes}>
                    <textarea id="obs" rows={2} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} aria-invalid={!!erros.observacoes} className={cn(inputCls(erros.observacoes), 'h-auto py-2')} placeholder="Ex.: interfone quebrado, trazer gelo..." />
                  </Campo>
                </form>
              )}
            </div>

            <div className="space-y-2 border-t-2 border-preto bg-bege-escuro p-4">
              <dl className="space-y-0.5 text-sm">
                <div className="flex justify-between">
                  <dt>Subtotal</dt>
                  <dd className="font-bold">{formatBRL(subtotal)}</dd>
                </div>
                {desconto > 0 && (
                  <div className="flex justify-between text-verde">
                    <dt>Desconto Pix/dinheiro</dt>
                    <dd className="font-bold">-{formatBRL(desconto)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Entrega{typeof frete === 'object' ? ` (${frete.km.toFixed(1).replace('.', ',')} km)` : ''}</dt>
                  <dd className="font-bold">{frete === 'calculando' ? 'Calculando…' : taxa > 0 ? formatBRL(taxa) : 'A combinar'}</dd>
                </div>
                <div className="flex justify-between text-lg font-extrabold">
                  <dt>{taxa > 0 ? 'Total' : 'Total (sem entrega)'}</dt>
                  <dd>{formatBRL(total)}</dd>
                </div>
                {taxa === 0 && (
                  <p className="pt-1 text-xs text-preto/80">O valor da entrega é combinado com você pelo WhatsApp, conforme a distância.</p>
                )}
              </dl>
              {etapa === 'itens' ? (
                <Button className="h-12 w-full text-base" onClick={() => setEtapa('dados')}>
                  Continuar
                </Button>
              ) : (
                <Button type="submit" form="checkout-form" disabled={enviando || pausados} className="h-12 w-full text-base">
                  {enviando ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Enviando…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" aria-hidden /> Finalizar pedido
                    </>
                  )}
                </Button>
              )}
              {pausados && (
                <p role="alert" className="rounded-lg border-2 border-preto bg-ambar p-2 text-center text-xs font-extrabold">
                  Estamos sem receber novos pedidos no momento. Seu carrinho fica salvo: volte em breve!
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
