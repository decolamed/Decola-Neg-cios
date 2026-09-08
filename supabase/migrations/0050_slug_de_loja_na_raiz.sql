-- 0050 — A vitrine passa a morar na raiz, e o banco protege as nossas páginas.
--
-- POR QUE MUDOU. O link da loja era `dominio/loja/nome-da-loja`. Quem divulga
-- esse link é o lojista — no Instagram, no status do WhatsApp, num cartão
-- impresso — e o `/loja/` no meio não diz nada a ninguém: é detalhe da nossa
-- arquitetura ocupando espaço no endereço DELE. Agora é `dominio/nome-da-loja`.
--
-- O QUE ISSO CRIA. Sem prefixo, a loja e as páginas da plataforma passam a
-- disputar o mesmo espaço de nomes. Um lojista que escolhesse `planos` como
-- endereço da loja não ficaria com uma loja quebrada: ele derrubaria a PÁGINA
-- DE PLANOS do site — a página por onde entram todos os novos clientes.
--
-- POR QUE A REGRA É DO BANCO. A tela de configuração da loja já recusa esses
-- nomes, mas a tela é só a primeira porta: a mesma coluna é gravável por RPC e
-- pelo painel administrativo. Uma regra que protege uma página do site inteiro
-- não pode depender de qual caminho o dado percorreu — vale a mesma exigência
-- do restante do produto, de que validação importante seja refeita no banco.
--
-- A LISTA. Tem três origens, e todas precisam estar aqui:
--   1. as rotas do site (planos, cadastro, pagamento, pronto, definir-senha,
--      redefinir-senha, convite, pedido, como-funciona);
--   2. `loja`, para o caminho antigo continuar redirecionando;
--   3. nomes que ainda não são rota nenhuma, mas que reservamos porque um dia
--      podem ser (admin, api, painel, blog…) — e porque, depois que um lojista
--      divulgar o endereço dele, tomá-lo de volta deixa de ser opção.
--
-- Também entram nomes que não são páginas mas quebram na prática: `favicon`,
-- `robots`, `sitemap`, `assets`, e os literais `null` e `undefined`, que
-- aparecem quando algum código monta um link com uma variável vazia.
--
-- IMMUTABLE e `search_path` vazio porque a função é usada num CHECK: o
-- planejador precisa da garantia de que o resultado não muda, e o CHECK roda
-- com os privilégios de QUEM ESCREVE — daí o GRANT para os três papéis, sem o
-- qual a gravação falha com "permission denied for function".

create or replace function app.slug_de_loja_reservado(p_slug text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select lower(coalesce(p_slug, '')) = any (array[
    -- rotas que o site atende hoje
    'planos','cadastro','pagamento','pronto','definir-senha','redefinir-senha',
    'convite','pedido','como-funciona','loja',
    -- reservadas por prudência: caminhos que este produto provavelmente terá
    'admin','app','api','painel','login','entrar','sair','conta','perfil',
    'suporte','ajuda','sobre','termos','privacidade','contato','blog',
    -- nomes que o navegador e a hospedagem usam
    'assets','static','public','favicon','robots','sitemap','index',
    'null','undefined','www'
  ]);
$$;

grant execute on function app.slug_de_loja_reservado(text)
  to authenticated, anon, service_role;

alter table public.empresas
  add constraint empresas_loja_slug_nao_reservado
  check (loja_slug is null or not app.slug_de_loja_reservado(loja_slug));
