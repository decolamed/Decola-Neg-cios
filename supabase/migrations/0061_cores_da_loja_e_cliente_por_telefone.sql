-- ============================================================================
-- 0061 — Três cores da loja, e o cliente identificado pelo telefone
--
-- Duas mudanças que não têm nada a ver uma com a outra, na mesma migração
-- porque foram pedidas juntas e as duas mexem em `vitrine_lojas` (que só pode
-- ser substituída uma vez por vez, com as colunas novas no fim).
-- ============================================================================

-- ============================================================ as três cores
-- `loja_cor` continua sendo a cor de DESTAQUE (barra, preço, botões). As duas
-- novas são o fundo da página e a cor do texto.
--
-- POR QUE SÓ TRÊS. A vitrine usa uma dúzia de cores — superfície dos cartões,
-- texto secundário, linhas, o ladrilho atrás da foto. As outras nove são
-- DERIVADAS destas três no site (`apps/site/src/dados/paleta.ts`), com o
-- contraste conferido antes de aplicar. Pedir doze ao lojista seria pedir que
-- ele fosse designer; pedir três e derivar o resto é o que faz a loja continuar
-- parecendo desenhada depois de mexerem nela.
alter table public.empresas
  add column if not exists loja_cor_fundo text,
  add column if not exists loja_cor_texto text;

alter table public.empresas
  drop constraint if exists empresas_loja_cor_fundo_formato;
alter table public.empresas
  drop constraint if exists empresas_loja_cor_texto_formato;

alter table public.empresas
  add constraint empresas_loja_cor_fundo_formato
  check (loja_cor_fundo is null or loja_cor_fundo ~ '^#[0-9A-Fa-f]{6}$');
alter table public.empresas
  add constraint empresas_loja_cor_texto_formato
  check (loja_cor_texto is null or loja_cor_texto ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.empresas.loja_cor_fundo is
  'Cor de fundo da vitrine (#RRGGBB). Nula = o cinza-azulado do desenho.';
comment on column public.empresas.loja_cor_texto is
  'Cor do texto da vitrine (#RRGGBB). Nula = o azul-tinta do desenho. O site '
  'ainda mede o contraste antes de usar: cor ilegível sobre o fundo escolhido '
  'é trocada pela automática.';

-- A 0007 revogou UPDATE da tabela e devolveu coluna a coluna; coluna nova
-- nasce sem escrita, e a tela gravaria "com sucesso" sem gravar nada.
grant update (loja_cor_fundo, loja_cor_texto) on public.empresas to authenticated;

-- ======================================================= carrinho do cliente
--
-- O carrinho da vitrine sempre viveu no `localStorage`, porque a loja é sem
-- login. Agora que o cliente pode se identificar pelo telefone, o carrinho dele
-- pode atravessar aparelhos — mas continua sendo POR LOJA: a chave é
-- (empresa, telefone), nunca só o telefone.
create table if not exists public.vitrine_carrinhos (
  empresa_id  uuid        not null references public.empresas(id) on delete cascade,
  telefone    text        not null,
  itens       jsonb       not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, telefone)
);

comment on table public.vitrine_carrinhos is
  'Carrinho do cliente identificado pelo telefone, por loja. Guarda só '
  'produto_id e quantidade — preço e nome são relidos da vitrine, como no '
  'carrinho local: preço congelado no navegador por três dias seria uma '
  'promessa que a loja não fez.';

-- Ninguém fala com esta tabela direto. Só as funções abaixo, que são
-- `security definer` e conferem a loja.
alter table public.vitrine_carrinhos enable row level security;
revoke all on public.vitrine_carrinhos from anon, authenticated;

-- ================================================ pedidos por telefone
--
-- SEM VERIFICAÇÃO POR SMS, por decisão do produto. A função anterior
-- (`vitrine_meus_pedidos`, migração 0048) lê o telefone de dentro do token do
-- Auth e continua existindo; esta aceita o número DIGITADO.
--
-- O QUE ISSO CUSTA, dito aqui para não se perder: quem digitar o número de
-- outra pessoa vê os pedidos dela naquela loja, endereço de entrega incluído.
-- É o preço de não pedir código, e foi escolhido sabendo disso. Na prática o
-- caminho com código nunca esteve no ar — SMS é serviço pago por mensagem, e
-- sem provedor a tela só sabia dizer "o envio por SMS ainda não está ligado
-- nesta loja".
--
-- O QUE CONTINUA PROTEGIDO: a loja. `p_loja_slug` é obrigatório e a consulta é
-- presa a ele, então um telefone conhecido numa loja não abre as outras — cada
-- lojista só expõe o que é dele.
create or replace function public.vitrine_pedidos_do_telefone(
  p_loja_slug text,
  p_telefone  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefone text := app.telefone_comparavel(nullif(btrim(coalesce(p_telefone, '')), ''));
  v_lista jsonb;
begin
  if p_loja_slug is null or btrim(p_loja_slug) = '' then
    raise exception 'Informe a loja.' using errcode = '22023';
  end if;
  if v_telefone is null or length(v_telefone) < 12 then
    raise exception 'Informe um telefone com DDD.' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'numero',     p.numero,
        'token',      p.token,
        'status',     p.status,
        'modalidade', p.modalidade,
        'pagamento',  p.pagamento,
        'subtotal',   p.subtotal,
        'criado_em',  p.criado_em,
        'loja_nome',  coalesce(nullif(btrim(e.loja_nome), ''), e.nome),
        'loja_slug',  e.loja_slug,
        'itens',      (select count(*) from public.pedido_itens i where i.pedido_id = p.id)
      )
      order by p.criado_em desc
    ),
    '[]'::jsonb
  )
  into v_lista
  from public.pedidos p
  join public.empresas e on e.id = p.empresa_id
  where app.telefone_comparavel(p.cliente_telefone) = v_telefone
    and lower(e.loja_slug) = lower(btrim(p_loja_slug));

  return v_lista;
end;
$$;

comment on function public.vitrine_pedidos_do_telefone(text, text) is
  'Pedidos de um telefone DIGITADO, presos a uma loja. Sem verificação por '
  'código, por decisão do produto: quem souber o número de outra pessoa vê os '
  'pedidos dela NAQUELA loja. A loja é o limite — o mesmo número não alcança '
  'as outras.';

grant execute on function public.vitrine_pedidos_do_telefone(text, text) to anon, authenticated;

-- ============================================== ler e gravar o carrinho
create or replace function public.vitrine_carrinho_ler(
  p_loja_slug text,
  p_telefone  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefone text := app.telefone_comparavel(nullif(btrim(coalesce(p_telefone, '')), ''));
  v_itens jsonb;
begin
  if v_telefone is null or length(v_telefone) < 12 then
    raise exception 'Informe um telefone com DDD.' using errcode = '22023';
  end if;

  select c.itens into v_itens
  from public.vitrine_carrinhos c
  join public.empresas e on e.id = c.empresa_id
  where c.telefone = v_telefone
    and lower(e.loja_slug) = lower(btrim(coalesce(p_loja_slug, '')));

  return coalesce(v_itens, '[]'::jsonb);
end;
$$;

create or replace function public.vitrine_carrinho_gravar(
  p_loja_slug text,
  p_telefone  text,
  p_itens     jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefone text := app.telefone_comparavel(nullif(btrim(coalesce(p_telefone, '')), ''));
  v_empresa uuid;
begin
  if v_telefone is null or length(v_telefone) < 12 then
    raise exception 'Informe um telefone com DDD.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_itens, 'null'::jsonb)) <> 'array' then
    raise exception 'Carrinho inválido.' using errcode = '22023';
  end if;
  -- Um carrinho enorme não é carrinho, é alguém enchendo a tabela.
  if jsonb_array_length(p_itens) > 100 then
    raise exception 'Carrinho grande demais.' using errcode = '22023';
  end if;

  select e.id into v_empresa
  from public.empresas e
  where lower(e.loja_slug) = lower(btrim(coalesce(p_loja_slug, '')))
    and e.loja_ativa
    and e.status = 'ativa';

  -- Loja que não existe (ou saiu do ar) não ganha carrinho. Sem exceção: quem
  -- está com a aba aberta quando o lojista desliga a loja não precisa ver erro.
  if v_empresa is null then
    return;
  end if;

  insert into public.vitrine_carrinhos (empresa_id, telefone, itens, atualizado_em)
  values (v_empresa, v_telefone, p_itens, now())
  on conflict (empresa_id, telefone)
  do update set itens = excluded.itens, atualizado_em = now();
end;
$$;

comment on function public.vitrine_carrinho_ler(text, text) is
  'Carrinho guardado daquele telefone NAQUELA loja. Lista vazia quando não há.';
comment on function public.vitrine_carrinho_gravar(text, text, jsonb) is
  'Guarda o carrinho do telefone naquela loja. Loja fora do ar simplesmente '
  'não guarda, sem erro para quem está com a aba aberta.';

grant execute on function public.vitrine_carrinho_ler(text, text) to anon, authenticated;
grant execute on function public.vitrine_carrinho_gravar(text, text, jsonb) to anon, authenticated;

-- ===================================================== vitrine: as cores
-- `create or replace`: colunas novas só entram no fim. Ver a nota da 0059 sobre
-- por que esta view NÃO é derrubada e recriada.
create or replace view public.vitrine_lojas
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
  case when e.loja_banners_ativos then e.loja_banners else '[]'::jsonb end as banners,
  coalesce(e.loja_tema, '{}'::jsonb)               as tema,
  e.horario_funcionamento,
  e.loja_cor_fundo,
  e.loja_cor_texto
from public.empresas e
where e.loja_ativa
  and e.loja_slug is not null
  and e.status = 'ativa'
  and exists (
    select 1 from public.assinaturas a
    where a.empresa_id = e.id
      and a.status in ('trial', 'ativa', 'carencia')
  );

grant select on public.vitrine_lojas to anon, authenticated;
