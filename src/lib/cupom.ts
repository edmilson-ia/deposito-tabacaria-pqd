import type { PedidoAdmin } from '@/hooks/useAdmin'
import { FORMAS_PAGAMENTO } from '@/lib/schemas'
import { formatBRL, NOME_LOJA } from '@/lib/utils'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Monta o HTML do cupom (largura de 80 mm, centralizado; cabe em A4 ou em térmica). */
export function htmlCupom(p: PedidoAdmin): string {
  const numero = p.numero_diario ?? p.id
  const data = new Date(p.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  const desconto = Number(p.desconto) || 0
  const subtotal = p.total - p.taxa_entrega + desconto
  const linhas = p.itens_pedido
    .map(
      (i) =>
        `<tr><td>${i.quantidade}x ${esc(i.nome_produto)}</td><td class="d">${formatBRL(i.quantidade * i.preco_unitario)}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${numero}</title>
<style>
  @page { margin: 4mm; }
  body { font: 13px/1.35 "Courier New", monospace; color: #000; margin: 0; }
  .c { width: 100%; max-width: 80mm; margin: 0 auto; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
  .m { text-align: center; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 1px 0; }
  .d { text-align: right; white-space: nowrap; padding-left: 6px; }
  .t td { font-weight: bold; font-size: 15px; }
</style></head><body><div class="c">
<h1>${esc(NOME_LOJA)}</h1>
<div class="m">PEDIDO #${numero}<br>${data}</div>
<hr>
<div><b>${esc(p.nome_cliente)}</b><br>Tel: ${esc(p.telefone)}<br>${esc(p.endereco)}</div>
<hr>
<table>${linhas}</table>
<hr>
<table>
<tr><td>Subtotal</td><td class="d">${formatBRL(subtotal)}</td></tr>
${desconto > 0 ? `<tr><td>Desconto Pix/dinheiro</td><td class="d">-${formatBRL(desconto)}</td></tr>` : ''}
<tr><td>Entrega${p.distancia_km ? ` (${Number(p.distancia_km).toFixed(1).replace('.', ',')} km)` : ''}</td><td class="d">${p.taxa_entrega > 0 ? formatBRL(p.taxa_entrega) : 'a combinar'}</td></tr>
<tr class="t"><td>TOTAL</td><td class="d">${formatBRL(p.total)}</td></tr>
</table>
<hr>
<div>Pagamento: ${FORMAS_PAGAMENTO[p.forma_pagamento]}${p.troco_para ? `<br>Troco para: ${formatBRL(p.troco_para)}` : ''}</div>
${p.observacoes ? `<hr><div>Obs: ${esc(p.observacoes)}</div>` : ''}
<hr><div class="m">Obrigado pela preferência!</div>
</div></body></html>`
}

/** Abre o cupom numa janela e chama a impressão (impressora padrão do computador). */
export function imprimirCupom(p: PedidoAdmin): boolean {
  const w = window.open('', '_blank', 'width=420,height=700')
  if (!w) return false
  w.document.open()
  w.document.write(htmlCupom(p))
  w.document.close()
  w.focus()
  w.onload = () => w.print()
  setTimeout(() => w.print(), 400)
  return true
}

/**
 * Imprime o cupom sem abrir janela (não é bloqueado como pop-up), usado na impressão automática.
 * O diálogo de impressão do navegador ainda aparece, a menos que o Chrome rode com --kiosk-printing.
 */
export function imprimirCupomAutomatico(p: PedidoAdmin): void {
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  f.srcdoc = htmlCupom(p)
  f.onload = () => {
    f.contentWindow?.focus()
    f.contentWindow?.print()
    setTimeout(() => f.remove(), 60000)
  }
  document.body.appendChild(f)
}
