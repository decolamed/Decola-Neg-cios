-- =============================================================================
-- 0055 — "O e-mail de acesso saiu?" passa a ter resposta.
--
-- O PIOR DEFEITO DESTE FLUXO É O SILENCIOSO. Quando o pagamento é confirmado, o
-- `asaas-webhook` pede à função `enviar-acesso` o e-mail com o link de "crie sua
-- senha" — o ÚNICO caminho para a conta, porque quem contrata nunca escolheu
-- senha nenhuma.
--
-- Essa chamada pode falhar (Resend fora do ar, chave trocada, domínio do
-- remetente sem verificar) e o webhook engole a falha DE PROPÓSITO: devolver
-- erro ao Asaas faria ele reenviar o evento e reprocessar o pagamento inteiro
-- por causa de um e-mail. A resiliência está certa. O efeito colateral é que
-- ninguém fica sabendo: o cliente pagou, não recebeu nada, e não há onde olhar.
--
-- Esta migração guarda o DESFECHO de cada envio. Não conserta o envio — conserta
-- a cegueira. Com isso, "o Fulano pagou e diz que não recebeu" vira uma consulta
-- em vez de um palpite, e o painel tem de onde tirar um aviso.
--
-- POR QUE AQUI, E NÃO EM `logs_auditoria`: aquela tabela é imutável e por
-- empresa (Seção 9.1); isto é operação da plataforma, por e-mail, e é reescrito
-- a cada tentativa.
-- =============================================================================

alter table public.envios_de_acesso
  add column if not exists ultimo_resultado   text,
  add column if not exists ultimo_erro        text,
  add column if not exists ultimo_sucesso_em  timestamptz,
  add column if not exists falhas_seguidas    integer not null default 0;

comment on column public.envios_de_acesso.ultimo_resultado is
  '"enviado" ou "falhou" — o desfecho da última tentativa de envio.';
comment on column public.envios_de_acesso.falhas_seguidas is
  'Zera a cada envio bem-sucedido. Cresce enquanto o envio continuar falhando.';

/**
 * Registra o desfecho de uma tentativa de envio.
 *
 * A linha é criada se ainda não existir: o envio do webhook não passa pelo freio
 * (`registrar_envio_de_acesso`), justamente para o e-mail de acesso nunca ser
 * barrado — então pode não haver linha nenhuma para este e-mail.
 *
 * A mensagem de erro é cortada: o que interessa é reconhecer a causa, não
 * guardar a resposta inteira de uma API.
 */
create or replace function public.registrar_resultado_de_envio(
  p_email text,
  p_ok    boolean,
  p_erro  text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email = '' then return; end if;

  insert into public.envios_de_acesso (email, ultimo_resultado, ultimo_erro,
                                       ultimo_sucesso_em, falhas_seguidas)
  values (
    v_email,
    case when p_ok then 'enviado' else 'falhou' end,
    case when p_ok then null else left(coalesce(p_erro, ''), 500) end,
    case when p_ok then now() else null end,
    case when p_ok then 0 else 1 end
  )
  on conflict (email) do update set
    ultimo_resultado  = excluded.ultimo_resultado,
    ultimo_erro       = excluded.ultimo_erro,
    ultimo_sucesso_em = coalesce(excluded.ultimo_sucesso_em,
                                 public.envios_de_acesso.ultimo_sucesso_em),
    falhas_seguidas   = case when p_ok then 0
                             else public.envios_de_acesso.falhas_seguidas + 1 end;
end;
$$;

revoke all on function public.registrar_resultado_de_envio(text, boolean, text) from public;
grant execute on function public.registrar_resultado_de_envio(text, boolean, text) to service_role;
