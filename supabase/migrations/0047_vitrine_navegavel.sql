-- 0047 — A vitrine deixa de ser uma lista e vira uma loja.
--
-- Até aqui a vitrine mostrava TODOS os produtos numa grade só, em ordem
-- alfabética. Funciona com doze produtos e desmonta com duzentos: sem
-- categoria, sem busca, sem nada em destaque, quem chega precisa rolar a loja
-- inteira para descobrir o que ela vende.
--
-- Esta migração dá ao site o que faltava para navegar. Nada aqui inventa dado
-- novo para o lojista preencher: categoria e atributos ele JÁ cadastra no
-- aplicativo — o que faltava era a vitrine enxergar.
--
-- O QUE NÃO ENTRA. Continua fora da superfície pública: código interno,
-- estoque real, custo, `criado_por` e a chave Pix (só o fato de existir). A
-- chave só aparece depois que existe um pedido, em `vitrine_consultar_pedido`.

-- =============================================================================
-- 1. Instagram da loja
-- =============================================================================
-- WhatsApp e endereço já existiam; o Instagram é o terceiro link que todo
-- pequeno negócio tem e que a vitrine não mostrava. Guardamos o @, não a URL:
-- o lojista digita o que ele conhece, e quem monta o endereço é o site.

alter table public.empresas
  add column if not exists loja_instagram text;

alter table public.empresas
  drop constraint if exists empresas_loja_instagram_formato;

alter table public.empresas
  add constraint empresas_loja_instagram_formato
  check (
    loja_instagram is null
    or loja_instagram ~ '^[A-Za-z0-9._]{1,30}$'
  );

comment on column public.empresas.loja_instagram is
  'Apenas o nome de usuário, sem @ e sem URL. O site monta o endereço.';

-- =============================================================================
-- 2. Produtos em destaque
-- =============================================================================
-- A vitrine precisa de uma primeira dobra que não seja "os produtos cujo nome
-- começa com A". Destaque é a decisão do lojista sobre o que ele quer vender
-- hoje — a vitrine física dele, traduzida.

alter table public.produtos
  add column if not exists destaque boolean not null default false;

comment on column public.produtos.destaque is
  'Aparece na faixa "Produtos em destaque" da vitrine. Escolha do lojista.';

create index if not exists produtos_destaque_idx
  on public.produtos (empresa_id)
  where destaque and visivel_na_loja and ciclo_vida = 'ativo';

-- Toda coluna nova de `produtos` precisa entrar no trigger de permissão por
-- coluna, senão fica escrevível por qualquer um dos três papéis que a política
-- `produtos_edicao` admite. Destaque é decisão de catálogo: `editar_produto`.
create or replace function app.produtos_validar_permissao_colunas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

  if new.estoque_reservado is distinct from old.estoque_reservado then
    raise exception
      'O estoque reservado é controlado pelos pedidos da loja e não pode ser alterado à mão.'
      using errcode = '42501',
            hint = 'Para liberar unidades reservadas, cancele o pedido correspondente.';
  end if;

  if (new.nome, new.codigo, new.categoria_id, new.preco, new.atributos,
      new.descricao, new.imagens, new.visivel_na_loja, new.destaque)
       is distinct from
     (old.nome, old.codigo, old.categoria_id, old.preco, old.atributos,
      old.descricao, old.imagens, old.visivel_na_loja, old.destaque)
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

-- =============================================================================
-- 3. Quais atributos o cliente pode ver
-- =============================================================================
-- `produtos.atributos` é o campo mais útil e mais perigoso para a vitrine.
-- Útil porque é lá que vive "Tamanho: M", "Voltagem: 220V", "Cor: Preto" — o
-- que faz o cliente decidir. Perigoso porque o lojista pode criar um campo
-- personalizado chamado "custo" ou "fornecedor" e nunca imaginar que ele
-- apareceria na internet.
--
-- Por isso a exposição é OPT-IN, campo a campo, e o padrão é não mostrar.
-- Ninguém vaza margem por esquecer de desmarcar uma caixa.

alter table public.empresa_campos_produto
  add column if not exists visivel_na_loja boolean not null default false;

comment on column public.empresa_campos_produto.visivel_na_loja is
  'Este campo aparece na página pública do produto? Padrão: não. Opt-in '
  'deliberado — atributo é onde mora "custo de compra" e "fornecedor".';

-- =============================================================================
-- 4. As views públicas
-- =============================================================================

-- A ordem importa: `vitrine_categorias` é construída sobre `vitrine_produtos`,
-- que por sua vez não depende de `vitrine_lojas`. Derrubar de fora para dentro
-- é o que faz esta migração poder rodar duas vezes.
drop view if exists public.vitrine_categorias;
drop view if exists public.vitrine_produtos;
drop view if exists public.vitrine_lojas;

-- ------------------------------------------------------------------- lojas
create view public.vitrine_lojas
with (security_invoker = off) as
select
  e.id,
  e.loja_slug                                      as slug,
  coalesce(nullif(btrim(e.loja_nome), ''), e.nome) as nome,
  e.loja_descricao                                 as descricao,
  e.logo_url,
  e.whatsapp,
  e.endereco,
  e.loja_instagram                                 as instagram,
  e.chave_pix is not null                          as aceita_pix,
  e.loja_cor,
  case when e.loja_banners_ativos then e.loja_banners else '[]'::jsonb end as banners
from public.empresas e
where e.loja_ativa
  and e.loja_slug is not null
  and e.status = 'ativa'
  and exists (
    select 1 from public.assinaturas a
    where a.empresa_id = e.id
      and a.status in ('trial', 'ativa', 'carencia')
  );

-- ---------------------------------------------------------------- produtos
create view public.vitrine_produtos
with (security_invoker = off) as
select
  p.id,
  p.empresa_id,
  e.loja_slug                                        as loja_slug,
  p.nome,
  p.descricao,
  p.preco,
  p.imagens,
  greatest(p.estoque_atual - p.estoque_reservado, 0) as disponivel,
  p.categoria_id,
  c.nome                                             as categoria_nome,
  p.destaque,
  p.criado_em,
  -- Só os atributos que o lojista marcou para aparecer, já com o rótulo que
  -- ele escolheu: quem desenha a página não precisa de uma segunda consulta
  -- para saber que `tamanho_letra` se chama "Tamanho (PP a XGG)".
  coalesce(
    (
      select jsonb_object_agg(cd.nome_exibicao, p.atributos -> cd.chave)
        from public.empresa_campos_produto ecp
        join public.campos_produto_disponiveis cd on cd.id = ecp.campo_id
       where ecp.empresa_id = p.empresa_id
         and ecp.ativo
         and ecp.visivel_na_loja
         and p.atributos ? cd.chave
         and jsonb_typeof(p.atributos -> cd.chave) <> 'null'
    ),
    '{}'::jsonb
  ) as atributos
from public.produtos p
join public.empresas e on e.id = p.empresa_id
left join public.categorias_produto c
       on c.id = p.categoria_id and c.ciclo_vida = 'ativo'
where p.visivel_na_loja
  and p.ciclo_vida = 'ativo'
  and e.loja_ativa
  and e.loja_slug is not null
  and e.status = 'ativa'
  and exists (
    select 1 from public.assinaturas a
    where a.empresa_id = e.id
      and a.status in ('trial', 'ativa', 'carencia')
  );

-- -------------------------------------------------------------- categorias
-- Só categorias que TÊM produto à mostra. Uma categoria vazia na vitrine é um
-- convite para um beco sem saída: o cliente toca, não encontra nada e conclui
-- que a loja está desorganizada.
--
-- A capa sai do primeiro produto com foto, em vez de virar mais um campo para
-- o lojista preencher. Ele já subiu essas fotos; pedir uma imagem de categoria
-- seria pedir trabalho para obter o que já está ali.
create view public.vitrine_categorias
with (security_invoker = off) as
select
  vp.loja_slug,
  vp.categoria_id                       as id,
  vp.categoria_nome                     as nome,
  count(*)                              as produtos,
  (array_remove(
     array_agg(vp.imagens ->> 0 order by vp.destaque desc, vp.nome),
     null
   ))[1]                                as capa
from public.vitrine_produtos vp
where vp.categoria_id is not null
group by vp.loja_slug, vp.categoria_id, vp.categoria_nome;

comment on view public.vitrine_lojas is
  'Superfície pública da loja. Note o que NÃO sai daqui: cnpj, telefone '
  'interno, a própria chave Pix (só o fato de existir) e qualquer dado de '
  'assinatura.';

comment on view public.vitrine_produtos is
  'Superfície pública do catálogo. Não expõe codigo, estoque real, custo nem '
  'criado_por. `atributos` traz SOMENTE os campos marcados como visíveis na '
  'loja pelo gestor — o padrão é não mostrar.';

comment on view public.vitrine_categorias is
  'Categorias com pelo menos um produto à mostra, com contagem e uma capa '
  'emprestada do primeiro produto com foto.';

grant select on public.vitrine_lojas      to anon, authenticated;
grant select on public.vitrine_produtos   to anon, authenticated;
grant select on public.vitrine_categorias to anon, authenticated;
