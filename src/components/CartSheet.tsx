import { ArrowLeft, CheckCircle2, Loader2, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ProductImage } from '@/components/ProductImage'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { WhatsAppIcon } from '@/components/WhatsAppIcon'
import { useConfig } from '@/hooks/useCatalogo'
import { usePedidosPausados } from '@/hooks/useLicenca'
import { useCart } from '@/lib/cart'
import { criarPedido, PedidoError } from '@/lib/pedido'
import { checkoutSchema, FORMAS_PAGAMENTO, mascararTelefone, parseValor, type CheckoutInput } from '@/lib/schemas'
import { cn, formatBRL, UNIDADE_LABEL } from '@/lib/utils'
import { montarMensagem, urlWhatsapp } from '@/lib/whatsapp'

const CLIENTE_KEY = 'pqd_cliente_v1'

function lerCliente(): Partial<CheckoutInput> {
  try {
    const raw = localStorage.getItem(CLIENTE_KEY)
    const o = raw ? JSON.parse(raw) : {}
    return { nome: String(o.nome ?? ''), telefone: String(o.telefone ?? ''), endereco: String(o.endereco ?? '') }
  } catch {
    return {}
  }
}

function salvarCliente(d: { nome: string; telefone: string; endereco: string }) {
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
  const taxa = Number(config.data?.taxa_entrega ?? 0) || 0
  const total = subtotal + (itens.length ? taxa : 0)

  const [etapa, setEtapa] = useState<Etapa>('itens')
  const [enviando, setEnviando] = useState(false)
  const [erros, setErros] = useState<Erros>({})
  const [form, setForm] = useState<CheckoutInput>(() => ({
    nome: '',
    telefone: '',
    endereco: '',
    forma_pagamento: undefined as unknown as CheckoutInput['forma_pagamento'],
    troco_para: '',
    observacoes: '',
    ...lerCliente(),
  }))
  const [confirmado, setConfirmado] = useState<{ numero: number; url: string } | null>(null)

  const set = <K extends keyof CheckoutInput>(k: K, v: CheckoutInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErros((e) => ({ ...e, [k]: undefined }))
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
      setTimeout(() => document.getElementById('checkout-form')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    const dados = r.data

    if (dados.forma_pagamento === 'dinheiro' && dados.troco_para && parseValor(dados.troco_para) < total) {
      setErros({ troco_para: `O troco deve ser para um valor maior ou igual a ${formatBRL(total)}` })
      return
    }

    // O número da loja vem do banco; sem ele não há para onde enviar — falha ANTES de salvar o pedido.
    const numero = config.data?.whatsapp_numero ?? ''
    const testeUrl = urlWhatsapp(numero, 'x')
    if (!testeUrl) {
      toast.error('O WhatsApp da loja ainda não foi configurado. Seu carrinho foi mantido — tente mais tarde.')
      return
    }

    setEnviando(true)
    try {
      const pedido = await criarPedido(dados, itens)
      const texto = montarMensagem({ numeroDiario: pedido.numeroDiario, itens, subtotal, taxaEntrega: itens.length ? taxa : 0, total, dados })
      const url = urlWhatsapp(numero, texto)!
      salvarCliente({ nome: dados.nome, telefone: form.telefone, endereco: dados.endereco })
      limpar()
      setConfirmado({ numero: pedido.numeroDiario, url })
      setEtapa('ok')
      // Pode ser bloqueado pelo navegador; a tela de confirmação tem o botão como garantia.
      window.open(url, '_blank', 'noopener,noreferrer')
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
          Revise os itens, informe seus dados e finalize o pedido pelo WhatsApp.
        </SheetDescription>

        {etapa === 'ok' && confirmado ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <CheckCircle2 className="h-14 w-14 text-verde" aria-hidden />
            <p className="font-titulo text-3xl">Pedido #{confirmado.numero} registrado!</p>
            <p className="text-sm">Se o WhatsApp não abriu sozinho, toque no botão abaixo para enviar a mensagem do pedido.</p>
            <a
              href={confirmado.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-preto bg-zap font-bold shadow-adesivo-sm"
            >
              <WhatsAppIcon className="h-5 w-5" /> Abrir WhatsApp
            </a>
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
                  <Campo id="endereco" label="Endereço e bairro" erro={erros.endereco}>
                    <textarea id="endereco" autoComplete="street-address" rows={2} value={form.endereco} onChange={(e) => set('endereco', e.target.value)} aria-invalid={!!erros.endereco} aria-describedby={erros.endereco ? 'endereco-erro' : undefined} className={cn(inputCls(erros.endereco), 'h-auto py-2')} placeholder="Rua, número, complemento, bairro" />
                  </Campo>

                  <fieldset>
                    <legend className="mb-1 text-sm font-extrabold">Forma de pagamento</legend>
                    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-invalid={!!erros.forma_pagamento}>
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
                <div className="flex justify-between">
                  <dt>Entrega</dt>
                  <dd className="font-bold">{taxa > 0 ? formatBRL(taxa) : 'A combinar'}</dd>
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
                      <WhatsAppIcon className="h-5 w-5" /> Finalizar pelo WhatsApp
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
