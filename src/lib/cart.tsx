import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { Produto, Unidade } from './types'

const STORAGE_KEY = 'pqd_carrinho_v1'

const itemSchema = z.object({
  produtoId: z.number(),
  nome: z.string(),
  preco: z.number().nonnegative(),
  unidade: z.enum(['un', 'cx', 'fardo']),
  imagemUrl: z.string().nullable(),
  quantidade: z.number().int().min(1).max(999),
})
export type CartItem = z.infer<typeof itemSchema>

function carregar(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = z.array(itemSchema).safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

interface CartValue {
  itens: CartItem[]
  quantidadeTotal: number
  subtotal: number
  quantidadeDe: (produtoId: number) => number
  adicionar: (p: Pick<Produto, 'id' | 'nome' | 'preco' | 'unidade' | 'imagem_url'>) => void
  alterar: (produtoId: number, delta: number) => void
  remover: (produtoId: number) => void
  limpar: () => void
  aberto: boolean
  abrir: () => void
  fechar: () => void
}

const CartContext = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<CartItem[]>(carregar)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(itens))
    } catch {
      /* armazenamento indisponível (modo privado etc.): o carrinho segue em memória */
    }
  }, [itens])

  const adicionar = useCallback<CartValue['adicionar']>((p) => {
    setItens((atual) => {
      const existe = atual.find((i) => i.produtoId === p.id)
      if (existe) {
        return atual.map((i) => (i.produtoId === p.id ? { ...i, quantidade: Math.min(999, i.quantidade + 1) } : i))
      }
      return [
        ...atual,
        { produtoId: p.id, nome: p.nome, preco: p.preco, unidade: p.unidade as Unidade, imagemUrl: p.imagem_url, quantidade: 1 },
      ]
    })
  }, [])

  const alterar = useCallback((produtoId: number, delta: number) => {
    setItens((atual) =>
      atual
        .map((i) => (i.produtoId === produtoId ? { ...i, quantidade: Math.min(999, i.quantidade + delta) } : i))
        .filter((i) => i.quantidade > 0),
    )
  }, [])

  const remover = useCallback((produtoId: number) => setItens((a) => a.filter((i) => i.produtoId !== produtoId)), [])
  const limpar = useCallback(() => setItens([]), [])
  const abrir = useCallback(() => setAberto(true), [])
  const fechar = useCallback(() => setAberto(false), [])

  const value = useMemo<CartValue>(
    () => ({
      itens,
      quantidadeTotal: itens.reduce((s, i) => s + i.quantidade, 0),
      subtotal: itens.reduce((s, i) => s + i.quantidade * i.preco, 0),
      quantidadeDe: (id) => itens.find((i) => i.produtoId === id)?.quantidade ?? 0,
      adicionar,
      alterar,
      remover,
      limpar,
      aberto,
      abrir,
      fechar,
    }),
    [itens, aberto, adicionar, alterar, remover, limpar, abrir, fechar],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart precisa estar dentro de <CartProvider>')
  return ctx
}
