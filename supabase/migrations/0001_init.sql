-- =====================================================================
-- Depósito e Tabacaria do PQD — schema inicial
-- MULTI-TENANT (futuro): cada tabela de negócio ganharia `tenant_id uuid not null`
-- e as policies passariam a filtrar por tenant (ex.: tenant_id = auth.jwt()->>'tenant_id').
-- Os pontos estão marcados abaixo com "-- tenant_id (futuro)". NÃO implementado agora.
-- =====================================================================

-- ---------- Tabelas ----------

create table public.categorias (
  id      bigint generated always as identity primary key,
  -- tenant_id (futuro)
  nome    text not null unique,
  ordem   integer not null default 0
);

create table public.produtos (
  id           bigint generated always as identity primary key,
  -- tenant_id (futuro)
  nome         text not null,
  descricao    text,
  categoria_id bigint references public.categorias(id) on delete set null,
  preco        numeric(10,2) not null check (preco >= 0),
  unidade      text not null default 'un' check (unidade in ('un', 'cx', 'fardo')),
  estoque      integer not null default 0 check (estoque >= 0),
  imagem_url   text,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  -- garante upsert idempotente na importação da planilha
  unique (nome, unidade)
);
create index produtos_categoria_idx on public.produtos (categoria_id);
create index produtos_ativo_idx on public.produtos (ativo);

create table public.clientes (
  id        bigint generated always as identity primary key,
  -- tenant_id (futuro)
  nome      text not null,
  telefone  text not null unique,
  endereco  text
);

create table public.pedidos (
  id              bigint generated always as identity primary key,
  -- tenant_id (futuro)
  cliente_id      bigint references public.clientes(id) on delete set null,
  nome_cliente    text not null,
  telefone        text not null,
  endereco        text not null,
  status          text not null default 'novo'
                    check (status in ('novo', 'confirmado', 'em_entrega', 'entregue', 'cancelado')),
  total           numeric(10,2) not null check (total >= 0),
  taxa_entrega    numeric(10,2) not null default 0,
  forma_pagamento text not null check (forma_pagamento in ('pix', 'dinheiro', 'cartao')),
  troco_para      numeric(10,2),
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()  -- útil para o n8n / auditoria
);
create index pedidos_status_idx on public.pedidos (status, criado_em desc);

create table public.itens_pedido (
  id             bigint generated always as identity primary key,
  -- tenant_id (futuro)
  pedido_id      bigint not null references public.pedidos(id) on delete cascade,
  produto_id     bigint references public.produtos(id) on delete set null,
  nome_produto   text not null,          -- snapshot do nome no momento da compra
  quantidade     integer not null check (quantidade > 0),
  preco_unitario numeric(10,2) not null check (preco_unitario >= 0)
);
create index itens_pedido_pedido_idx on public.itens_pedido (pedido_id);

create table public.configuracoes (
  -- tenant_id (futuro): a chave primária passaria a ser (tenant_id, chave)
  chave  text primary key,
  valor  text not null
);

insert into public.configuracoes (chave, valor) values
  ('nome_loja', 'Depósito e Tabacaria do PQD'),
  ('whatsapp_numero', ''),        -- ex.: 5521999999999 (preencher no admin)
  ('taxa_entrega', '0');

-- Quem é admin (usuários criados em Authentication > Users e inseridos aqui).
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Funções auxiliares ----------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger pedidos_atualizado_em
  before update on public.pedidos
  for each row execute function public.set_atualizado_em();

-- ---------- RLS ----------

alter table public.categorias    enable row level security;
alter table public.produtos      enable row level security;
alter table public.clientes      enable row level security;
alter table public.pedidos       enable row level security;
alter table public.itens_pedido  enable row level security;
alter table public.configuracoes enable row level security;
alter table public.admins        enable row level security;

-- Visitante (anon) e logados: leitura pública do catálogo
create policy "categorias_leitura_publica" on public.categorias
  for select to anon, authenticated using (true);

create policy "produtos_leitura_ativos" on public.produtos
  for select to anon, authenticated using (ativo = true or public.is_admin());

-- Configurações: só chaves públicas para visitantes
create policy "config_leitura_publica" on public.configuracoes
  for select to anon, authenticated
  using (chave in ('nome_loja', 'whatsapp_numero', 'taxa_entrega') or public.is_admin());

-- Admin: CRUD de catálogo
create policy "categorias_admin_escrita" on public.categorias
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "produtos_admin_escrita" on public.produtos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "config_admin_escrita" on public.configuracoes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admin: pedidos (leitura e atualização; anon NÃO lê nem escreve direto)
create policy "pedidos_admin_leitura" on public.pedidos
  for select to authenticated using (public.is_admin());
create policy "pedidos_admin_update" on public.pedidos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "itens_admin_leitura" on public.itens_pedido
  for select to authenticated using (public.is_admin());

create policy "clientes_admin_leitura" on public.clientes
  for select to authenticated using (public.is_admin());

-- admins: cada usuário só enxerga a própria linha (para o frontend checar o papel)
create policy "admins_ver_proprio" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------- RPC: criar pedido (único caminho de escrita do visitante) ----------
-- payload esperado:
-- { "nome": "...", "telefone": "...", "endereco": "...", "forma_pagamento": "pix|dinheiro|cartao",
--   "troco_para": 100, "observacoes": "...",
--   "itens": [ { "produto_id": 1, "quantidade": 2 } ] }
-- Preços e total são SEMPRE recalculados aqui a partir da tabela produtos.
create or replace function public.criar_pedido(payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome      text := btrim(coalesce(payload->>'nome', ''));
  v_telefone  text := regexp_replace(coalesce(payload->>'telefone', ''), '\D', '', 'g');
  v_endereco  text := btrim(coalesce(payload->>'endereco', ''));
  v_pgto      text := payload->>'forma_pagamento';
  v_troco     numeric(10,2) := nullif(payload->>'troco_para', '')::numeric;
  v_obs       text := nullif(btrim(coalesce(payload->>'observacoes', '')), '');
  v_itens     jsonb := payload->'itens';
  v_taxa      numeric(10,2) := 0;
  v_subtotal  numeric(10,2) := 0;
  v_cliente   bigint;
  v_pedido    bigint;
  v_item      jsonb;
  v_prod      public.produtos%rowtype;
  v_qtd       integer;
begin
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'Nome inválido';
  end if;
  if length(v_telefone) < 10 or length(v_telefone) > 13 then
    raise exception 'Telefone inválido';
  end if;
  if length(v_endereco) < 5 or length(v_endereco) > 300 then
    raise exception 'Endereço inválido';
  end if;
  if v_pgto is null or v_pgto not in ('pix', 'dinheiro', 'cartao') then
    raise exception 'Forma de pagamento inválida';
  end if;
  if v_troco is not null and (v_pgto <> 'dinheiro' or v_troco <= 0) then
    v_troco := null;
  end if;
  if v_obs is not null and length(v_obs) > 500 then
    raise exception 'Observações muito longas';
  end if;
  if v_itens is null or jsonb_typeof(v_itens) <> 'array'
     or jsonb_array_length(v_itens) < 1 or jsonb_array_length(v_itens) > 60 then
    raise exception 'Carrinho vazio ou inválido';
  end if;

  select coalesce(nullif(valor, '')::numeric, 0) into v_taxa
    from public.configuracoes where chave = 'taxa_entrega';
  v_taxa := coalesce(v_taxa, 0);

  -- 1ª passada: valida itens e soma o subtotal com preços do banco
  for v_item in select * from jsonb_array_elements(v_itens) loop
    v_qtd := (v_item->>'quantidade')::integer;
    if v_qtd is null or v_qtd < 1 or v_qtd > 999 then
      raise exception 'Quantidade inválida';
    end if;
    select * into v_prod from public.produtos
      where id = (v_item->>'produto_id')::bigint and ativo = true;
    if not found then
      raise exception 'Produto indisponível';
    end if;
    if v_prod.estoque < v_qtd then
      raise exception 'Sem estoque suficiente: %', v_prod.nome;
    end if;
    v_subtotal := v_subtotal + v_prod.preco * v_qtd;
  end loop;

  insert into public.clientes (nome, telefone, endereco)
    values (v_nome, v_telefone, v_endereco)
    on conflict (telefone) do update set nome = excluded.nome, endereco = excluded.endereco
    returning id into v_cliente;

  insert into public.pedidos
    (cliente_id, nome_cliente, telefone, endereco, status, total, taxa_entrega,
     forma_pagamento, troco_para, observacoes)
    values (v_cliente, v_nome, v_telefone, v_endereco, 'novo', v_subtotal + v_taxa, v_taxa,
            v_pgto, v_troco, v_obs)
    returning id into v_pedido;

  -- 2ª passada: grava itens (snapshot de nome e preço)
  for v_item in select * from jsonb_array_elements(v_itens) loop
    select * into v_prod from public.produtos where id = (v_item->>'produto_id')::bigint;
    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
      values (v_pedido, v_prod.id, v_prod.nome, (v_item->>'quantidade')::integer, v_prod.preco);
  end loop;

  return v_pedido;
end;
$$;

revoke all on function public.criar_pedido(jsonb) from public;
grant execute on function public.criar_pedido(jsonb) to anon, authenticated;

-- ---------- Storage: bucket público 'produtos' (escrita só admin) ----------

insert into storage.buckets (id, name, public)
  values ('produtos', 'produtos', true)
  on conflict (id) do nothing;

create policy "produtos_imagens_leitura" on storage.objects
  for select to anon, authenticated using (bucket_id = 'produtos');

create policy "produtos_imagens_admin_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'produtos' and public.is_admin());
create policy "produtos_imagens_admin_update" on storage.objects
  for update to authenticated using (bucket_id = 'produtos' and public.is_admin());
create policy "produtos_imagens_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'produtos' and public.is_admin());

-- ---------- n8n ----------
-- Configure um Database Webhook (Supabase > Database > Webhooks) em INSERT de public.pedidos.
-- Veja o README para o payload. Sem polling.
