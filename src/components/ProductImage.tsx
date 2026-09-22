import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  src: string | null
  alt: string
  className?: string
  /** false em miniaturas: mostra só o ícone, sem o texto "Sem foto" */
  legenda?: boolean
}

/** Lazy loading + shimmer enquanto carrega + fallback quando falta/quebra a imagem. */
export function ProductImage({ src, alt, className, legenda = true }: Props) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>(src ? 'carregando' : 'erro')

  if (!src || estado === 'erro') {
    return (
      <div
        role="img"
        aria-label={`${alt} (sem foto)`}
        className={cn('flex flex-col items-center justify-center gap-1 bg-bege-escuro text-verde', className)}
      >
        <ImageOff className={legenda ? "h-8 w-8" : "h-5 w-5"} aria-hidden />
        {legenda && <span className="text-[10px] font-semibold uppercase tracking-wide">Sem foto</span>}
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden bg-white', className)}>
      {estado === 'carregando' && <div className="shimmer absolute inset-0" aria-hidden />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setEstado('ok')}
        onError={() => setEstado('erro')}
        className={cn('h-full w-full object-contain p-2 transition-opacity', estado === 'ok' ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  )
}
