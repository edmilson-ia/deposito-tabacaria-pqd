import { Component, type ErrorInfo, type ReactNode } from 'react'
import { NOME_LOJA } from '@/lib/utils'

interface State {
  erro: boolean
}

/** Evita a "tela em branco": qualquer erro inesperado de renderização mostra esta mensagem. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { erro: false }

  static getDerivedStateFromError(): State {
    return { erro: true }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro não tratado:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-3xl">Ops, algo deu errado</h1>
        <p className="text-sm">
          Não foi possível exibir esta página. Seu carrinho continua salvo. Recarregue para tentar de novo.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-11 rounded-lg border-2 border-preto bg-ambar px-5 text-sm font-bold text-preto shadow-adesivo-sm"
        >
          Recarregar
        </button>
        <p className="text-xs text-bege/70">{NOME_LOJA}</p>
      </div>
    )
  }
}
