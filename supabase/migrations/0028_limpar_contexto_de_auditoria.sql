-- =============================================================================
-- 0028 — Encerramento explícito do contexto de auditoria
-- Especificação: Seção 5.4 (toda ação registrada, com o nome certo)
--
-- `app.definir_contexto()` grava com `is_local = true`: o valor vale pela
-- TRANSAÇÃO inteira, não pelo statement. Isso é proposital — `registrar_venda`
-- e `cancelar_venda` nomeiam a ação uma vez e produzem VÁRIAS linhas de
-- auditoria (venda, produto, movimentação) que devem carregar o mesmo nome.
--
-- O efeito colateral: se duas operações independentes compartilharem a mesma
-- transação, a segunda herda o nome da primeira. Foi exatamente o que
-- aconteceu num teste da Fase 8 — uma edição de plano ficou registrada como
-- `empresa.reativada` porque uma RPC anterior, na mesma transação, tinha
-- nomeado aquela ação.
--
-- Pelo PostgREST isso não acontece: cada requisição é uma transação própria.
-- Mesmo assim a armadilha é afiada demais para ficar sem saída, então aqui
-- entra a forma explícita de encerrar o contexto — e a RPC administrativa que
-- produz uma única linha de auditoria passa a usá-la.
-- =============================================================================

create or replace function app.limpar_contexto()
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform set_config('decola.acao', '', true);
  perform set_config('decola.motivo', '', true);
end;
$$;

grant execute on function app.limpar_contexto() to authenticated, service_role;

comment on function app.definir_contexto(text, text) is
  'Nomeia a ação da transação para o trigger de auditoria. O escopo é a '
  'transação inteira: uma RPC que produza uma única linha de auditoria deve '
  'chamar app.limpar_contexto() ao terminar, para não rotular o que vier '
  'depois na mesma transação.';

-- -----------------------------------------------------------------------------
-- Única RPC desta fase que nomeia a ação e escreve uma linha só.
-- Idêntica à de 0027, com o encerramento do contexto no fim.
-- -----------------------------------------------------------------------------
create or replace function public.admin_definir_status_empresa(
  p_empresa_id uuid,
  p_status public.empresa_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual public.empresas%rowtype;
begin
  perform app.exigir_admin();

  select * into v_atual from public.empresas where id = p_empresa_id for update;
  if not found then
    raise exception 'Empresa não encontrada.' using errcode = '23503';
  end if;

  if v_atual.status = p_status then
    raise exception 'A empresa já está com este status.' using errcode = '22023';
  end if;

  perform app.definir_contexto(
    case p_status
      when 'suspensa' then 'empresa.suspensa'
      when 'inativa' then 'empresa.encerrada'
      else 'empresa.reativada'
    end);

  update public.empresas
  set status = p_status,
      -- Data do encerramento, base do churn (Seção 7.15 A). Reativar limpa.
      encerrada_em = case when p_status = 'inativa' then now() else null end
  where id = p_empresa_id;

  perform app.limpar_contexto();
end;
$$;
