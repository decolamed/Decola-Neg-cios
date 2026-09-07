-- =============================================================================
-- 0041 — As colunas da vitrine passam a ter dono
-- =============================================================================
-- CORREÇÃO DE SEGURANÇA. As colunas criadas em 0032 (`descricao`, `imagens`,
-- `visivel_na_loja`, `estoque_reservado`) entraram em `produtos` sem entrar no
-- trigger de permissão por coluna (0008), que ainda lista só as cinco colunas
-- cadastrais originais.
--
-- Isso importa porque a política `produtos_edicao` é DELIBERADAMENTE larga:
-- ela admite quem tenha QUALQUER uma de `editar_produto`, `gerenciar_estoque`
-- ou `excluir_produto`, e é o trigger que decide, coluna a coluna, qual das
-- três a operação exigia. Coluna fora do trigger é coluna que todos os três
-- podem escrever.
--
-- O que isso permitia, verificado contra o banco antes desta migração:
--
--   1. Um funcionário com apenas `gerenciar_estoque` publicava e despublicava
--      produtos na loja pública e reescrevia o texto que o cliente lê. Quem
--      recebeu permissão de conferir prateleira passava a mandar na vitrine.
--
--   2. O mesmo funcionário zerava `estoque_reservado` com um UPDATE direto.
--      Essa é a mais grave: a reserva é o que impede a venda de balcão de
--      consumir unidade já prometida a um pedido. Zerada, a regra de 0034 vira
--      enfeite e o pedido do cliente fica sem lastro.
--
-- As duas correções não são simétricas, de propósito:
--
--   `descricao`, `imagens`, `visivel_na_loja` são conteúdo cadastral — pedem
--   `editar_produto`, exatamente como nome, preço e categoria.
--
--   `estoque_reservado` NÃO pertence a permissão nenhuma. É estado derivado,
--   de propriedade do fluxo de pedidos: quem escreve é `vitrine_criar_pedido`,
--   `pedido_cancelar`, `pedido_finalizar` e `expirar_reservas_vencidas` — que
--   passam por `app.marcar_operacao_confiavel()` e saem no primeiro `return`
--   do trigger. Escrita direta na coluna é sempre recusada, para todo papel,
--   Gestor incluído: não existe motivo legítimo de negócio para mexer nela à
--   mão, e existe um jeito de corromper o estoque fazendo isso.
-- =============================================================================

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

  -- A reserva é escrita só pelo fluxo de pedidos, que chega aqui como operação
  -- confiável e já retornou acima. Chegar neste ponto com a coluna alterada
  -- significa UPDATE direto na tabela — e isso não tem uso legítimo.
  if new.estoque_reservado is distinct from old.estoque_reservado then
    raise exception
      'O estoque reservado é controlado pelos pedidos da loja e não pode ser alterado à mão.'
      using errcode = '42501',
            hint = 'Para liberar unidades reservadas, cancele o pedido correspondente.';
  end if;

  -- Cadastrais, agora incluindo o que a vitrine mostra ao cliente.
  if (new.nome, new.codigo, new.categoria_id, new.preco, new.atributos,
      new.descricao, new.imagens, new.visivel_na_loja)
       is distinct from
     (old.nome, old.codigo, old.categoria_id, old.preco, old.atributos,
      old.descricao, old.imagens, old.visivel_na_loja)
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

comment on function app.produtos_validar_permissao_colunas() is
  'Permissão por coluna em `produtos`. A RLS decide SE a linha pode ser '
  'escrita; este trigger decide QUAL permissão cada coluna exigia. Toda coluna '
  'nova de `produtos` precisa entrar aqui — o que fica de fora fica escrevível '
  'por qualquer um dos três papéis que a política `produtos_edicao` admite.';
