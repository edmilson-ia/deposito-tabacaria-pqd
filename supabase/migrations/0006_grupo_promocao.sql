-- =====================================================================
-- 0006 — Link do grupo de promoção no WhatsApp
--
-- Nova chave pública em `configuracoes`: `grupo_promocao_url`. O admin edita
-- em Configurações; se estiver vazia, o botão "Promoção" some sozinho da home
-- (não aparece um botão quebrado).
-- =====================================================================

insert into public.configuracoes (chave, valor)
values ('grupo_promocao_url', '')
on conflict (chave) do nothing;

drop policy if exists "config_leitura_publica" on public.configuracoes;
create policy "config_leitura_publica" on public.configuracoes
  for select to anon, authenticated
  using (chave in ('nome_loja', 'whatsapp_numero', 'taxa_entrega', 'grupo_promocao_url') or public.is_admin());
