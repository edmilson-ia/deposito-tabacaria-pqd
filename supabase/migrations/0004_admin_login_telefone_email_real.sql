-- =====================================================================
-- 0004 — Login do admin por telefone + recuperação de senha por e-mail real
--
-- Antes: o telefone virava direto o e-mail interno `<telefone>@admin.example.com`,
-- um domínio que não recebe e-mail nenhum (por isso não dava para recuperar senha).
--
-- Agora: o telefone fica guardado em `admins.telefone`, separado do e-mail da conta.
-- No login, o telefone é traduzido para o e-mail real da conta por esta função no
-- servidor (`email_login_por_telefone`) — o e-mail da conta pode ser trocado a
-- qualquer momento (Authentication → Users → editar e-mail) sem mexer em código,
-- e a recuperação de senha (`esqueci a senha`) passa a mandar e-mail de verdade.
-- =====================================================================

alter table public.admins add column if not exists telefone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'admins_telefone_unico') then
    alter table public.admins add constraint admins_telefone_unico unique (telefone);
  end if;
end $$;

create or replace function public.email_login_por_telefone(p_telefone text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.admins a
  join auth.users u on u.id = a.user_id
  where a.telefone = (
    case
      when length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) >= 12
           and regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') like '55%'
        then substring(regexp_replace(p_telefone, '\D', '', 'g') from 3)
      else regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')
    end
  )
  limit 1;
$$;

revoke all on function public.email_login_por_telefone(text) from public;
grant execute on function public.email_login_por_telefone(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Depois de rodar esta migration, vincule o telefone da conta já existente:
--   update public.admins set telefone = '21986580480' where user_id = '<user_id do admin>';
--
-- Teste rápido:
--   select public.email_login_por_telefone('21986580480');
--   -- deve devolver o e-mail cadastrado nessa conta (hoje ainda o e-mail antigo
--   -- @admin.example.com; assim que trocar para um e-mail real no painel, este
--   -- comando já devolve o novo, sem precisar mudar nada aqui).
-- ---------------------------------------------------------------------
