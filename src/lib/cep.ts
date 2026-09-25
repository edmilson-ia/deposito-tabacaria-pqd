/** Busca de endereço pelo CEP (ViaCEP, gratuito e sem chave). */
export interface EnderecoCep {
  rua: string
  bairro: string
  cidade: string
  uf: string
}

export async function buscarCep(cep8: string): Promise<EnderecoCep | 'nao_encontrado' | 'erro'> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep8}/json/`, { signal: ctrl.signal })
    if (!res.ok) return res.status === 400 ? 'nao_encontrado' : 'erro'
    const j = (await res.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (j.erro) return 'nao_encontrado'
    return { rua: j.logradouro ?? '', bairro: j.bairro ?? '', cidade: j.localidade ?? '', uf: j.uf ?? '' }
  } catch {
    return 'erro'
  } finally {
    clearTimeout(timer)
  }
}
