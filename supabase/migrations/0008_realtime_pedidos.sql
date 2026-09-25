-- =====================================================================
-- 0008 — Aviso em tempo real de pedido novo (impressão automática do talão)
--
-- O painel admin assina INSERT em `pedidos` (Supabase Realtime) e imprime o talão
-- na hora. O Realtime respeita o RLS: só admins recebem os eventos.
-- Idempotente: se a tabela já estiver na publicação, não faz nada.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end $$;
