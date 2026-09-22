import { MessageCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { useConfig } from '@/hooks/useCatalogo'
import { usePageTitle } from '@/hooks/usePageTitle'
import { AVISO_18, cn, NOME_LOJA } from '@/lib/utils'

export function Contato() {
  usePageTitle('Contato')
  const { data } = useConfig()
  const numero = data?.whatsapp_numero?.replace(/\D/g, '')
  return (
    <div className="space-y-4">
      <h1 className="text-4xl">Contato</h1>
      <p className="text-bege/90">Fale com a gente pelo WhatsApp para tirar dúvidas ou acompanhar seu pedido.</p>
      {numero ? (
        <a
          href={`https://wa.me/${numero}?text=${encodeURIComponent(`Olá! Vim pelo site da ${NOME_LOJA}.`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'zap' }), 'h-12 w-full max-w-sm')}
        >
          <MessageCircle className="h-5 w-5" aria-hidden /> Chamar no WhatsApp
        </a>
      ) : (
        <p className="rounded-xl border-2 border-preto bg-bege p-4 text-sm font-semibold text-preto">
          O número de WhatsApp da loja ainda não foi configurado.
        </p>
      )}
    </div>
  )
}

export function Empresa() {
  usePageTitle('Empresa')
  return (
    <div className="space-y-4">
      <h1 className="text-4xl">{NOME_LOJA}</h1>
      <p className="text-bege/90">
        Cervejas, refrigerantes, energéticos, gelo e tabacaria. Monte seu pedido no catálogo e finalize pelo WhatsApp.
      </p>
      <p className="text-bege/90">Formas de pagamento: Pix, dinheiro ou cartão na entrega. O valor da entrega é combinado pelo WhatsApp.</p>
      <p className="text-sm font-bold">{AVISO_18}</p>
    </div>
  )
}
