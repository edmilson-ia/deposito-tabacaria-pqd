/**
 * Amostra as cores da logo e gera os assets de marca (favicon, ícones PWA, og:image, hero).
 *   npx tsx scripts/branding.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const SRC = 'public/branding/deposito-tabacaria-pqd.png'
const OUT = 'public/branding'

type Regiao = { nome: string; left: number; top: number; width: number; height: number }

// Regiões escolhidas olhando a logo (1080x653).
const REGIOES: Regiao[] = [
  { nome: 'verde', left: 20, top: 330, width: 90, height: 200 },
  { nome: 'verde-escuro', left: 380, top: 560, width: 240, height: 80 },
  { nome: 'bege', left: 560, top: 190, width: 200, height: 30 },
  { nome: 'ambar', left: 380, top: 380, width: 60, height: 100 },
  { nome: 'preto', left: 90, top: 236, width: 120, height: 8 },
]

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()

/** Cor mais frequente da região (agrupando em passos de 4 níveis) — ignora ruído/textura. */
async function corDominante(r: Regiao) {
  const { data, info } = await sharp(SRC)
    .extract({ left: r.left, top: r.top, width: r.width, height: r.height })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const cont = new Map<string, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += info.channels) {
    const k = `${data[i] >> 2}-${data[i + 1] >> 2}-${data[i + 2] >> 2}`
    const c = cont.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
    c.n++
    c.r += data[i]; c.g += data[i + 1]; c.b += data[i + 2]
    cont.set(k, c)
  }
  const top = [...cont.values()].sort((a, b) => b.n - a.n)[0]
  return hex(Math.round(top.r / top.n), Math.round(top.g / top.n), Math.round(top.b / top.n))
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const cores: Record<string, string> = {}
  for (const r of REGIOES) cores[r.nome] = await corDominante(r)
  console.log('Cores amostradas:', cores)
  writeFileSync(`${OUT}/cores.json`, JSON.stringify(cores, null, 2))

  const meta = await sharp(SRC).metadata()
  const W = meta.width!, H = meta.height!

  // Recorte quadrado dos canecos (favicon / PWA / header compacto)
  const lado = 440
  const quadrado = sharp(SRC)
    .extract({ left: 320, top: 266, width: lado, height: 290 })
    .extend({ top: 75, bottom: 75, background: cores['verde'] })
  const base = await quadrado.png().toBuffer()
  await sharp(base).resize(512, 512).png().toFile(`${OUT}/icon-512.png`)
  await sharp(base).resize(192, 192).png().toFile(`${OUT}/icon-192.png`)
  await sharp(base).resize(180, 180).png().toFile(`${OUT}/apple-touch-icon.png`)
  await sharp(base).resize(48, 48).png().toFile(`${OUT}/favicon-48.png`)
  await sharp(base).resize(96, 96).png().toFile(`${OUT}/mark-96.png`)

  // og:image 1200x630 (a logo já é ~16:10; cobre e centraliza)
  await sharp(SRC).resize(1200, 630, { fit: 'cover', position: 'centre' }).jpeg({ quality: 88 }).toFile(`${OUT}/og-image.jpg`)

  // hero otimizado (webp)
  await sharp(SRC).resize({ width: 1080 }).webp({ quality: 88 }).toFile(`${OUT}/hero.webp`)

  console.log(`Logo ${W}x${H}. Assets gerados em ${OUT}/`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
