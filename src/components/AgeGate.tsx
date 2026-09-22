import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { NOME_LOJA } from '@/lib/utils'

const KEY = 'pqd_maior18'

function jaConfirmou(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function AgeGate() {
  const [aberto, setAberto] = useState(() => !jaConfirmou())
  const [recusou, setRecusou] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [aberto])

  if (!aberto) return null

  function confirmar() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* sem armazenamento: pergunta de novo na próxima visita */
    }
    setAberto(false)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-verde-escuro/95 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="age-titulo"
        className="w-full max-w-sm rounded-2xl border-2 border-preto bg-bege p-6 text-center text-preto shadow-adesivo"
      >
        <img src="/branding/mark-96.png" alt="" className="mx-auto mb-3 h-20 w-20 rounded-full border-2 border-preto" />
        <h2 id="age-titulo" className="text-3xl leading-tight">
          {recusou ? 'Acesso não permitido' : 'Você tem 18 anos ou mais?'}
        </h2>
        <p className="mt-2 text-sm text-preto/80">
          {recusou
            ? 'Este site vende bebidas alcoólicas e tabacaria. Venda proibida para menores de 18 anos.'
            : `${NOME_LOJA} vende bebida alcoólica e tabacaria. Venda proibida para menores de 18 anos.`}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {!recusou ? (
            <>
              <Button onClick={confirmar} className="w-full" autoFocus>
                Sou maior de 18 anos
              </Button>
              <Button variant="outline" onClick={() => setRecusou(true)} className="w-full">
                Sou menor de 18 anos
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setRecusou(false)} className="w-full">
              Voltar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
