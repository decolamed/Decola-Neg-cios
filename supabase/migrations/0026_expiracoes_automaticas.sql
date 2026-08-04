-- =============================================================================
-- 0026 — Expiração automática de trial e carência
-- Especificação: Seções 6.5, 6.6, 6.7
--
-- "Se o trial terminar sem pagamento confirmado, a conta entra em modo
-- limitado — nenhum dado é perdido" (6.5).
-- "Se a carência terminar sem pagamento, a conta passa AUTOMATICAMENTE para o
-- modo de acesso limitado" (6.6).
--
-- Nenhuma das duas pode depender de o app estar aberto. Roda como job agendado
-- no próprio banco.
-- =============================================================================

create extension if not exists pg_cron;

-- Cria uma notificação para os Gestores da empresa, sem duplicar avisos do
-- mesmo tipo no mesmo dia.
create or replace function app.notificar_gestores(
  p_empresa uuid,
  p_titulo text,
  p_mensagem text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notificacoes
    where empresa_id = p_empresa
      and categoria = 'assinatura'
      and titulo = p_titulo
      and criado_em > now() - interval '20 hours'
  ) then
    return;
  end if;

  insert into public.notificacoes (empresa_id, categoria, titulo, mensagem, destinatario_id)
  select p_empresa, 'assinatura', p_titulo, p_mensagem, eu.usuario_id
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa
    and eu.status = 'ativo'
    and eu.papel in ('gestor', 'gestor_principal');
end;
$$;

-- -----------------------------------------------------------------------------
-- Job diário. Idempotente: pode rodar quantas vezes for.
-- -----------------------------------------------------------------------------
create or replace function public.processar_assinaturas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assinatura record;
  v_trials_expirados integer := 0;
  v_carencias_expiradas integer := 0;
  v_trocas_aplicadas integer := 0;
  v_avisos integer := 0;
begin
  perform app.marcar_operacao_confiavel();

  -- 1. Trial vencido sem pagamento → modo limitado (Seção 6.5).
  for v_assinatura in
    select * from public.assinaturas
    where status = 'trial' and trial_expira_em is not null and trial_expira_em < now()
  loop
    update public.assinaturas set status = 'modo_limitado' where id = v_assinatura.id;

    perform app.notificar_gestores(
      v_assinatura.empresa_id,
      'Seu período de teste terminou',
      'Sua conta está em modo limitado: você continua consultando seus dados, mas não ' ||
      'registra vendas nem altera estoque até ativar a assinatura. Nenhum dado foi perdido.'
    );

    perform app.registrar_log(
      v_assinatura.empresa_id, 'assinatura.trial_expirado', 'assinatura', v_assinatura.id,
      jsonb_build_object('status', 'trial'), jsonb_build_object('status', 'modo_limitado')
    );

    v_trials_expirados := v_trials_expirados + 1;
  end loop;

  -- 2. Carência vencida sem pagamento → modo limitado (Seção 6.6).
  for v_assinatura in
    select * from public.assinaturas
    where status = 'carencia' and carencia_expira_em is not null and carencia_expira_em < now()
  loop
    update public.assinaturas set status = 'modo_limitado' where id = v_assinatura.id;

    perform app.notificar_gestores(
      v_assinatura.empresa_id,
      'Período de carência encerrado',
      'O pagamento não foi identificado e sua conta entrou em modo limitado. ' ||
      'Regularize para restaurar o acesso completo — seus dados continuam salvos.'
    );

    perform app.registrar_log(
      v_assinatura.empresa_id, 'assinatura.carencia_expirada', 'assinatura', v_assinatura.id,
      jsonb_build_object('status', 'carencia'), jsonb_build_object('status', 'modo_limitado')
    );

    v_carencias_expiradas := v_carencias_expiradas + 1;
  end loop;

  -- 3. Downgrade agendado que chegou ao vencimento (Seção 6.7).
  for v_assinatura in
    select * from public.assinaturas
    where plano_agendado_id is not null and troca_agendada_para <= current_date
  loop
    update public.assinaturas
    set plano_id = v_assinatura.plano_agendado_id,
        valor_contratado = v_assinatura.valor_agendado,
        plano_agendado_id = null,
        troca_agendada_para = null,
        valor_agendado = null
    where id = v_assinatura.id;

    perform app.registrar_log(
      v_assinatura.empresa_id, 'assinatura.downgrade_aplicado', 'assinatura', v_assinatura.id,
      jsonb_build_object('plano_id', v_assinatura.plano_id),
      jsonb_build_object('plano_id', v_assinatura.plano_agendado_id)
    );

    v_trocas_aplicadas := v_trocas_aplicadas + 1;
  end loop;

  -- 4. Aviso de trial próximo do fim (Seção 6.5: "O usuário recebe avisos
  --    próximos ao vencimento do trial").
  for v_assinatura in
    select * from public.assinaturas
    where status = 'trial'
      and trial_expira_em is not null
      and trial_expira_em between now() and now() + interval '3 days'
  loop
    perform app.notificar_gestores(
      v_assinatura.empresa_id,
      'Seu teste gratuito está terminando',
      'Ative a assinatura para continuar registrando vendas e movimentando o estoque sem ' ||
      'interrupção.'
    );
    v_avisos := v_avisos + 1;
  end loop;

  -- 5. Aviso durante a carência (Seção 6.6: "o Gestor recebe notificações
  --    sobre a pendência").
  for v_assinatura in
    select * from public.assinaturas where status = 'carencia'
  loop
    perform app.notificar_gestores(
      v_assinatura.empresa_id,
      'Pagamento pendente',
      'Há um pagamento em aberto. Todas as funcionalidades continuam disponíveis durante a ' ||
      'carência — regularize para não entrar em modo limitado.'
    );
    v_avisos := v_avisos + 1;
  end loop;

  return jsonb_build_object(
    'trials_expirados', v_trials_expirados,
    'carencias_expiradas', v_carencias_expiradas,
    'trocas_aplicadas', v_trocas_aplicadas,
    'avisos_enviados', v_avisos
  );
end;
$$;

-- Somente o backend executa o job — nenhum cliente.
revoke execute on function public.processar_assinaturas() from public, anon, authenticated;
grant execute on function public.processar_assinaturas() to service_role;

-- Agendamento diário às 03:00 UTC (meia-noite em Brasília).
select cron.schedule(
  'processar-assinaturas',
  '0 3 * * *',
  $$select public.processar_assinaturas()$$
);
