-- =============================================================================
-- Controle de envio dos e-mails de acesso
--
-- POR QUE ESTA TABELA EXISTE
--
-- Os e-mails de primeiro acesso e de redefinição de senha deixaram de sair
-- pelo Supabase Auth e passaram a sair pela Edge Function `enviar-acesso`,
-- que usa o Resend. O motivo está em três limitações que não davam para
-- resolver por código:
--
--   1. o remetente era `noreply@mail.app.supabase.io`, e trocá-lo exige SMTP
--      configurado no painel — que, medido nos logs, nunca chegou a valer;
--   2. o corpo do e-mail era o template padrão, em inglês;
--   3. o Auth impõe um teto baixo de envios por hora quando usa o SMTP dele.
--
-- Saindo pelo nosso lado, os três somem. Mas some junto uma proteção: o
-- endpoint precisa aceitar chamada de quem NÃO tem sessão (é o caso de
-- "esqueci minha senha"), e um endpoint aberto que dispara e-mail é um
-- convite a usar o sistema para incomodar terceiros.
--
-- Daí esta tabela: uma linha por e-mail, com o instante do último envio.
-- Ninguém além do servidor a enxerga.
-- =============================================================================

create table public.envios_de_acesso (
  email        text primary key,
  ultimo_envio timestamptz not null default now(),
  total        integer     not null default 1
);

comment on table public.envios_de_acesso is
  'Freio do endpoint de e-mail de acesso. Guarda apenas o e-mail e o instante '
  'do último envio — nunca token, link ou conteúdo.';

alter table public.envios_de_acesso enable row level security;

-- Sem política nenhuma e sem grant: nem `anon` nem `authenticated` leem ou
-- escrevem. A tabela existe só para a Edge Function, que usa a service key.
revoke all on public.envios_de_acesso from anon, authenticated;
grant select, insert, update on public.envios_de_acesso to service_role;

-- -----------------------------------------------------------------------------
-- O freio.
--
-- Devolve `true` quando o envio pode acontecer, e já registra a tentativa —
-- checar e marcar em chamadas separadas abriria uma janela para duas
-- requisições simultâneas passarem juntas.
--
-- 60 segundos é o suficiente para conter repetição automática sem atrapalhar
-- quem legitimamente errou o e-mail e tentou de novo.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_envio_de_acesso(p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_ultimo timestamptz;
begin
  select ultimo_envio into v_ultimo
  from public.envios_de_acesso where email = v_email for update;

  if found and v_ultimo > now() - interval '60 seconds' then
    return false;
  end if;

  insert into public.envios_de_acesso (email)
  values (v_email)
  on conflict (email) do update
    set ultimo_envio = now(), total = public.envios_de_acesso.total + 1;

  return true;
end;
$$;

revoke execute on function public.registrar_envio_de_acesso(text)
  from public, anon, authenticated;
grant  execute on function public.registrar_envio_de_acesso(text) to service_role;
