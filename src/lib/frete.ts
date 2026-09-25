/** Chama o n8n (OpenRouteService) para calcular a distância de carro e a taxa de entrega. */
const FRETE_URL =
  (import.meta.env.VITE_FRETE_URL as string | undefined) ?? 'https://n8n.srv1974666.hstgr.cloud/webhook/deposito-frete'

export interface Frete {
  km: number
  taxa: number
  /** Endereço que o mapa entendeu (para o cliente conferir). */
  endereco?: string
}

/** Devolve null se o endereço não foi encontrado ou o serviço falhou: a entrega fica "a combinar". */
export async function calcularFrete(d: { endereco: string; numero: string; bairro: string; cep: string }): Promise<Frete | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(FRETE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rua: d.endereco, numero: d.numero, bairro: d.bairro, cidade: 'Rio de Janeiro', cep: d.cep }),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    const j = (await res.json()) as { ok?: unknown; km?: unknown; taxa?: unknown; endereco?: unknown }
    if (j.ok !== true || typeof j.km !== 'number' || typeof j.taxa !== 'number') return null
    if (!Number.isFinite(j.km) || !Number.isFinite(j.taxa) || j.taxa < 0 || j.taxa > 500) return null
    return { km: j.km, taxa: j.taxa, endereco: typeof j.endereco === 'string' ? j.endereco : undefined }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
