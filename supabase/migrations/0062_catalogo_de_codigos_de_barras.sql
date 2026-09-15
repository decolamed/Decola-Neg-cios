-- 0062 — Catálogo de códigos de barras da Decola.
--
-- O QUE É. Uma tabela COMPARTILHADA entre todas as lojas: o que se sabe sobre
-- um código de barras (nome, marca, categoria, foto) não é de ninguém em
-- particular — o mesmo shampoo tem o mesmo código na padaria e na farmácia. É o
-- "banco interno" do fluxo: escanear → procurar aqui → só então API externa.
--
-- POR QUE COMPARTILHADA, e não por empresa. Consulta a API externa custa tempo
-- (e cota). Se cada loja tivesse o próprio cache, o mesmo código seria buscado
-- de novo em cada uma — e o ganho de "a segunda vez é instantânea" só valeria
-- dentro de uma loja só. Aqui o primeiro lojista que escaneia um produto
-- resolve a consulta para todos os outros.
--
-- O QUE NÃO ENTRA AQUI: PREÇO. Ele é de cada loja, e um preço compartilhado
-- seria o preço de outra pessoa aparecendo no cadastro de quem está vendendo.
-- Estoque, pelo mesmo motivo, também não.
create table if not exists public.catalogo_codigos (
  codigo        text primary key,
  nome          text not null,
  marca         text,
  categoria     text,
  /** Caminho no bucket `catalogo`, ou URL externa quando não deu para copiar. */
  imagem        text,
  /** De onde veio: openfoodfacts, openbeautyfacts, openproductsfacts, upcitemdb. */
  origem        text not null,
  /** A resposta crua, para conseguir melhorar o aproveitamento depois. */
  dados         jsonb not null default '{}'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.catalogo_codigos is
  'Catálogo compartilhado de códigos de barras. Preenchido pela função '
  'buscar-codigo quando uma API externa responde, para a próxima consulta do '
  'mesmo código não sair daqui. Não guarda preço nem estoque: esses são de '
  'cada loja.';

alter table public.catalogo_codigos enable row level security;

-- Qualquer lojista autenticado LÊ (é catálogo, não dado de ninguém). Ninguém
-- escreve pelo cliente: quem grava é a Edge Function, com a chave de serviço.
drop policy if exists catalogo_leitura on public.catalogo_codigos;
create policy catalogo_leitura on public.catalogo_codigos
  for select to authenticated
  using (true);

revoke all on public.catalogo_codigos from anon, authenticated;
grant select on public.catalogo_codigos to authenticated;

-- A 0030 negou ao `service_role` as tabelas de plataforma; esta é dele.
grant select, insert, update on public.catalogo_codigos to service_role;

-- Busca por nome no catálogo, para um "procurar sem código" no futuro.
create index if not exists catalogo_codigos_nome_idx
  on public.catalogo_codigos using gin (to_tsvector('portuguese', nome));

-- ---------------------------------------------------------------------------
-- O bucket das fotos do catálogo.
--
-- POR QUE COPIAR A IMAGEM em vez de guardar o link de onde ela veio: o link é
-- de terceiros. Ele sai do ar, muda de caminho, ou simplesmente para de
-- responder — e a foto some da loja do lojista sem que ninguém tenha mexido em
-- nada. Copiar uma vez custa uma requisição; depender do link custa um produto
-- sem foto, um dia qualquer, sem aviso.
--
-- SEM POLÍTICA DE ESCRITA, de propósito. Quem grava aqui é a função
-- `buscar-codigo`, com a chave de serviço (que não passa por RLS). Nenhum
-- navegador precisa — nem deve — escrever no catálogo compartilhado: uma foto
-- errada aqui apareceria na loja de todo mundo. A leitura é pública porque o
-- bucket é público, e é assim que a foto chega à vitrine.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo', 'catalogo', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
