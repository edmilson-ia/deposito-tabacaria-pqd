/**
 * Aplica fotos vindas de links avulsos do Google Drive (arquivo por arquivo, não pasta),
 * indicados manualmente como { nome, unidade, arquivoId, force? }.
 * Uso: tsx scripts/imagens-diretas.ts --apply   (sem --apply só confere se os produtos existem)
 */
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

const ITENS: { nome: string; unidade: 'un' | 'cx'; arquivoId: string; force?: boolean }[] = [
  { nome: 'Amstel Latão unid', unidade: 'un', arquivoId: '1FI4VketJveBcCgfotqjTPxgpDSyxpT4t' },
  { nome: 'Heineken Long Neck pack', unidade: 'cx', arquivoId: '1Rw9o5wApXdQ-J4W1fyoCpNRmre8pvoaT' },
  { nome: 'Império Gold pack', unidade: 'cx', arquivoId: '1mLGgFj96bNyfcftLmqoPADPZs6q5P_HR' },
  { nome: 'Brahma Lata 350ml pack', unidade: 'cx', arquivoId: '11k3dbiNTCQbTi_GZLc6ssGeFvwzQSzko' },
  { nome: 'Brahma Latão 473ml pack', unidade: 'cx', arquivoId: '1OcNywxUtOj0wmHh7J9zFVaHN5dKDXJrK' },
  { nome: 'Heineken Latão 473ml pack', unidade: 'cx', arquivoId: '1DFtYL4JT09MgLPrZ-9cN_neW1B9bEi4v' },
  { nome: 'Império Latão 473ml pack', unidade: 'cx', arquivoId: '1lz8Y9f6r05P8IOksbDPMZcJn4QUIcT3y' },
  { nome: 'Império Latão 473ml', unidade: 'un', arquivoId: '19H1OpIVfXwJVRRJxOyPJUHaT_oSjR1KL' },
  { nome: 'Narguilé Grande', unidade: 'un', arquivoId: '1A23evi-7aWhnqq-JOchBWXRkwiB83j03' },
  { nome: 'Narguilé Pequeno', unidade: 'un', arquivoId: '1A23evi-7aWhnqq-JOchBWXRkwiB83j03' },
  { nome: 'Amstel Latão', unidade: 'cx', arquivoId: '1tQYGuSxggDFRNEm0318aZVMOR2trIfwM', force: true },
  { nome: 'Império Lager pack', unidade: 'cx', arquivoId: '1YQ34B4xKrH4895HWo5isZENi_BDi6TEF' },
  { nome: 'Império Ultra pack', unidade: 'cx', arquivoId: '142_r6h86DSn-Tmf9orpT2_1cdf0Z_GcK' },
  { nome: 'Império Zero pack', unidade: 'cx', arquivoId: '1qhsRJ4vo0anSC1pNfNF18eJNcBaV2z0D' },
  { nome: 'Antarctica Latão', unidade: 'cx', arquivoId: '1ZmHT1HVIFF7lzcKdT8dN0gfHxSiJ2Uk9' },
  { nome: 'Guaraná Antarctica 350ml Zero', unidade: 'un', arquivoId: '1t2z010F7d4_SIDdkjqUzqCqHFCiRu4c-' },
  { nome: 'Antarctica Latão', unidade: 'un', arquivoId: '1M8kkR7KfAHQ2_8vJg8fVSv--sOsojyiI' },
  { nome: 'White Horse', unidade: 'un', arquivoId: '13zS2y3vHntIk66MID5ZCgCCDE6GkKZB9' },
  { nome: "Buchanan's", unidade: 'un', arquivoId: '1mSrp6Z9nwPQqiT7O_yZrGsOGGhJBFXD2' },
  { nome: 'Old Parr', unidade: 'un', arquivoId: '1vPT9wNvg1DOWGSWjeYxi0TQrxBe__F38' },
  { nome: 'Chivas', unidade: 'un', arquivoId: '1v4xPy7XMblM2G-C8Cy_v2vWF8T4u0EbU' },
  { nome: "Jack Daniel's Old No. 7", unidade: 'un', arquivoId: '1va_mPWF4gqeIdotstLW41-anKDCsG6FR' },
  { nome: "Jack Daniel's Fire", unidade: 'un', arquivoId: '1WAG5rQeK-lg7rP-jjBx1q_dP7SEwV6d8' },
  { nome: "Jack Daniel's Honey", unidade: 'un', arquivoId: '1fnBGVzU-qd0HsZTNiSM03Lwwup-MBS1R' },
  { nome: "Jack Daniel's Apple", unidade: 'un', arquivoId: '1eo6eys5ShmeX6WmGhi2wvKRYeGBC9Yhl' },
  { nome: 'Johnnie Walker Red Label', unidade: 'un', arquivoId: '1Z-JMKNNYGJd-IEzUSQNFLZTYIB-VoCwL' },
  { nome: 'Johnnie Walker Black Label', unidade: 'un', arquivoId: '1yy3GOxmH-XoFfygAvW4_452zc2TaiyUN' },
  { nome: 'Johnnie Walker Gold Label', unidade: 'un', arquivoId: '1V4zd4Ag3WTYSDMFdsQc3BlE0aXq5KJU_' },
  { nome: 'Johnnie Walker Double Black', unidade: 'un', arquivoId: '1v7inonVWqZW92Mxkvi-jGHtEKojEDRZe' },
  { nome: 'Água 1,5L', unidade: 'un', arquivoId: '1H0KXAmBdIrMbFUNBJ6H9cEm2Gb732f0b' },
  { nome: 'Água sem gás 510ml', unidade: 'un', arquivoId: '1BOPDicgjiGD5IJdFBKt7vTzFnr43uYei', force: true },
  { nome: 'Água Com Gás 510ml', unidade: 'un', arquivoId: '1G6fkDeeh6db2endoSMtAqETIZmGB6k7r', force: true },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Preencha VITE_SUPABASE_URL e SUPABASE_SERVICE_KEY no .env')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: produtos, error } = await sb.from('produtos').select('id, nome, unidade, imagem_url')
  if (error) throw error

  let ok = 0, falhas = 0, pulados = 0
  const cache = new Map<string, Buffer>()
  for (const it of ITENS) {
    const p = produtos!.find((x) => x.nome === it.nome && x.unidade === it.unidade)
    if (!p) { console.log(`  NÃO ACHEI produto "${it.nome}" [${it.unidade}]`); falhas++; continue }
    if (p.imagem_url && !it.force) { console.log(`  pulado (já tem foto, sem --force): ${it.nome} [${it.unidade}]`); pulados++; continue }
    if (!apply) { console.log(`  OK (dry-run) ${it.nome} [${it.unidade}] <- ${it.arquivoId}`); continue }
    try {
      let buf = cache.get(it.arquivoId)
      if (!buf) {
        const r = await fetch(`https://drive.usercontent.google.com/download?id=${it.arquivoId}&export=download&confirm=t`)
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`download falhou (HTTP ${r.status})`)
        const entrada = Buffer.from(await r.arrayBuffer())
        buf = await sharp(entrada)
          .rotate()
          .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .webp({ quality: 85 })
          .toBuffer()
        cache.set(it.arquivoId, buf)
      }
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 8)
      const caminho = `${norm(p.nome)}-${p.unidade}-${p.id}.webp`
      const up = await sb.storage.from('produtos').upload(caminho, buf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      if (up.error) throw up.error
      const publica = sb.storage.from('produtos').getPublicUrl(caminho).data.publicUrl + `?v=${hash}`
      const { error: eUp } = await sb.from('produtos').update({ imagem_url: publica }).eq('id', p.id)
      if (eUp) throw eUp
      ok++
      console.log(`  ok  ${it.nome} [${it.unidade}]`)
    } catch (e) {
      falhas++
      console.log(`  ERRO ${it.nome} [${it.unidade}]: ${e instanceof Error ? e.message : JSON.stringify(e)}`)
    }
  }
  console.log(`\n${apply ? 'Aplicado' : 'Dry-run'}: ${ok} ok, ${pulados} pulados, ${falhas} falha(s).`)
}

main().catch((e) => {
  console.error('\nERRO:', e instanceof Error ? e.message : e)
  process.exit(1)
})
