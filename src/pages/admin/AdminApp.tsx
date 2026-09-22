import { ClipboardList, LogOut, Package, Settings, Tags, UserCog } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useLicenca } from '@/hooks/useLicenca'
import { AuthProvider, useAuth } from '@/lib/auth'
import { cn, NOME_LOJA } from '@/lib/utils'
import AdminConta from './AdminConta'
import AdminEsqueci from './AdminEsqueci'
import AdminLogin from './AdminLogin'
import AdminRedefinir from './AdminRedefinir'
import Categorias from './Categorias'
import Configuracoes from './Configuracoes'
import Pedidos from './Pedidos'
import Produtos from './Produtos'

const ABAS = [
  { to: '/admin/produtos', label: 'Produtos', icon: Package },
  { to: '/admin/categorias', label: 'Categorias', icon: Tags },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ClipboardList },
  { to: '/admin/configuracoes', label: 'Loja', icon: Settings },
  { to: '/admin/conta', label: 'Minha conta', icon: UserCog },
]

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Faixa de situação da licença: só aparece para o admin da loja (o cliente final não vê nada disso). */
function AvisoLicenca() {
  const { data } = useLicenca()
  if (!data) return null

  const ate = data.valido_ate ? formatarData(data.valido_ate) : null
  const dias = data.dias_restantes ?? 0
  const salvo = 'Seus produtos, fotos e pedidos continuam salvos e você pode ver e exportar tudo aqui.'
  const contato = 'Para reativar a loja, fale com quem instalou o sistema.'

  if (!data.ativa) {
    const titulo = data.bloqueada ? 'Loja pausada pelo administrador do sistema.' : data.plano === 'mensal' ? 'Mensalidade em atraso.' : 'Período de teste encerrado.'
    return (
      <div role="alert" className="border-b-2 border-preto bg-red-200 px-4 py-2 text-sm font-bold text-preto">
        <div className="mx-auto max-w-6xl">
          <strong>{titulo}</strong> Novos pedidos estão pausados. {salvo} {contato}
        </div>
      </div>
    )
  }

  if (data.em_carencia) {
    return (
      <div role="alert" className="border-b-2 border-preto bg-ambar px-4 py-2 text-sm font-bold text-preto">
        <div className="mx-auto max-w-6xl">
          <strong>Mensalidade vencida{ate ? ` em ${ate}` : ''}.</strong> Regularize o pagamento para a loja não pausar os novos pedidos.
        </div>
      </div>
    )
  }

  if (data.plano === 'mensal' && data.dias_restantes !== null && dias <= 5) {
    return (
      <div role="status" className="border-b-2 border-preto bg-bege px-4 py-2 text-sm font-bold text-preto">
        <div className="mx-auto max-w-6xl">
          Sua mensalidade vence {dias <= 1 ? 'em menos de 1 dia' : `em ${dias} dias`}
          {ate ? ` (${ate})` : ''}. Depois do vencimento a loja pausa os novos pedidos.
        </div>
      </div>
    )
  }

  if (data.em_teste) {
    return (
      <div role="status" className={`border-b-2 border-preto px-4 py-2 text-sm font-bold text-preto ${dias <= 2 ? 'bg-ambar' : 'bg-bege'}`}>
        <div className="mx-auto max-w-6xl">
          Período de teste: {dias <= 1 ? 'termina em menos de 1 dia' : `faltam ${dias} dias`}
          {ate ? ` (até ${ate})` : ''}. Tudo o que você cadastrar fica salvo.
        </div>
      </div>
    )
  }

  return null
}

function Guard() {
  const { carregando, sessao, admin, master, sair } = useAuth()
  const local = useLocation()

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Carregando">
        <div className="shimmer h-12 w-48 rounded-xl border-2 border-preto" />
      </div>
    )
  }
  if (!sessao) return <Navigate to="/admin/login" replace state={{ de: local.pathname }} />
  if (!admin && master) return <Navigate to="/master" replace />
  if (!admin) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-3xl">Sem permissão</h1>
        <p className="text-sm">
          Esta conta não é de administrador. Peça para adicionarem seu usuário na tabela <code>admins</code>.
        </p>
        <Button variant="outline" onClick={sair}>
          Sair
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b-2 border-preto bg-verde-escuro">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <img src="/branding/mark-96.png" alt="" className="h-9 w-9 rounded-full border-2 border-preto" />
          <div className="min-w-0">
            <p className="truncate font-titulo text-lg leading-none">{NOME_LOJA}</p>
            <p className="text-[11px] font-bold text-bege/70">Painel administrativo</p>
          </div>
          <Button variant="ghost" size="sm" onClick={sair} className="ml-auto" aria-label="Sair do painel">
            <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
        <nav aria-label="Seções do painel" className="mx-auto flex max-w-6xl gap-1 px-4">
          {ABAS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-t-lg border-x-2 border-t-2 px-4 py-2 text-sm font-extrabold',
                  isActive ? 'border-preto bg-bege text-preto' : 'border-transparent text-bege/80 hover:text-bege',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <AvisoLicenca />
      <main className="mx-auto max-w-6xl px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}

export default function AdminApp() {
  // O painel não deve aparecer em buscadores.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route path="esqueci" element={<AdminEsqueci />} />
        <Route path="redefinir" element={<AdminRedefinir />} />
        <Route element={<Guard />}>
          <Route index element={<Navigate to="produtos" replace />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="categorias" element={<Categorias />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="conta" element={<AdminConta />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </AuthProvider>
  )
}
