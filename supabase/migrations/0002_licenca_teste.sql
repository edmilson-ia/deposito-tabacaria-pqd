-- =====================================================================
-- Período de teste (licença) — 0002
-- Regras:
--  * teste_ate NULL           => sem prazo (loja liberada). É o estado inicial: nada trava por engano.
--  * teste_ate no futuro      => em teste (o painel mostra os dias restantes)
--  * teste_ate no passado     => teste encerrado: NOVOS pedidos são recusados pelo servidor.
--  * Nada é apagado: catálogo, produtos, fotos, pedidos e o painel admin continuam funcionando
--    (o cliente pode ver e exportar tudo).
--  * Só quem tem acesso ao banco (você, pelo SQL Editor / service role) altera o prazo.
--    O admin da loja NÃO consegue: a tabela não tem nenhuma policy de escrita para ele.
-- MULTI-TENANT (futuro): esta tabela teria uma linha por tenant (tenant_id no lugar de id = 1).
-- =====================================================================

create table if not exists public.licenca (
  id          integer primary key default 1 check (id = 1),  -- linha única
  teste_ate   timestamptz,
  iniciado_em timestamptz,
  observacao  text
);

insert into public.licenca (id) values (1) on conflict (id) do nothing;

alter table public.licenca enable row level security;
-- Sem policies de propósito: anon e authenticated não leem nem escrevem direto na tabela.
revoke all on public.licenca from anon, authenticated;

-- ---------- Estado da licença (o site consulta isto; a hora é a do SERVIDOR) ----------
create or replace function public.estado_licenca()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ativa',          coalesce(l.teste_ate is null or l.teste_ate > now(), true),
    'em_teste',       coalesce(l.teste_ate is not null and l.teste_ate > now(), false),
    'teste_ate',      l.teste_ate,
    'dias_restantes', case when l.teste_ate is null then null
                           else greatest(0, ceil(extract(epoch from (l.teste_ate - now())) / 86400))::int end
  )
  from (select 1) x
  left join public.licenca l on l.id = 1;
$$;

create or replace function public.loja_liberada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select teste_ate is null or teste_ate > now() from public.licenca where id = 1), true);
$$;

revoke all on function public.estado_licenca() from public;
revoke all on function public.loja_liberada() from public;
grant execute on function public.estado_licenca() to anon, authenticated;

-- ---------- criar_pedido: agora recusa pedido novo com o teste encerrado ----------
-- (igual à versão de 0001, acrescentando a verificação no início)
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
  if not public.loja_liberada() then
    raise exception 'A loja está temporariamente sem receber novos pedidos.';
  end if;

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

  for v_item in select * from jsonb_array_elements(v_itens) loop
    select * into v_prod from public.produtos where id = (v_item->>'produto_id')::bigint;
    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
      values (v_pedido, v_prod.id, v_prod.nome, (v_item->>'quantidade')::integer, v_prod.preco);
  end loop;

  return v_pedido;
end;
$$;

-- ---------------------------------------------------------------------
-- COMANDOS DE USO (rode no SQL Editor quando precisar):
--
--  Iniciar o teste de 7 dias a partir de AGORA:
--    update public.licenca set teste_ate = now() + interval '7 days', iniciado_em = now() where id = 1;
--
--  Prorrogar mais 7 dias:
--    update public.licenca set teste_ate = greatest(teste_ate, now()) + interval '7 days' where id = 1;
--
--  Liberar de vez (fim do teste, cliente pagou):
--    update public.licenca set teste_ate = null where id = 1;
--
--  Encerrar o teste agora (pausar novos pedidos):
--    update public.licenca set teste_ate = now() where id = 1;
--
--  Ver o estado:
--    select public.estado_licenca();
-- ---------------------------------------------------------------------
