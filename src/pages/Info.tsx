import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { InstagramIcon } from '@/components/InstagramIcon'
import { buttonVariants } from '@/components/ui/button'
import { useConfig } from '@/hooks/useCatalogo'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cn, NOME_LOJA } from '@/lib/utils'

const ENDERECO = 'Rua Pedralva, 50 — Realengo, RJ'
const LINK_MAPA = 'https://maps.apple/p/c1s_GXLa.vfykA'
const EMAIL = 'depositodopqd14@gmail.com'
const LINK_INSTAGRAM = 'https://www.instagram.com/depositodopqd14?igsh=MW80ZG4xemgyZnY1Yw%3D%3D&utm_source=qr'

/** Linha de contato clicável: ícone + texto, com um link "por fora" cobrindo a linha toda. */
function LinhaContato({ icon: Icon, texto, href }: { icon: React.ComponentType<{ className?: string }>; texto: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border-2 border-preto bg-bege p-3 text-sm font-semibold text-preto shadow-adesivo-sm"
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span>{texto}</span>
    </a>
  )
}

export function Contato() {
  usePageTitle('Contato')
  const { data } = useConfig()
  const numero = data?.whatsapp_numero?.replace(/\D/g, '')
  const numeroFormatado = numero && numero.length >= 12 ? `(${numero.slice(2, 4)}) ${numero.slice(4, 9)}-${numero.slice(9)}` : null
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

      <div className="grid max-w-sm gap-2">
        {numeroFormatado && <LinhaContato icon={Phone} texto={numeroFormatado} href={`https://wa.me/${numero}`} />}
        <LinhaContato icon={MapPin} texto={ENDERECO} href={LINK_MAPA} />
        <LinhaContato icon={Mail} texto={EMAIL} href={`mailto:${EMAIL}`} />
        <LinhaContato icon={InstagramIcon} texto="@depositodopqd14" href={LINK_INSTAGRAM} />
      </div>
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
    </div>
  )
}
