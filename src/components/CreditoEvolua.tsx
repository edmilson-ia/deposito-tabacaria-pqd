import { cn, EVOLUA_INSTAGRAM_URL } from '@/lib/utils'

/** Crédito discreto do desenvolvedor: só no painel admin, login do admin e página Empresa. */
export function CreditoEvolua({ className }: { className?: string }) {
  return (
    <p className={cn('text-center text-xs opacity-80', className)}>
      Aplicativo desenvolvido pela{' '}
      {EVOLUA_INSTAGRAM_URL ? (
        <a href={EVOLUA_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
          Evolua Automação
        </a>
      ) : (
        <span className="font-bold">Evolua Automação</span>
      )}
    </p>
  )
}
