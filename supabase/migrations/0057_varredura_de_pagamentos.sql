-- ============================================================================
-- 0057 — A varredura que tira o acesso da dependência exclusiva do webhook.
--
-- POR QUE ISTO EXISTE. Em 13/09 um cliente pagou R$ 5,00 por Pix, o Asaas
-- confirmou, mandou o recibo — e nunca chamou o nosso webhook. Zero requisições
-- em 24 horas. A assinatura seguiu `pendente_pagamento` e o produto pediu
-- pagamento de novo a quem já tinha pago.
--
-- O defeito não era o webhook estar desconfigurado: era o acesso depender
-- EXCLUSIVAMENTE dele. Webhook é entrega de terceiro — pode não estar
-- cadastrado, pode ser apagado por engano, pode esgotar as retentativas. Cada
-- vez que isso acontece, alguém paga e não entra, calado.
--
-- Esta varredura pergunta ao Asaas, de tempos em tempos, se as assinaturas
-- paradas esperando pagamento já foram pagas. Não depende de ninguém abrir tela
-- nenhuma: quem paga de madrugada e fecha tudo encontra a conta liberada e o
-- e-mail com o link da senha esperando.
--
-- O SEGREDO NÃO MORA AQUI. A chave de serviço vem do Vault em tempo de
-- execução; este arquivo vai para o Git e nunca pode carregá-la. Os dois
-- segredos são gravados uma vez, fora daqui:
--
--   select vault.create_secret('https://<projeto>.supabase.co', 'url_do_projeto');
--   select vault.create_secret('<service_role_key>', 'chave_de_servico');
--
-- Sem eles a função avisa e não faz nada — nunca derruba o cron.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- Dispara a Edge Function `conferir-pagamento` em modo varredura.
--
-- `net.http_post` é assíncrono: enfileira e volta. A varredura pode demorar
-- (uma chamada ao Asaas por cobrança pendente) e segurar o cron por isso seria
-- prender uma conexão do banco à latência de um terceiro.
-- ----------------------------------------------------------------------------
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

  return extensions.net.http_post(
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

-- Somente o backend executa — nenhum cliente.
revoke execute on function public.varrer_pagamentos() from public, anon, authenticated;
grant execute on function public.varrer_pagamentos() to service_role;

-- ----------------------------------------------------------------------------
-- De 15 em 15 minutos.
--
-- O ritmo é o da paciência de quem acabou de pagar: Pix confirma em segundos, e
-- quinze minutos é o pior caso de espera para alguém que pagou e ficou olhando
-- a tela. O caminho rápido continua sendo o webhook (instantâneo) e, logo
-- atrás, a conferência que a própria tela de pagamento faz. Esta varredura é a
-- terceira rede, a que funciona quando as duas primeiras não funcionam.
-- ----------------------------------------------------------------------------
select cron.unschedule('varrer-pagamentos')
where exists (select 1 from cron.job where jobname = 'varrer-pagamentos');

select cron.schedule(
  'varrer-pagamentos',
  '*/15 * * * *',
  $$select public.varrer_pagamentos()$$
);
