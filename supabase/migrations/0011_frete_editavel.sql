-- =====================================================================
-- 0011 — Tabela de frete por distância editável pela loja (painel > Loja)
--
-- 1) Duas chaves novas em `configuracoes`, lidas pelo site (públicas) e editadas pelo admin:
--      frete_faixas   -> JSON [{"ate":3,"valor":5},{"ate":4,"valor":6},{"ate":7,"valor":7}]
--      frete_km_extra -> R$ por km inteiro além da última faixa
--    (a policy de leitura pública é uma lista de chaves: sem incluí-las aqui, o site não as enxerga)
-- 2) criar_pedido passa a aceitar taxa a partir de R$ 1,00 (antes o mínimo era R$ 5,00),
--    para a loja poder cadastrar faixas mais baratas. Teto continua R$ 500,00.
-- Mesma assinatura da função: `create or replace` mantém as permissões.
-- =====================================================================

insert into public.configuracoes (chave, valor) values
  ('frete_faixas', '[{"ate":3,"valor":5},{"ate":4,"valor":6},{"ate":7,"valor":7}]'),
  ('frete_km_extra', '1')
on conflict (chave) do nothing;

drop policy if exists "config_leitura_publica" on public.configuracoes;
create policy "config_leitura_publica" on public.configuracoes
  for select to anon, authenticated
  using (
    chave in ('nome_loja', 'whatsapp_numero', 'taxa_entrega', 'grupo_promocao_url', 'frete_faixas', 'frete_km_extra')
    or public.is_admin()
  );

create or replace function public.criar_pedido(payload jsonb)
returns jsonb
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
  v_taxa_km   numeric(10,2) := nullif(payload->>'taxa_entrega', '')::numeric;
  v_km        numeric(6,2)  := nullif(payload->>'distancia_km', '')::numeric;
  v_subtotal  numeric(10,2) := 0;
  v_desc      numeric(10,2) := 0;
  v_cliente   bigint;
  v_pedido    bigint;
  v_numero    integer;
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

  -- Frete por km calculado no n8n (OpenRouteService). Só é aceito dentro de limites
  -- plausíveis (mínimo R$ 5,00 da tabela, máximo R$ 500); fora disso vale a taxa da loja.
  -- LIMITE CONHECIDO: o servidor não recalcula a distância, então quem adulterar a requisição
  -- consegue pagar o frete mínimo. O pedido é confirmado por um atendente no WhatsApp.
  if v_taxa_km is not null and v_taxa_km >= 1 and v_taxa_km <= 500 then
    v_taxa := round(v_taxa_km, 2);
  else
    v_km := null;
  end if;

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

  -- Pix ou dinheiro: desconto à vista de 1/1,1 (≈ 9,09%) sobre o valor dos produtos, o que devolve
  -- o valor sem o acréscimo de 10% dos preços de vitrine (preços do site = preço no cartão).
  -- A entrega não entra na conta. Calculado aqui no servidor.
  if v_pgto in ('pix', 'dinheiro') then
    v_desc := round(v_subtotal - v_subtotal / 1.10, 2);
  end if;

  insert into public.clientes (nome, telefone, endereco)
    values (v_nome, v_telefone, v_endereco)
    on conflict (telefone) do update set nome = excluded.nome, endereco = excluded.endereco
    returning id into v_cliente;

  -- Trava a tabela por um instante só pra calcular o próximo número do dia sem duas
  -- inserções ao mesmo tempo pegarem o mesmo número (pedido é raro o bastante pra
  -- isso não pesar em nada).
  lock table public.pedidos in share row exclusive mode;
  select coalesce(max(numero_diario), 1000) + 1 into v_numero
    from public.pedidos
    where (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;

  insert into public.pedidos
    (cliente_id, nome_cliente, telefone, endereco, status, total, taxa_entrega,
     forma_pagamento, troco_para, observacoes, numero_diario, distancia_km, desconto)
    values (v_cliente, v_nome, v_telefone, v_endereco, 'novo', v_subtotal - v_desc + v_taxa, v_taxa,
            v_pgto, v_troco, v_obs, v_numero, v_km, v_desc)
    returning id into v_pedido;

  for v_item in select * from jsonb_array_elements(v_itens) loop
    select * into v_prod from public.produtos where id = (v_item->>'produto_id')::bigint;
    insert into public.itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario)
      values (v_pedido, v_prod.id, v_prod.nome, (v_item->>'quantidade')::integer, v_prod.preco);
  end loop;

  return jsonb_build_object('id', v_pedido, 'numero_diario', v_numero);
end;
$$;

revoke all on function public.criar_pedido(jsonb) from public;
grant execute on function public.criar_pedido(jsonb) to anon, authenticated;
