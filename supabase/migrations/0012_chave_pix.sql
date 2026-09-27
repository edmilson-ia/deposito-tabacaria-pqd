-- =====================================================================
-- 0012 — Chave Pix da loja (mostrada ao cliente no checkout)
--
-- Nova chave pública em `configuracoes`: `chave_pix`. O admin edita em
-- Configurações; se estiver vazia, o cliente não vê o bloco da chave Pix
-- ao escolher "Pix" como forma de pagamento (sem mostrar campo em branco).
-- =====================================================================

insert into public.configuracoes (chave, valor)
values ('chave_pix', '52129912000161')
on conflict (chave) do nothing;

drop policy if exists "config_leitura_publica" on public.configuracoes;
create policy "config_leitura_publica" on public.configuracoes
  for select to anon, authenticated
  using (
    chave in ('nome_loja', 'whatsapp_numero', 'taxa_entrega', 'grupo_promocao_url', 'frete_faixas', 'frete_km_extra', 'chave_pix')
    or public.is_admin()
  );
