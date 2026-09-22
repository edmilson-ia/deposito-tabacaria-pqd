import { PackageSearch, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState({ titulo, texto, acao }: { titulo: string; texto?: string; acao?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-bege/40 p-8 text-center">
      <PackageSearch className="h-10 w-10 text-bege/70" aria-hidden />
      <p className="font-titulo text-2xl">{titulo}</p>
      {texto && <p className="text-sm text-bege/80">{texto}</p>}
      {acao && (
        <Button variant="outline" onClick={acao.onClick} className="mt-2">
          {acao.label}
        </Button>
      )}
    </div>
  )
}

export function ErrorState({ onRetry, mensagem }: { onRetry?: () => void; mensagem?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-xl border-2 border-preto bg-bege p-8 text-center text-preto shadow-adesivo">
      <TriangleAlert className="h-10 w-10" aria-hidden />
      <p className="font-titulo text-2xl">Ops, algo deu errado</p>
      <p className="text-sm">{mensagem ?? 'Não foi possível carregar os dados. Verifique sua conexão e tente novamente.'}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-2">
          Tentar de novo
        </Button>
      )}
    </div>
  )
}
