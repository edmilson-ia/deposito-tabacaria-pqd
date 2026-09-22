export type Unidade = 'un' | 'cx' | 'fardo'

export interface Categoria {
  id: number
  nome: string
  ordem: number
}

export interface CategoriaComContagem extends Categoria {
  total: number
}

export interface Produto {
  id: number
  nome: string
  descricao: string | null
  categoria_id: number | null
  preco: number
  unidade: Unidade
  estoque: number
  imagem_url: string | null
  ativo: boolean
}
