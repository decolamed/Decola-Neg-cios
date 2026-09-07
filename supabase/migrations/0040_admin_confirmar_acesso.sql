-- =============================================================================
-- 0040 — `admin_confirmar_acesso`: a pergunta "quem está falando é admin?"
-- =============================================================================
-- A função de diagnóstico das integrações precisa saber se quem chamou é
-- administrador da plataforma, e essa decisão é do banco — nunca da Edge
-- Function, que não tem como provar nada sozinha.
--
-- As RPCs de admin que já existem respondem isso de lado, como efeito de
-- fazerem outra coisa: `admin_metricas` varre tabelas inteiras só para,
-- de quebra, recusar quem não é admin. Usar uma delas como porteiro seria
-- pagar o custo do trabalho para obter a resposta de uma pergunta.
--
-- Esta não faz nada além da pergunta. `app.exigir_admin()` levanta exceção
-- quando a resposta é não; retorno normal significa sim.
-- =============================================================================

create or replace function public.admin_confirmar_acesso()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.exigir_admin();
end;
$$;

revoke all on function public.admin_confirmar_acesso() from public;
grant execute on function public.admin_confirmar_acesso() to authenticated;

comment on function public.admin_confirmar_acesso() is
  'Retorna sem erro quando quem chama é administrador da plataforma; levanta '
  'exceção caso contrário. Usada como porteiro por funções que precisam da '
  'decisão sem precisar do trabalho de outra RPC de admin.';
