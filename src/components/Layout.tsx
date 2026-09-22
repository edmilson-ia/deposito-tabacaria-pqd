import { Info, MessageCircle, ShoppingCart, Store, House } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { AgeGate } from '@/components/AgeGate'
import { CartSheet } from '@/components/CartSheet'
import { usePedidosPausados } from '@/hooks/useLicenca'
import { WhatsAppIcon } from '@/components/WhatsAppIcon'
import { useCart } from '@/lib/cart'
import { AVISO_18, cn, formatBRL, NOME_LOJA } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Início', icon: House, end: true },
  { to: '/catalogo', label: 'Catálogo', icon: Store, end: false },
  { to: '/contato', label: 'Contato', icon: MessageCircle, end: false },
  { to: '/empresa', label: 'Empresa', icon: Info, end: false },
]

/** Faixa de pergaminho com pontas dobradas, no estilo do banner da logo. */
function Pergaminho({ children }: { children: string }) {
  return (
    <span className="relative block h-11 w-full max-w-[300px] min-w-0">
      <svg
        viewBox="0 0 260 44"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 h-full w-full overflow-visible"
        stroke="#111111"
        strokeWidth="2.5"
        strokeLinejoin="round"
      >
        <g style={{ vectorEffect: 'non-scaling-stroke' }}>
          <polygon points="2,14 28,14 28,40 2,40 10,27" fill="#dfc48f" vectorEffect="non-scaling-stroke" />
          <polygon points="258,14 232,14 232,40 258,40 250,27" fill="#dfc48f" vectorEffect="non-scaling-stroke" />
          <rect x="14" y="4" width="232" height="30" rx="3" fill="#efd8ac" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <span className="absolute inset-x-[16%] top-[4px] flex h-[30px] items-center justify-center whitespace-nowrap font-titulo text-[17px] leading-none text-preto">
        {children}
      </span>
    </span>
  )
}

function Header() {
  const { quantidadeTotal, abrir } = useCart()
  return (
    <header className="sticky top-0 z-40 border-b-2 border-preto bg-verde-escuro/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-2" aria-label={`${NOME_LOJA} — início`}>
          <img src="/branding/mark-96.png" alt="" className="h-10 w-10 shrink-0 rounded-full border-2 border-preto" />
          <Pergaminho>{NOME_LOJA}</Pergaminho>
        </Link>
        <button
          onClick={abrir}
          aria-label={`Abrir carrinho, ${quantidadeTotal} itens`}
          className="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-preto bg-ambar text-preto shadow-adesivo-sm"
        >
          <ShoppingCart className="h-5 w-5" aria-hidden />
          {quantidadeTotal > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-preto bg-bege px-1 text-center text-[11px] font-extrabold leading-4 text-preto">
              {quantidadeTotal}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}

function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-preto bg-verde-escuro pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-5xl">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold',
                  isActive ? 'text-ambar' : 'text-bege/80 hover:text-bege',
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Botão flutuante de pedidos: canto inferior direito, verde WhatsApp, itens + total. */
function FloatingOrderButton() {
  const { quantidadeTotal, subtotal, abrir } = useCart()
  if (quantidadeTotal === 0) return null
  return (
    <button
      onClick={abrir}
      aria-label={`Ver pedido: ${quantidadeTotal} itens, total ${formatBRL(subtotal)}`}
      className="fixed bottom-20 right-4 z-50 flex items-center gap-2 rounded-full border-2 border-preto bg-zap px-4 py-3 font-extrabold text-preto shadow-adesivo"
    >
      <WhatsAppIcon className="h-6 w-6" />
      <span className="text-sm">
        {quantidadeTotal} {quantidadeTotal === 1 ? 'item' : 'itens'} · {formatBRL(subtotal)}
      </span>
    </button>
  )
}

export function Layout() {
  const pausados = usePedidosPausados()
  return (
    <div className="min-h-dvh pb-24">
      <a href="#conteudo" className="sr-only z-[110] rounded-lg border-2 border-preto bg-ambar px-4 py-2 font-bold text-preto focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Pular para o conteúdo
      </a>
      <AgeGate />
      <Header />
      {pausados && (
        <div role="status" className="border-b-2 border-preto bg-ambar px-4 py-2 text-center text-sm font-extrabold text-preto">
          Estamos sem receber novos pedidos no momento. Você pode olhar o catálogo; volte em breve!
        </div>
      )}
      <main id="conteudo" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-4 outline-none">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-center text-xs text-bege/80">
        <p className="font-bold">{AVISO_18}</p>
        <p className="mt-1">© {new Date().getFullYear()} {NOME_LOJA}</p>
      </footer>
      <FloatingOrderButton />
      <CartSheet />
      <BottomNav />
    </div>
  )
}
