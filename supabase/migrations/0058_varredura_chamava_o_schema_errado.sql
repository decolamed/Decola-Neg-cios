-- ============================================================================
-- 0058 — A varredura apontava para um schema que não existe.
--
-- A 0057 chamava `extensions.net.http_post`. O `pg_net` é INSTALADO no schema
-- `extensions`, mas cria suas funções no schema `net` — então aquele nome tinha
-- três partes, e o Postgres lê três partes como banco.schema.função:
--
--   ERROR: cross-database references are not implemented
--
-- O erro só aparecia na hora de disparar de verdade. Enquanto faltava o segredo
-- do Vault, a função saía antes por outro caminho e devolvia nulo — o que eu li
-- como "inerte e segura". Estava inerte pelo motivo errado, e o defeito ficou
-- escondido atrás da própria checagem que eu usei para dizer que estava tudo
-- bem. Uma verificação que nunca chega à linha que importa não verificou nada.
-- ============================================================================

create or replace function public.varrer_pagamentos()
returns bigint
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_chave text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'url_do_projeto';

  select decrypted_secret into v_chave
    from vault.decrypted_secrets where name = 'chave_de_servico';

  if v_url is null or v_chave is null then
    raise warning 'varrer_pagamentos: segredos do Vault ausentes (url_do_projeto/chave_de_servico).';
    return null;
  end if;

  -- `net.http_post`, e não `extensions.net.http_post`: ver o cabeçalho.
  return net.http_post(
    url := v_url || '/functions/v1/conferir-pagamento',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_chave
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.varrer_pagamentos() from public, anon, authenticated;
grant execute on function public.varrer_pagamentos() to service_role;
