import { supabase } from './supabase'

const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_ENTRADA = 8 * 1024 * 1024 // 8 MB antes de redimensionar
const LADO_MAX = 900

/** Redimensiona (lado maior 900px) e converte para WebP. Aceita .jfif (é JPEG). */
async function prepararImagem(arquivo: File): Promise<Blob> {
  const tipoOk = TIPOS.includes(arquivo.type) || /\.(jfif|jpe?g|png|webp)$/i.test(arquivo.name)
  if (!tipoOk) throw new Error('Formato não suportado. Use JPG, PNG ou WebP.')
  if (arquivo.size > MAX_ENTRADA) throw new Error('Imagem muito grande (máximo 8 MB).')

  const bmp = await createImageBitmap(arquivo).catch(() => {
    throw new Error('Não foi possível ler a imagem. O arquivo pode estar corrompido.')
  })
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // PNG com transparência vira fundo branco
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao converter a imagem.'))), 'image/webp', 0.85),
  )
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'produto'

/** Envia para o bucket público `produtos` e devolve a URL pública. */
export async function enviarImagemProduto(arquivo: File, nomeProduto: string): Promise<string> {
  const blob = await prepararImagem(arquivo)
  const caminho = `${slug(nomeProduto)}-${Date.now()}.webp`
  const { error } = await supabase.storage.from('produtos').upload(caminho, blob, {
    contentType: 'image/webp',
    cacheControl: '31536000',
  })
  if (error) throw new Error('Não foi possível enviar a imagem (verifique se você é admin).')
  return supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
}
