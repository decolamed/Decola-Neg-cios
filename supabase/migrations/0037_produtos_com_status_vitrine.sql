-- =============================================================================
-- 0037 — `produtos_com_status` passa a enxergar a vitrine e a reserva
-- =============================================================================
-- A view de 0016 lista colunas uma a uma, então os campos criados em 0032
-- (`descricao`, `visivel_na_loja`, `estoque_reservado`) simplesmente não
-- chegavam ao app: a tela de edição de produto não tinha como carregar o que
-- o formulário agora grava.
--
-- Junto vai a consequência da regra acertada em 0034 — disponível é
-- `estoque_atual - estoque_reservado`. Se o banco recusa vender 3 unidades
-- quando as 3 estão reservadas, a lista não pode chamá-las de "disponível".
-- `estoque_atual` continua sendo o número FÍSICO (é ele que o gestor confere
-- na prateleira); `status_estoque` passa a falar de disponibilidade, que é a
-- pergunta que a tela de fato responde.
--
-- `create or replace` preserva as colunas anteriores em nome, tipo e ordem;
-- as novas entram no fim, e por isso `painel_inicial` (0029) e as telas
-- existentes continuam funcionando sem alteração.
-- =============================================================================

create or replace view public.produtos_com_status
with (security_invoker = on) as
select
  p.id,
  p.empresa_id,
  p.nome,
  p.codigo,
  p.categoria_id,
  c.nome as categoria_nome,
  p.preco,
  p.estoque_atual,
  p.estoque_referencia_alerta,
  p.ciclo_vida,
  p.atributos,
  p.criado_por,
  p.criado_em,
  p.atualizado_em,
  (case
     when greatest(p.estoque_atual - p.estoque_reservado, 0) = 0 then 'esgotado'
     when p.estoque_referencia_alerta > 0
      and greatest(p.estoque_atual - p.estoque_reservado, 0)
          <= (p.estoque_referencia_alerta * e.alerta_estoque_percentual / 100.0)
       then 'estoque_baixo'
     else 'disponivel'
   end)::public.status_estoque as status_estoque,
  -- Seção 8.3 — "percentual restante do estoque" exibido na lista de alerta.
  (case
     when p.estoque_referencia_alerta > 0
       then round(
         greatest(p.estoque_atual - p.estoque_reservado, 0)::numeric * 100
         / p.estoque_referencia_alerta)
     else null
   end) as percentual_restante,
  -- Novas colunas, sempre no fim.
  p.descricao,
  p.visivel_na_loja,
  p.estoque_reservado,
  -- O número que decide se uma venda passa. Nunca negativo: reserva maior que
  -- o físico é anomalia a ser corrigida no estoque, não a ser propagada como
  -- quantidade negativa para a tela.
  greatest(p.estoque_atual - p.estoque_reservado, 0) as estoque_disponivel
from public.produtos p
join public.empresas e on e.id = p.empresa_id
left join public.categorias_produto c on c.id = p.categoria_id;

comment on view public.produtos_com_status is
  'Produtos com status de estoque computado. `estoque_atual` é o físico; '
  '`estoque_disponivel` = atual - reservado é o que pode ser vendido, e é '
  'sobre ele que `status_estoque` e `percentual_restante` falam.';
