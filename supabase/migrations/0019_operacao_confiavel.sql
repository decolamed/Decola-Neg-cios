-- =============================================================================
-- 0019 — Marcador de operação confiável do servidor
--
-- Problema: o trigger `produtos_permissao_colunas` (0008) exige
-- `gerenciar_estoque` para qualquer mudança em `estoque_atual`. Mas registrar
-- uma venda também mexe no estoque, e o Funcionário registra vendas POR PADRÃO
-- sem ter essa permissão (Seção 5.3). Sem um marcador, vender ficaria
-- impossível para quem só pode vender.
--
-- Solução: as RPCs que já validaram a operação marcam a transação como
-- confiável. O marcador vive no schema `app`, que o PostgREST não expõe —
-- nenhum cliente consegue ativá-lo por conta própria.
-- =============================================================================

create or replace function app.marcar_operacao_confiavel()
returns void
language plpgsql
volatile
as $$
begin
  perform set_config('decola.operacao_confiavel', 'sim', true);
end;
$$;

create or replace function app.operacao_confiavel()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('decola.operacao_confiavel', true), '') = 'sim'
$$;

-- O trigger de permissão por coluna passa a reconhecer o marcador. Continua
-- valendo integralmente para escritas diretas do cliente na tabela.
create or replace function app.produtos_validar_permissao_colunas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Backend (service_role) e operações já validadas por RPC não repetem a
  -- checagem: a RPC é a autoridade nesse caminho.
  if (select auth.uid()) is null or app.operacao_confiavel() then
    return new;
  end if;

  if new.ciclo_vida is distinct from old.ciclo_vida
     and not app.tem_permissao('excluir_produto') then
    raise exception 'Você não tem permissão para arquivar ou excluir produtos.'
      using errcode = '42501';
  end if;

  if new.estoque_atual is distinct from old.estoque_atual
     and not app.tem_permissao('gerenciar_estoque') then
    raise exception 'Você não tem permissão para alterar o estoque.'
      using errcode = '42501';
  end if;

  if (new.nome, new.codigo, new.categoria_id, new.preco, new.atributos)
       is distinct from (old.nome, old.codigo, old.categoria_id, old.preco, old.atributos)
     and not app.tem_permissao('editar_produto') then
    raise exception 'Você não tem permissão para editar produtos.'
      using errcode = '42501';
  end if;

  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'Não é possível transferir um produto entre empresas.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

grant execute on function app.marcar_operacao_confiavel() to authenticated, service_role;
grant execute on function app.operacao_confiavel() to authenticated, service_role;
