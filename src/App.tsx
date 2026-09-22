import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Layout } from '@/components/Layout'
import { CartProvider } from '@/lib/cart'
import Catalogo from '@/pages/Catalogo'
import Home from '@/pages/Home'
import { Contato, Empresa } from '@/pages/Info'

// O painel admin vai num chunk separado: visitantes do catálogo não baixam esse código.
const AdminApp = lazy(() => import('@/pages/admin/AdminApp'))
// Painel do dono do sistema (mensalidade/teste): outro chunk, protegido no servidor por is_superadmin().
const MasterApp = lazy(() => import('@/pages/master/MasterApp'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route
              path="master/*"
              element={
                <Suspense fallback={<div className="p-6 text-center" role="status">Carregando…</div>}>
                  <MasterApp />
                </Suspense>
              }
            />
            <Route
              path="admin/*"
              element={
                <Suspense fallback={<div className="p-6 text-center" role="status">Carregando…</div>}>
                  <AdminApp />
                </Suspense>
              }
            />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="catalogo" element={<Catalogo />} />
              <Route path="contato" element={<Contato />} />
              <Route path="empresa" element={<Empresa />} />
              <Route path="*" element={<Home />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" toastOptions={{ style: { border: '2px solid #111', background: '#efd8ac', color: '#111', fontWeight: 600 } }} />
      </CartProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  )
}
