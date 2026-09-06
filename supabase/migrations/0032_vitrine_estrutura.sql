-- =============================================================================
-- Vitrine virtual — estrutura
--
-- O produto da vitrine É o produto da gestão. Não existe tabela de catálogo
-- separada: `produtos` ganha as colunas que faltavam para ser exibido, e é a
-- mesma linha que serve estoque, venda e financeiro. Preço, imagem e estoque
-- refletem na loja porque são a mesma linha, não porque algo sincroniza.
--
-- O QUE ENTRA AQUI
--   empresas ....... identidade e configuração da loja (slug, whatsapp, logo)
--   produtos ....... imagens, descrição, visibilidade na loja e RESERVA
--   pedidos ........ solicitações vindas da vitrine
--   pedido_itens ... o que foi pedido, com preço congelado no momento
--   duas views ..... a única superfície pública, para o papel `anon`
--
-- A DECISÃO CENTRAL: COMO O ESTOQUE É PROTEGIDO
--
-- `estoque_atual` continua significando estoque FÍSICO. Um pedido não o
-- diminui — seria mentira: a mercadoria ainda está na prateleira, e o relatório
-- de estoque, o alerta de reposição e a venda de balcão passariam a operar
-- sobre um número que não corresponde ao mundo.
--
-- Em vez disso, `estoque_reservado` conta o que está comprometido com pedidos
-- em aberto. A vitrine oferece `estoque_atual - estoque_reservado`. Assim:
--
--   dois clientes disputando a última unidade .... o segundo é recusado, porque
--                                                  a reserva é feita sob
--                                                  `select ... for update`,
--                                                  o mesmo travamento que
--                                                  `registrar_venda` já usa
--   pedido cancelado ............................. a reserva volta
--   pedido finalizado ............................ vira venda de verdade:
--                                                  `estoque_atual` cai, a
--                                                  reserva é liberada e o
--                                                  financeiro é lançado
--   pedido abandonado ............................ segura estoque até o gestor
--                                                  cancelar (ver nota abaixo)
--
-- NOTA SOBRE VENDA DE BALCÃO — SUPERADA POR 0034. O parágrafo abaixo descreve
-- a decisão tomada aqui, que foi revista logo em seguida: a regra em vigor é
-- "disponível = estoque_atual - estoque_reservado", valendo TAMBÉM para a
-- venda de balcão. Fica registrado por ser o histórico da decisão; para o
-- comportamento atual, ver 0034.
--
-- `registrar_venda` NÃO foi alterada: ela continua
-- olhando só `estoque_atual`. É deliberado. Bloquear quem está fisicamente na
-- loja por causa de um pedido online não confirmado é o pior dos dois erros
-- para um pequeno negócio — e mudar uma RPC testada para isso seria mexer em
-- funcionalidade que já funciona. A consequência assumida é que uma venda de
-- balcão pode deixar um pedido online sem lastro; nesse caso o gestor vê o
-- pedido como não atendível e cancela. Estado visível e resolvível, não
-- corrupção silenciosa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.pedido_modalidade as enum ('retirada', 'entrega');

-- `a_combinar` é a entrega: o pagamento é acertado junto com o frete, pelo
-- WhatsApp, e o sistema não finge saber como será feito.
create type public.pedido_pagamento as enum ('pix_online', 'na_retirada', 'a_combinar');

-- Um enum só para os dois fluxos. Quais status valem para qual modalidade é
-- regra de transição (migration seguinte), não de tipo — assim um fluxo novo
-- não obriga a recriar o tipo.
create type public.pedido_status as enum (
  -- retirada
  'aguardando_pagamento',
  'pagamento_confirmado',
  'pagamento_na_retirada',
  'pronto_para_retirada',
  -- entrega
  'aguardando_negociacao',
  'entrega_combinada',
  'confirmado',
  'em_entrega',
  -- comuns
  'finalizado',
  'cancelado'
);

-- -----------------------------------------------------------------------------
-- Identidade da loja (Seção nova — Configurações da loja)
--
-- `logo_url`, `chave_pix`, `telefone` e `endereco` já existiam em `empresas` e
-- são reaproveitados: a vitrine não duplica cadastro de empresa.
-- -----------------------------------------------------------------------------
alter table public.empresas
  add column loja_slug      text,
  add column loja_ativa     boolean not null default false,
  add column whatsapp       text,
  add column loja_descricao text;

comment on column public.empresas.loja_slug is
  'Endereço da vitrine: /loja/<slug>. Nulo enquanto o dono não publicar.';
comment on column public.empresas.loja_ativa is
  'A vitrine só responde quando o dono liga. Nasce desligada de propósito: '
  'ninguém deve ter uma loja pública no ar sem ter decidido isso.';
comment on column public.empresas.whatsapp is
  'Número usado para negociar a entrega. Só dígitos, com DDI e DDD.';

-- Único e insensível a maiúsculas: /loja/Padaria e /loja/padaria são o mesmo
-- endereço, e dois negócios não podem disputá-lo.
create unique index empresas_loja_slug_unico
  on public.empresas (lower(loja_slug))
  where loja_slug is not null;

alter table public.empresas
  add constraint empresas_loja_slug_formato
  check (
    loja_slug is null
    or loja_slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$'
  );

-- Publicar a loja sem endereço não é um estado válido.
alter table public.empresas
  add constraint empresas_loja_ativa_exige_slug
  check (not loja_ativa or loja_slug is not null);

-- -----------------------------------------------------------------------------
-- Produto: o que faltava para ele aparecer numa vitrine
-- -----------------------------------------------------------------------------
alter table public.produtos
  add column descricao          text,
  add column imagens            jsonb   not null default '[]'::jsonb,
  add column visivel_na_loja    boolean not null default false,
  add column estoque_reservado  integer not null default 0;

comment on column public.produtos.imagens is
  'Lista de caminhos no bucket `produtos` do Storage, em ordem de exibição. '
  'A primeira é a capa.';
comment on column public.produtos.estoque_reservado is
  'Unidades comprometidas com pedidos em aberto. NÃO é estoque físico: '
  'o disponível para a vitrine é estoque_atual - estoque_reservado.';

alter table public.produtos
  add constraint produtos_imagens_e_lista
  check (jsonb_typeof(imagens) = 'array'),
  add constraint produtos_reserva_nao_negativa
  check (estoque_reservado >= 0);

-- Produto sem preço ou fora do ciclo ativo não vai para a vitrine — mas isso
-- é filtro de view, não constraint: arquivar um produto não pode falhar só
-- porque ele estava visível.

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create sequence public.pedidos_numero_seq;

create table public.pedidos (
  id                       uuid primary key default gen_random_uuid(),
  empresa_id               uuid not null references public.empresas (id) on delete cascade,

  -- Número curto para o cliente citar no WhatsApp. Sequência global, e não por
  -- empresa: numerar por empresa exigiria travar um contador a cada pedido,
  -- e o número não precisa ser sequencial para o negócio — precisa ser único
  -- e fácil de ler em voz alta.
  numero                   bigint not null default nextval('public.pedidos_numero_seq'),

  -- Como o cliente acompanha o próprio pedido sem ter conta. Segredo na URL:
  -- quem tem o link vê aquele pedido, e só aquele.
  token                    uuid not null default gen_random_uuid(),

  status                   public.pedido_status not null,
  modalidade               public.pedido_modalidade not null,
  pagamento                public.pedido_pagamento not null,

  cliente_nome             text not null,
  cliente_telefone         text not null,
  endereco_entrega         text,
  ciente_custo_entrega     boolean not null default false,
  observacao               text,

  subtotal                 numeric(12,2) not null check (subtotal >= 0),

  -- Preenchido na finalização: é o elo entre a loja virtual e a gestão.
  venda_id                 uuid references public.vendas (id),

  pagamento_confirmado_em  timestamptz,
  pagamento_confirmado_por uuid references public.usuarios (id),
  finalizado_em            timestamptz,
  cancelado_em             timestamptz,
  cancelado_por            uuid references public.usuarios (id),
  motivo_cancelamento      text,

  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),

  constraint pedidos_numero_unico unique (numero),
  constraint pedidos_token_unico  unique (token),

  -- Entrega sem endereço, ou sem o aceite explícito de que o frete é por conta
  -- do cliente, não é um pedido válido. A regra mora aqui e não só na tela.
  constraint pedidos_entrega_exige_endereco_e_ciencia check (
    modalidade <> 'entrega'
    or (endereco_entrega is not null and btrim(endereco_entrega) <> '' and ciente_custo_entrega)
  ),

  -- Retirada não tem endereço de entrega: guardar um seria dado sem sentido.
  constraint pedidos_retirada_sem_endereco check (
    modalidade <> 'retirada' or endereco_entrega is null
  ),

  -- Cada modalidade admite as suas formas de pagamento.
  constraint pedidos_pagamento_coerente check (
    (modalidade = 'retirada' and pagamento in ('pix_online', 'na_retirada'))
    or (modalidade = 'entrega' and pagamento = 'a_combinar')
  )
);

create table public.pedido_itens (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references public.pedidos (id) on delete cascade,
  produto_id     uuid not null references public.produtos (id),

  -- Nome e preço são congelados no momento do pedido. Sem isso, renomear ou
  -- reprecificar um produto reescreveria pedidos antigos — e o histórico
  -- deixaria de bater com o que o cliente viu e aceitou.
  nome_produto   text not null,
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  quantidade     integer not null check (quantidade > 0),
  subtotal       numeric(12,2) not null check (subtotal >= 0),

  constraint pedido_itens_produto_unico unique (pedido_id, produto_id)
);

create index pedidos_empresa_recentes on public.pedidos (empresa_id, criado_em desc);
create index pedidos_empresa_status   on public.pedidos (empresa_id, status);
create index pedido_itens_pedido      on public.pedido_itens (pedido_id);
create index pedido_itens_produto     on public.pedido_itens (produto_id);
create index pedidos_venda            on public.pedidos (venda_id) where venda_id is not null;
create index pedidos_confirmado_por   on public.pedidos (pagamento_confirmado_por)
  where pagamento_confirmado_por is not null;
create index pedidos_cancelado_por    on public.pedidos (cancelado_por)
  where cancelado_por is not null;

create trigger pedidos_atualizado_em
  before update on public.pedidos
  for each row execute function app.tocar_atualizado_em();

-- O nome da entidade vai como argumento: `app.auditar` monta a ação a partir
-- dele (`pedido.criado`, `pedido.editado`). Sem o argumento, a ação sai nula e
-- o INSERT falha na constraint de `logs_auditoria` — o que é bom, porque a
-- auditoria não pode falhar em silêncio.
create trigger pedidos_auditoria
  after insert or update or delete on public.pedidos
  for each row execute function app.auditar('pedido');

-- -----------------------------------------------------------------------------
-- RLS
--
-- Leitura: membro ativo da empresa vê os pedidos dela, e mais ninguém.
-- Escrita: NENHUM papel de cliente tem verbo de escrita. Todo pedido nasce,
-- muda de status e é cancelado por RPC `security definer`, que revalida
-- permissão, estado da conta e transição — mesma disciplina de `vendas`.
-- -----------------------------------------------------------------------------
alter table public.pedidos      enable row level security;
alter table public.pedido_itens enable row level security;

create policy pedidos_leitura on public.pedidos
  for select to authenticated
  using (empresa_id = (select app.empresa_atual()));

create policy pedido_itens_leitura on public.pedido_itens
  for select to authenticated
  using (
    exists (
      select 1 from public.pedidos p
      where p.id = pedido_itens.pedido_id
        and p.empresa_id = (select app.empresa_atual())
    )
  );

revoke all on public.pedidos      from anon, authenticated;
revoke all on public.pedido_itens from anon, authenticated;

grant select on public.pedidos      to authenticated;
grant select on public.pedido_itens to authenticated;

-- -----------------------------------------------------------------------------
-- A superfície pública
--
-- Estas duas views são o ÚNICO caminho pelo qual o papel `anon` enxerga dados
-- de uma empresa. Nem `produtos` nem `empresas` ganham política para `anon`:
-- assim, uma coluna nova nasce privada, e só passa a ser pública se alguém a
-- adicionar explicitamente aqui.
--
-- `security_invoker = off` (o padrão), diferente do resto do projeto: é
-- justamente o ponto — a view lê as tabelas com o privilégio do dono e aplica
-- ela mesma o recorte do que é público. Com `on`, ela dependeria de dar acesso
-- de leitura ao `anon` nas tabelas de origem, que é o que se quer evitar.
--
-- A vitrine também respeita a assinatura: conta cancelada ou sem assinatura
-- vigente sai do ar. Uma loja no ar recebendo pedidos sem assinatura ativa
-- seria serviço prestado fora do contrato.
-- -----------------------------------------------------------------------------
create view public.vitrine_lojas as
select
  e.id,
  e.loja_slug                as slug,
  e.nome,
  e.loja_descricao           as descricao,
  e.logo_url,
  e.whatsapp,
  e.endereco,
  e.chave_pix is not null    as aceita_pix
from public.empresas e
where e.loja_ativa
  and e.loja_slug is not null
  and e.status = 'ativa'
  and exists (
    select 1 from public.assinaturas a
    where a.empresa_id = e.id
      and a.status in ('trial', 'ativa', 'carencia')
  );

create view public.vitrine_produtos as
select
  p.id,
  p.empresa_id,
  e.loja_slug                                            as loja_slug,
  p.nome,
  p.descricao,
  p.preco,
  p.imagens,
  greatest(p.estoque_atual - p.estoque_reservado, 0)     as disponivel
from public.produtos p
join public.empresas e on e.id = p.empresa_id
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

comment on view public.vitrine_lojas is
  'Superfície pública da loja. Note o que NÃO sai daqui: cnpj, telefone '
  'interno, a própria chave Pix (só o fato de existir) e qualquer dado de '
  'assinatura.';
comment on view public.vitrine_produtos is
  'Superfície pública do catálogo. Não expõe codigo, estoque_atual, atributos '
  'nem criado_por — só o que um cliente precisa para escolher.';

grant select on public.vitrine_lojas    to anon, authenticated;
grant select on public.vitrine_produtos to anon, authenticated;
