/**
 * Busca de endereço pelo CEP, sem chave e gratuita:
 *  1) AwesomeAPI: devolve também a latitude/longitude do CEP (usada no cálculo da entrega, sem depender
 *     de o mapa reconhecer o nome da rua);
 *  2) ViaCEP: só o endereço (fallback).
 */
export interface EnderecoCep {
  rua: string
  bairro: string
  cidade: string
  uf: string
  /** coordenadas do CEP, quando a fonte informa */
  lat?: number
  lng?: number
}

async function pegar<T>(url: string, ms: number): Promise<{ status: number; json: T | null } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    const json = res.ok || res.status === 404 ? ((await res.json().catch(() => null)) as T | null) : null
    return { status: res.status, json }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function buscarCep(cep8: string): Promise<EnderecoCep | 'nao_encontrado' | 'erro'> {
  type Awesome = { code?: string; address?: string; district?: string; city?: string; state?: string; lat?: string; lng?: string }
  const a = await pegar<Awesome>(`https://cep.awesomeapi.com.br/json/${cep8}`, 8000)
  if (a?.json && !a.json.code && (a.json.address || a.json.city)) {
    const lat = Number(a.json.lat)
    const lng = Number(a.json.lng)
    const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) > 0.01 && Math.abs(lng) > 0.01
    return { rua: a.json.address ?? '', bairro: a.json.district ?? '', cidade: a.json.city ?? '', uf: a.json.state ?? '', ...(ok ? { lat, lng } : {}) }
  }

  type Via = { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
  const v = await pegar<Via>(`https://viacep.com.br/ws/${cep8}/json/`, 8000)
  if (!v) return a && a.status === 404 ? 'nao_encontrado' : 'erro'
  if (v.status === 400 || v.json?.erro) return 'nao_encontrado'
  if (!v.json) return 'erro'
  return { rua: v.json.logradouro ?? '', bairro: v.json.bairro ?? '', cidade: v.json.localidade ?? '', uf: v.json.uf ?? '' }
}
