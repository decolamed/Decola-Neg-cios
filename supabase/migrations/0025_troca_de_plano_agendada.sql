-- =============================================================================
-- 0025 — Troca de plano e expiração automática
-- Especificação: Seções 6.5, 6.6, 6.7
--
-- O downgrade "aplica somente no próximo ciclo de cobrança — o cliente
-- permanece no plano atual até o vencimento" (Seção 6.7). Isso exige guardar
-- a troca agendada, coisa que a Seção 4.12.2 não previu.
-- =============================================================================

alter table public.assinaturas
  add column plano_agendado_id uuid references public.planos (id) on delete restrict,
  add column troca_agendada_para date,
  -- Preço legado do plano agendado, congelado no momento da solicitação
  -- (mesmo princípio da Seção 7.15).
  add column valor_agendado numeric(14, 2);

alter table public.assinaturas
  add constraint assinaturas_troca_agendada_completa
    check (
      (plano_agendado_id is null and troca_agendada_para is null and valor_agendado is null)
      or (plano_agendado_id is not null and troca_agendada_para is not null and valor_agendado is not null)
    );

comment on column public.assinaturas.plano_agendado_id is
  'Downgrade solicitado, a aplicar no próximo vencimento (Seção 6.7).';

-- -----------------------------------------------------------------------------
-- Seção 6.7 — troca de plano solicitada pelo Gestor.
--
-- Upgrade:   aplicação IMEDIATA.
-- Downgrade: só no próximo ciclo, e BLOQUEADO se a empresa estiver acima de
--            algum limite do plano de destino. "O sistema nunca desativa
--            automaticamente funcionários, produtos ou qualquer dado do
--            cliente para forçar um downgrade."
-- -----------------------------------------------------------------------------
create or replace function public.trocar_plano(p_plano_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
  v_assinatura public.assinaturas%rowtype;
  v_destino public.planos%rowtype;
  v_limite numeric;
  v_atuais integer;
  v_excedidos text[] := array[]::text[];
  v_upgrade boolean;
  v_vencimento date;
begin
  -- Seção 5.3 — trocar de plano exige `gerenciar_assinatura`, exclusiva do Gestor.
  if not app.pode_escrever(v_empresa, 'gerenciar_assinatura') then
    raise exception 'Você não tem permissão para gerenciar a assinatura.'
      using errcode = '42501';
  end if;

  select * into v_assinatura
  from public.assinaturas
  where empresa_id = v_empresa and status <> 'cancelada'
  for update;

  if not found then
    raise exception 'Nenhuma assinatura ativa encontrada.' using errcode = '23503';
  end if;

  select * into v_destino from public.planos where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = '23503';
  end if;

  if not v_destino.ativo then
    raise exception 'Este plano não está disponível para contratação.' using errcode = '22023';
  end if;

  if v_destino.id = v_assinatura.plano_id then
    raise exception 'Sua empresa já está neste plano.' using errcode = '22023';
  end if;

  v_upgrade := v_destino.valor_mensal > v_assinatura.valor_contratado;

  -- Seção 6.7 — antes de confirmar um downgrade, informa EXATAMENTE quais
  -- limites estão sendo excedidos.
  if not v_upgrade then
    v_limite := (v_destino.limites ->> 'max_funcionarios')::numeric;

    if v_limite is not null then
      select count(*) into v_atuais
      from public.empresa_usuarios
      where empresa_id = v_empresa and status in ('ativo', 'convidado');

      if v_atuais > v_limite then
        v_excedidos := v_excedidos || format(
          'Funcionários: você tem %s e o plano %s permite %s.',
          v_atuais, v_destino.nome, v_limite::integer);
      end if;
    end if;

    if array_length(v_excedidos, 1) > 0 then
      raise exception 'Ajuste sua empresa antes de trocar de plano. %',
        array_to_string(v_excedidos, ' ')
        using errcode = '22023';
    end if;
  end if;

  if v_upgrade then
    -- Aplicação imediata: novas funcionalidades e limites liberados na hora.
    perform app.definir_contexto('assinatura.plano_alterado');

    update public.assinaturas
    set plano_id = v_destino.id,
        valor_contratado = v_destino.valor_mensal,
        plano_agendado_id = null,
        troca_agendada_para = null,
        valor_agendado = null
    where id = v_assinatura.id;

    perform app.registrar_log(
      v_empresa, 'assinatura.upgrade', 'assinatura', v_assinatura.id,
      jsonb_build_object('plano_id', v_assinatura.plano_id,
                         'valor', v_assinatura.valor_contratado),
      jsonb_build_object('plano_id', v_destino.id, 'valor', v_destino.valor_mensal)
    );

    return jsonb_build_object(
      'aplicado', true,
      'tipo', 'upgrade',
      'plano_id', v_destino.id,
      'mensagem', format('Plano alterado para %s. As novas funcionalidades já estão liberadas.',
                         v_destino.nome)
    );
  end if;

  -- Downgrade: só no próximo vencimento.
  v_vencimento := coalesce(v_assinatura.proximo_vencimento, (now() + interval '30 days')::date);

  update public.assinaturas
  set plano_agendado_id = v_destino.id,
      troca_agendada_para = v_vencimento,
      valor_agendado = v_destino.valor_mensal
  where id = v_assinatura.id;

  perform app.registrar_log(
    v_empresa, 'assinatura.downgrade_agendado', 'assinatura', v_assinatura.id, null,
    jsonb_build_object('plano_id', v_destino.id, 'a_partir_de', v_vencimento)
  );

  return jsonb_build_object(
    'aplicado', false,
    'tipo', 'downgrade',
    'plano_id', v_destino.id,
    'a_partir_de', v_vencimento,
    'mensagem', format(
      'Troca para %s agendada. Você continua no plano atual até %s.',
      v_destino.nome, to_char(v_vencimento, 'DD/MM/YYYY'))
  );
end;
$$;

-- Seção 6.7 — o Gestor pode desistir do downgrade antes do vencimento.
create or replace function public.cancelar_troca_de_plano()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid := app.empresa_atual();
begin
  if not app.pode_escrever(v_empresa, 'gerenciar_assinatura') then
    raise exception 'Você não tem permissão para gerenciar a assinatura.'
      using errcode = '42501';
  end if;

  update public.assinaturas
  set plano_agendado_id = null, troca_agendada_para = null, valor_agendado = null
  where empresa_id = v_empresa and status <> 'cancelada';
end;
$$;

revoke execute on function public.trocar_plano(uuid) from public, anon;
revoke execute on function public.cancelar_troca_de_plano() from public, anon;
grant execute on function public.trocar_plano(uuid) to authenticated;
grant execute on function public.cancelar_troca_de_plano() to authenticated;
