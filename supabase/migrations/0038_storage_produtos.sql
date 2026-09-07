-- =============================================================================
-- 0038 — Bucket `produtos`: as fotos que a vitrine mostra
-- =============================================================================
-- `produtos.imagens` (0032) guarda CAMINHOS, não URLs — troca de domínio do
-- Storage não deve obrigar a reescrever linha de produto. Este é o bucket
-- onde esses caminhos existem.
--
-- CONVENÇÃO DE CAMINHO, e ela é a segurança:
--
--     <empresa_id>/<produto_id>/<uuid>.<ext>
--
-- A primeira pasta é o `empresa_id`, e é sobre ela que as políticas de escrita
-- comparam `app.empresa_atual()`. Sem isso, um gestor de uma empresa poderia
-- gravar (ou apagar) foto na pasta de outra — o isolamento por empresa vale
-- para arquivo do mesmo jeito que vale para linha.
--
-- LEITURA É PÚBLICA, de propósito: a vitrine é uma página aberta, consultada
-- sem sessão, e `getPublicUrl` precisa funcionar para o cliente anônimo. O que
-- isso significa na prática: quem tiver a URL vê a foto, inclusive de produto
-- despublicado da loja. Por isso o nome do arquivo é um uuid — a pasta não é
-- enumerável, e nenhum dado além da própria foto vive aqui. Preço, estoque e
-- atributos continuam atrás da RLS de `produtos`.
--
-- O limite de 5 MB e a lista de tipos são a primeira barreira contra upload de
-- arquivo que não é imagem: o Storage recusa antes de gravar, sem depender de
-- validação no aplicativo.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'produtos',
  'produtos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------
-- Idempotentes para a migração poder ser reaplicada num ambiente novo.
drop policy if exists "produtos_leitura_publica"  on storage.objects;
drop policy if exists "produtos_envio_da_empresa" on storage.objects;
drop policy if exists "produtos_troca_da_empresa" on storage.objects;
drop policy if exists "produtos_remocao_da_empresa" on storage.objects;

-- Leitura: qualquer um, com ou sem sessão. É o que a vitrine consome.
create policy "produtos_leitura_publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'produtos');

-- Escrita: só quem pode cadastrar produto NA EMPRESA DONA DA PASTA. Mesma
-- permissão que guarda o cadastro do produto — quem cria o produto é quem põe
-- a foto dele.
create policy "produtos_envio_da_empresa"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
    and app.pode_escrever(app.empresa_atual(), 'cadastrar_produto')
  );

create policy "produtos_troca_da_empresa"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
    and app.pode_escrever(app.empresa_atual(), 'cadastrar_produto')
  )
  with check (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
  );

create policy "produtos_remocao_da_empresa"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'produtos'
    and (storage.foldername(name))[1] = app.empresa_atual()::text
    and app.pode_escrever(app.empresa_atual(), 'cadastrar_produto')
  );
