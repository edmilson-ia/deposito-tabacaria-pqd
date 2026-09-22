import { useEffect } from 'react'
import { NOME_LOJA } from '@/lib/utils'

/** Título da aba por página (ajuda no histórico do navegador e em leitores de tela). */
export function usePageTitle(titulo?: string) {
  useEffect(() => {
    const anterior = document.title
    document.title = titulo ? `${titulo} — ${NOME_LOJA}` : `${NOME_LOJA} — Bebidas e tabacaria com entrega`
    return () => {
      document.title = anterior
    }
  }, [titulo])
}
