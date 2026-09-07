-- =============================================================================
-- 0039 — `produtos_com_status` passa a devolver as fotos
-- =============================================================================
-- 0037 trouxe descrição, visibilidade e reserva para a view, mas deixou
-- `imagens` de fora. Sem ela, toda tela que quer mostrar a foto do produto
-- precisa de uma segunda consulta à tabela — e a lista de produtos precisaria
-- de uma por linha.
--
-- São caminhos (`<empresa_id>/<produto_id>/<uuid>.jpg`), não binário: a coluna
-- é pequena e a foto continua vindo do bucket, pelo CDN do Storage.
--
-- `create or replace` mantém as colunas anteriores em nome, tipo e ordem; a
-- nova entra no fim.
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
  (case
     when p.estoque_referencia_alerta > 0
       then round(
         greatest(p.estoque_atual - p.estoque_reservado, 0)::numeric * 100
         / p.estoque_referencia_alerta)
     else null
   end) as percentual_restante,
  p.descricao,
  p.visivel_na_loja,
  p.estoque_reservado,
  greatest(p.estoque_atual - p.estoque_reservado, 0) as estoque_disponivel,
  p.imagens
from public.produtos p
join public.empresas e on e.id = p.empresa_id
left join public.categorias_produto c on c.id = p.categoria_id;
