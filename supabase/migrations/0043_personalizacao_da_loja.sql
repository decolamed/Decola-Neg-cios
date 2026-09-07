-- =============================================================================
-- 0043 — A loja passa a ser do lojista, não da plataforma
-- =============================================================================
-- Hoje toda vitrine sai igual: mesmo azul, sem logo, encabeçada pela razão
-- social. Quem manda o link para o cliente dele está mandando uma página que
-- não parece dele. Esta migração dá ao gestor as quatro peças que resolvem
-- isso — nome de exibição, logo, cor e banners — e nada além delas.
--
-- POR QUE NÃO UM EDITOR DE TEMA. Cada campo aqui é uma decisão que o lojista
-- consegue tomar em dez segundos olhando a própria fachada. Um seletor de
-- tipografia, de espaçamento ou de layout seria devolver a ele um problema de
-- design que ele não pediu — e a vitrine sairia pior, não mais dele.
--
-- ONDE A COR ENTRA, E ONDE NÃO. `loja_cor` pinta faixa do topo e botões. Não
-- pinta fundo de página nem texto corrido: contraste de leitura não é algo
-- para ficar à mercê de um seletor de cor. O texto sobre a cor é calculado
-- pela luminância, no cliente, para que amarelo receba texto escuro e
-- azul-marinho receba texto claro sem ninguém precisar escolher isso.
-- =============================================================================

alter table public.empresas
  add column if not exists loja_nome           text,
  add column if not exists loja_cor            text,
  add column if not exists loja_banners        jsonb   not null default '[]'::jsonb,
  add column if not exists loja_banners_ativos boolean not null default true;

comment on column public.empresas.loja_nome is
  'Nome que aparece na vitrine. Nulo significa usar `nome` — a maioria das '
  'lojas não precisa de dois nomes, e obrigar a preencher seria fazer o '
  'lojista repetir o que já digitou no cadastro.';

comment on column public.empresas.loja_cor is
  'Cor de destaque da vitrine, em #RRGGBB. Nula significa a cor da plataforma.';

comment on column public.empresas.loja_banners is
  'Banners do carrossel, em ordem: [{"caminho": "<empresa>/banners/x.jpg", '
  '"link": "https://..."}]. Caminhos no bucket `loja`, nunca URLs — trocar o '
  'domínio do Storage não pode obrigar a reescrever linha de empresa.';

comment on column public.empresas.loja_banners_ativos is
  'Interruptor do carrossel. Separado da lista de propósito: desligar para uma '
  'temporada não pode custar apagar os banners e ter de subir tudo de novo.';

-- -----------------------------------------------------------------------------
-- Limites
-- -----------------------------------------------------------------------------
-- Nome vazio não é nome: string em branco viraria um topo sem nada, e o
-- fallback para `nome` nunca aconteceria.
alter table public.empresas
  drop constraint if exists empresas_loja_nome_nao_vazio;
alter table public.empresas
  add constraint empresas_loja_nome_nao_vazio
  check (loja_nome is null or length(btrim(loja_nome)) between 1 and 60);

alter table public.empresas
  drop constraint if exists empresas_loja_cor_formato;
alter table public.empresas
  add constraint empresas_loja_cor_formato
  check (loja_cor is null or loja_cor ~ '^#[0-9A-Fa-f]{6}$');

-- Cinco é o que cabe num carrossel que alguém realmente vê até o fim. Sem
-- teto, a vitrine vira um álbum e a primeira dobra deixa de vender.
alter table public.empresas
  drop constraint if exists empresas_loja_banners_formato;
alter table public.empresas
  add constraint empresas_loja_banners_formato
  check (
    jsonb_typeof(loja_banners) = 'array'
    and jsonb_array_length(loja_banners) <= 5
  );

-- -----------------------------------------------------------------------------
-- A vitrine passa a devolver a personalização
-- -----------------------------------------------------------------------------
-- `nome` continua saindo resolvido: quem consome não deveria precisar saber
-- que existe um fallback.
create or replace view public.vitrine_lojas as
select
  e.id,
  e.loja_slug                                   as slug,
  coalesce(nullif(btrim(e.loja_nome), ''), e.nome) as nome,
  e.loja_descricao                              as descricao,
  e.logo_url,
  e.whatsapp,
  e.endereco,
  e.chave_pix is not null                       as aceita_pix,
  e.loja_cor,
  -- Desligado é lista vazia, e não uma bandeira a mais para o site conferir:
  -- quem desenha a página só precisa saber o que mostrar.
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

-- =============================================================================
-- Bucket `loja` — logo e banners
-- =============================================================================
-- Separado de `produtos` porque a PERMISSÃO é outra: foto de produto é de quem
-- cadastra produto; a cara da loja é decisão de Gestor. Misturar os dois num
-- bucket só significaria escolher qual das duas regras trair.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loja', 'loja', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "loja_leitura_publica"    on storage.objects;
drop policy if exists "loja_envio_do_gestor"    on storage.objects;
drop policy if exists "loja_troca_do_gestor"    on storage.objects;
drop policy if exists "loja_remocao_do_gestor"  on storage.objects;

-- Leitura aberta: a vitrine é consultada sem sessão.
create policy "loja_leitura_publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'loja');

-- Escrita: Gestor, e só na pasta da própria empresa. A primeira pasta do
-- caminho é o `empresa_id` — é sobre ela que a comparação acontece.
create policy "loja_envio_do_gestor"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'loja'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
    and app.pode_escrever_como_gestor(app.empresa_atual())
  );

create policy "loja_troca_do_gestor"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'loja'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
    and app.pode_escrever_como_gestor(app.empresa_atual())
  )
  with check (
    bucket_id = 'loja'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
  );

create policy "loja_remocao_do_gestor"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'loja'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
    and app.pode_escrever_como_gestor(app.empresa_atual())
  );
