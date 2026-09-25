/** Frete por distância: o n8n (OpenRouteService) devolve os km; a tabela de valores é da loja (painel > Loja). */
/** Rota pelo mapa (procura a rua pelo nome; usa a cota diária de geocodificação): só como reserva. */
const FRETE_URL_MAPA =
  (import.meta.env?.VITE_FRETE_URL as string | undefined) ?? 'https://n8n.srv1974666.hstgr.cloud/webhook/deposito-frete'
/** Rota pelas coordenadas do CEP (não gasta geocodificação; é o caminho principal). */
const FRETE_URL_CEP = 'https://n8n.srv1974666.hstgr.cloud/webhook/deposito-frete-cep'

export interface FaixaFrete {
  /** até quantos km (inclusive) vale esta faixa */
  ate: number
  /** valor em reais da entrega nesta faixa */
  valor: number
}

export interface TabelaFrete {
  faixas: FaixaFrete[]
  /** R$ por km inteiro que passar da última faixa */
  kmExtra: number
}

/** Tabela combinada com o cliente (usada enquanto a loja não cadastrar a dela). */
export const TABELA_PADRAO: TabelaFrete = {
  faixas: [
    { ate: 3, valor: 5 },
    { ate: 4, valor: 6 },
    { ate: 7, valor: 7 },
  ],
  kmExtra: 1,
}

export const FRETE_MIN = 1
export const FRETE_MAX = 500

/** Confere faixas em ordem crescente de km, valores entre FRETE_MIN e FRETE_MAX. */
function tabelaValida(t: TabelaFrete): boolean {
  if (!t.faixas.length || t.faixas.length > 10) return false
  if (!Number.isFinite(t.kmExtra) || t.kmExtra < 0 || t.kmExtra > 100) return false
  let anterior = 0
  for (const f of t.faixas) {
    if (!Number.isFinite(f.ate) || !Number.isFinite(f.valor)) return false
    if (f.ate <= anterior || f.ate > 1000) return false
    if (f.valor < FRETE_MIN || f.valor > FRETE_MAX) return false
    anterior = f.ate
  }
  return true
}

/** Lê a tabela de configuracoes (chaves frete_faixas e frete_km_extra); se faltar ou estiver inválida, usa a padrão. */
export function lerTabelaFrete(cfg?: Record<string, string>): TabelaFrete {
  try {
    if (!cfg?.frete_faixas) return TABELA_PADRAO
    const faixas = (JSON.parse(cfg.frete_faixas) as { ate: unknown; valor: unknown }[]).map((f) => ({ ate: Number(f.ate), valor: Number(f.valor) }))
    const kmExtra = cfg.frete_km_extra === undefined || cfg.frete_km_extra === '' ? TABELA_PADRAO.kmExtra : Number(cfg.frete_km_extra)
    const t = { faixas, kmExtra }
    return tabelaValida(t) ? t : TABELA_PADRAO
  } catch {
    return TABELA_PADRAO
  }
}

/** Valor da entrega para uma distância (em km). */
export function calcularTaxa(km: number, t: TabelaFrete): number {
  const faixa = t.faixas.find((f) => km <= f.ate)
  if (faixa) return faixa.valor
  const ultima = t.faixas[t.faixas.length - 1]
  return Math.round((ultima.valor + Math.ceil(km - ultima.ate) * t.kmExtra) * 100) / 100
}

/** Valida o que a loja digitou no painel; devolve a tabela ou a mensagem de erro em português. */
export function validarTabelaFrete(linhas: { ate: string; valor: string }[], extra: string): { ok: true; tabela: TabelaFrete } | { ok: false; erro: string } {
  const num = (s: string) => Number(s.trim().replace(/[^\d,.-]/g, '').replace(',', '.'))
  if (!linhas.length) return { ok: false, erro: 'Cadastre ao menos uma faixa de distância.' }
  const faixas = linhas.map((l) => ({ ate: num(l.ate), valor: num(l.valor) }))
  const kmExtra = extra.trim() === '' ? 0 : num(extra)
  let anterior = 0
  for (const [i, f] of faixas.entries()) {
    if (!Number.isFinite(f.ate) || f.ate <= 0) return { ok: false, erro: `Faixa ${i + 1}: informe a distância em km (maior que zero).` }
    if (f.ate <= anterior) return { ok: false, erro: `Faixa ${i + 1}: os km devem aumentar de uma faixa para a outra.` }
    if (!Number.isFinite(f.valor) || f.valor < FRETE_MIN || f.valor > FRETE_MAX) return { ok: false, erro: `Faixa ${i + 1}: o valor deve ficar entre R$ ${FRETE_MIN},00 e R$ ${FRETE_MAX},00.` }
    anterior = f.ate
  }
  if (!Number.isFinite(kmExtra) || kmExtra < 0 || kmExtra > 100) return { ok: false, erro: 'O valor por km extra deve ficar entre 0 e 100.' }
  const tabela = { faixas, kmExtra }
  return tabelaValida(tabela) ? { ok: true, tabela } : { ok: false, erro: 'Tabela de frete inválida. Confira os números.' }
}

export interface Frete {
  km: number
  taxa: number
  /** Endereço que o mapa entendeu (não exibido: pode ser uma rua parecida). */
  endereco?: string
}

async function chamar(url: string, corpo: object): Promise<Frete | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: ctrl.signal })
    if (!res.ok) return null
    const j = (await res.json()) as { ok?: unknown; km?: unknown; endereco?: unknown }
    if (j.ok !== true || typeof j.km !== 'number' || !Number.isFinite(j.km) || j.km < 0) return null
    return { km: j.km, taxa: 0, endereco: typeof j.endereco === 'string' ? j.endereco : undefined }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Devolve null se o endereço não foi encontrado ou o serviço falhou: a entrega fica "a combinar". */
export async function calcularFrete(
  d: { endereco: string; numero: string; bairro: string; cidade: string; cep: string; lat?: number; lng?: number },
  tabela: TabelaFrete = TABELA_PADRAO,
): Promise<Frete | null> {
  // ViaCEP acrescenta apelidos depois do nome ("Rua X - Tio Nilton"): o mapa só acha a rua sem o apelido
  const corpo = { rua: d.endereco.replace(/\s+-\s+.*$/, '').trim(), numero: d.numero, bairro: d.bairro, cidade: d.cidade, cep: d.cep, lat: d.lat, lng: d.lng }
  let r: Frete | null = null
  if (typeof d.lat === 'number' && typeof d.lng === 'number') r = await chamar(FRETE_URL_CEP, corpo)
  if (!r) r = await chamar(FRETE_URL_MAPA, corpo)
  if (!r) return null
  const taxa = calcularTaxa(r.km, tabela)
  if (!Number.isFinite(taxa) || taxa < FRETE_MIN || taxa > FRETE_MAX) return null
  return { ...r, taxa }
}
