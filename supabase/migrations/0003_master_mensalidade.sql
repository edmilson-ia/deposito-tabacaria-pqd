-- =====================================================================
-- 0003 — Painel MASTER (dono do sistema) + mensalidade
-- Requer a 0002 aplicada antes.
--
-- Ideia:
--  * O cliente (admin da loja) NÃO controla nada disso. Quem controla é o "superadmin" (você),
--    um papel separado guardado na tabela `superadmins`.
--  * Plano 'teste'  : vale até `valido_ate`; passou disso => pausa novos pedidos.
--    Plano 'mensal' : vale até `valido_ate` (vencimento) + `carencia_dias` de tolerância;
--                     passou disso => TRAVA SOZINHO (avaliado em cada pedido, sem cron/tarefa agendada).
--    Plano 'isento' : sem cobrança (nunca vence).
--    `bloqueada`    : bloqueio manual imediato, independente de datas.
--  * Voltar a funcionar exige AÇÃO SUA: registrar pagamento, definir novo vencimento ou liberar.
--  * NADA é apagado: catálogo, fotos e pedidos ficam; o admin da loja continua abrindo e exportando.
--  * Tudo é feito por funções `master_*` que checam `is_superadmin()` no servidor.
--    A tabela `licenca` continua sem nenhuma policy (ninguém a lê/escreve direto).
-- MULTI-TENANT (futuro): licenca/superadmins ganhariam tenant_id (uma licença por cliente).
-- =====================================================================

do $$
begin
  if to_regclass('public.licenca') is null then
    raise exception 'Aplique antes a migration 0002_licenca_teste.sql';
  end if;
end $$;

-- ---------- Papel superadmin ----------
create table if not exists public.superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.superadmins enable row level security;

drop policy if exists "superadmins_ver_proprio" on public.superadmins;
create policy "superadmins_ver_proprio" on public.superadmins
  for select to authenticated using (user_id = (select auth.uid()));
-- (sem policy de insert/update/delete: só você, pelo SQL Editor, cria um superadmin)

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.superadmins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- ---------- Colunas novas da licença ----------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'licenca' and column_name = 'teste_ate') then
    alter table public.licenca rename column teste_ate to valido_ate;
  end if;
end $$;

alter table public.licenca
  add column if not exists plano text not null default 'teste',
  add column if not exists carencia_dias integer not null default 3,
  add column if not exists bloqueada boolean not null default false,
  add column if not exists motivo_bloqueio text,
  add column if not exists cliente_nome text,
  add column if not exists valor_mensal numeric(10,2),
  add column if not exists ultimo_pagamento_em timestamptz,
  add column if not exists atualizado_em timestamptz not null default now();

do $$
begin
  alter table public.licenca add constraint licenca_plano_check check (plano in ('teste', 'mensal', 'isento'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.licenca add constraint licenca_carencia_check check (carencia_dias between 0 and 60);
exception when duplicate_object then null;
end $$;

-- ---------- Histórico (auditoria de pagamentos e mudanças) ----------
create table if not exists public.licenca_historico (
  id              bigint generated always as identity primary key,
  criado_em       timestamptz not null default now(),
  acao            text not null,
  dias            integer,
  valor           numeric(10,2),
  valido_ate_novo timestamptz,
  observacao      text,
  por             uuid
);
alter table public.licenca_historico enable row level security;
revoke all on public.licenca_historico from anon, authenticated;

-- ---------- Regra de liberação (usada por criar_pedido) ----------
create or replace function public.loja_liberada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not l.bloqueada
       and (
         l.plano = 'isento'
         or l.valido_ate is null
         or now() <= l.valido_ate + make_interval(days => case when l.plano = 'mensal' then l.carencia_dias else 0 end)
       )
    from public.licenca l where l.id = 1
  ), true);
$$;
revoke all on function public.loja_liberada() from public;

-- ---------- Estado público (só o necessário para o site; SEM motivo do bloqueio nem valores) ----------
create or replace function public.estado_licenca()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'ativa',          public.loja_liberada(),
    'plano',          coalesce(l.plano, 'teste'),
    'em_teste',       coalesce(l.plano = 'teste' and l.valido_ate is not null and l.valido_ate > now() and not l.bloqueada, false),
    'bloqueada',      coalesce(l.bloqueada, false),
    'em_carencia',    coalesce(l.plano = 'mensal' and l.valido_ate is not null and now() > l.valido_ate
                               and now() <= l.valido_ate + make_interval(days => l.carencia_dias) and not l.bloqueada, false),
    'valido_ate',     case when coalesce(l.plano, 'teste') = 'isento' then null else l.valido_ate end,
    'dias_restantes', case when l.valido_ate is null or l.plano = 'isento' then null
                           else greatest(0, ceil(extract(epoch from (l.valido_ate - now())) / 86400))::int end
  )
  from (select 1) x
  left join public.licenca l on l.id = 1;
$$;
revoke all on function public.estado_licenca() from public;
grant execute on function public.estado_licenca() to anon, authenticated;

-- ---------- Funções MASTER (só superadmin) ----------
create or replace function public.master_exigir()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.master_exigir() from public;

create or replace function public.master_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.master_exigir();
  return (
    select jsonb_build_object(
      'licenca',   to_jsonb(l),
      'estado',    public.estado_licenca(),
      'historico', coalesce((select jsonb_agg(to_jsonb(h) order by h.criado_em desc, h.id desc)
                             from (select * from public.licenca_historico order by criado_em desc, id desc limit 60) h), '[]'::jsonb)
    )
    from public.licenca l where l.id = 1
  );
end;
$$;

create or replace function public.master_registrar_pagamento(p_dias integer default 30, p_valor numeric default null, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_novo timestamptz;
begin
  perform public.master_exigir();
  if p_dias is null or p_dias < 1 or p_dias > 366 then
    raise exception 'Informe de 1 a 366 dias.';
  end if;
  -- Paga em dia: soma ao vencimento atual. Pagou atrasado: conta a partir de hoje.
  update public.licenca
     set plano = 'mensal',
         valido_ate = greatest(coalesce(valido_ate, now()), now()) + make_interval(days => p_dias),
         bloqueada = false, motivo_bloqueio = null,
         ultimo_pagamento_em = now(), atualizado_em = now()
   where id = 1
   returning valido_ate into v_novo;
  insert into public.licenca_historico (acao, dias, valor, valido_ate_novo, observacao, por)
    values ('pagamento', p_dias, coalesce(p_valor, (select valor_mensal from public.licenca where id = 1)), v_novo, nullif(btrim(coalesce(p_obs, '')), ''), (select auth.uid()));
  return public.master_estado();
end;
$$;

create or replace function public.master_iniciar_teste(p_dias integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_novo timestamptz;
begin
  perform public.master_exigir();
  if p_dias is null or p_dias < 1 or p_dias > 90 then
    raise exception 'Informe de 1 a 90 dias.';
  end if;
  update public.licenca
     set plano = 'teste', valido_ate = now() + make_interval(days => p_dias),
         bloqueada = false, motivo_bloqueio = null, atualizado_em = now()
   where id = 1
   returning valido_ate into v_novo;
  insert into public.licenca_historico (acao, dias, valido_ate_novo, por)
    values ('teste_iniciado', p_dias, v_novo, (select auth.uid()));
  return public.master_estado();
end;
$$;

create or replace function public.master_definir_vencimento(p_valido_ate timestamptz, p_carencia integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.master_exigir();
  if p_carencia is not null and (p_carencia < 0 or p_carencia > 60) then
    raise exception 'A carência deve ficar entre 0 e 60 dias.';
  end if;
  update public.licenca
     set valido_ate = p_valido_ate,
         carencia_dias = coalesce(p_carencia, carencia_dias),
         atualizado_em = now()
   where id = 1;
  insert into public.licenca_historico (acao, valido_ate_novo, observacao, por)
    values ('vencimento_alterado', p_valido_ate,
            case when p_carencia is null then null else 'carência: ' || p_carencia || ' dias' end, (select auth.uid()));
  return public.master_estado();
end;
$$;

create or replace function public.master_definir_plano(p_plano text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.master_exigir();
  if p_plano is null or p_plano not in ('teste', 'mensal', 'isento') then
    raise exception 'Plano inválido.';
  end if;
  update public.licenca set plano = p_plano, atualizado_em = now() where id = 1;
  insert into public.licenca_historico (acao, observacao, por) values ('plano_alterado', p_plano, (select auth.uid()));
  return public.master_estado();
end;
$$;

create or replace function public.master_bloquear(p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.master_exigir();
  update public.licenca
     set bloqueada = true, motivo_bloqueio = nullif(btrim(coalesce(p_motivo, '')), ''), atualizado_em = now()
   where id = 1;
  insert into public.licenca_historico (acao, observacao, por)
    values ('bloqueio', nullif(btrim(coalesce(p_motivo, '')), ''), (select auth.uid()));
  return public.master_estado();
end;
$$;

-- Remove só o bloqueio manual. Se a licença estiver vencida, ela continua travada até você
-- registrar pagamento ou definir novo vencimento.
create or replace function public.master_liberar()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.master_exigir();
  update public.licenca set bloqueada = false, motivo_bloqueio = null, atualizado_em = now() where id = 1;
  insert into public.licenca_historico (acao, por) values ('liberacao_manual', (select auth.uid()));
  return public.master_estado();
end;
$$;

create or replace function public.master_definir_cliente(p_nome text, p_valor numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.master_exigir();
  if p_valor is not null and (p_valor < 0 or p_valor > 100000) then
    raise exception 'Valor inválido.';
  end if;
  update public.licenca
     set cliente_nome = nullif(btrim(coalesce(p_nome, '')), ''), valor_mensal = p_valor, atualizado_em = now()
   where id = 1;
  insert into public.licenca_historico (acao, valor, por) values ('cliente_atualizado', p_valor, (select auth.uid()));
  return public.master_estado();
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'master_estado()', 'master_registrar_pagamento(integer, numeric, text)', 'master_iniciar_teste(integer)',
    'master_definir_vencimento(timestamptz, integer)', 'master_definir_plano(text)', 'master_bloquear(text)',
    'master_liberar()', 'master_definir_cliente(text, numeric)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- COMO TORNAR VOCÊ O SUPERADMIN (uma vez, no SQL Editor):
--   1) Authentication → Users → Add user (SEU e-mail e senha, Auto Confirm). Use uma conta
--      DIFERENTE da do dono da loja.
--   2) insert into public.superadmins (user_id) select id from auth.users where email = 'voce@email.com';
--   3) Acesse /master e entre.
-- ---------------------------------------------------------------------
