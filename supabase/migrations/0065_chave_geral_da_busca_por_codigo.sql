-- 0065 — a chave geral da busca por código de barras.
--
-- POR QUE ELA EXISTE. A busca por código depende de três APIs externas que não
-- são nossas: o catálogo da Decola, a Open Food Facts (e irmãs) e o UPCitemdb.
-- Quando uma delas fica instável — lenta, devolvendo lixo, ou fora do ar — o
-- efeito chega ao lojista como um cadastro que trava ou que preenche errado.
--
-- Sem esta chave, apagar o incêndio exigiria publicar código: mexer na função,
-- esperar o deploy, e reverter depois. Com ela, é um clique no painel da
-- plataforma e volta a ser um clique quando o problema passar.
--
-- ONDE ELA MORA. Em `configuracoes_plataforma`, a linha única que já guarda o
-- trial e a carência. É configuração DA PLATAFORMA, não de cada empresa: um
-- lojista não deve poder desligar (nem ligar) a busca para ele.
--
-- LIGADA POR PADRÃO. O estado normal é funcionar; desligar é a exceção, e uma
-- exceção que exige alguém decidir por ela.
alter table public.configuracoes_plataforma
  add column if not exists busca_por_codigo_ativa boolean not null default true;

comment on column public.configuracoes_plataforma.busca_por_codigo_ativa is
  'Chave geral da busca por código de barras (Edge Function buscar-codigo). '
  'Desligada, a função responde "desligada" sem consultar API nenhuma e o '
  'cadastro de produto segue com o nome digitado à mão.';

-- ---------------------------------------------------------------------------
-- OS GRANTS DA COLUNA NOVA, e isto NÃO é formalidade.
--
-- A 0007 não deu privilégio de tabela a esta tabela: deu coluna por coluna. Uma
-- coluna nova nasce sem nenhum, e o efeito é cruel — o painel salva, o banco
-- devolve sucesso, e o valor não muda. Ninguém vê erro em lugar nenhum.
--
-- Leitura para todos (a tela pública de planos já lê esta linha), escrita só
-- para `authenticated` — e a política `configuracoes_escrita_admin` continua
-- sendo quem exige ser administrador da plataforma.
grant select (busca_por_codigo_ativa) on public.configuracoes_plataforma to anon, authenticated;
grant update (busca_por_codigo_ativa) on public.configuracoes_plataforma to authenticated;

-- A Edge Function lê com a chave de serviço: ela precisa enxergar a coluna
-- para saber se pode sair consultando as APIs.
grant select (busca_por_codigo_ativa) on public.configuracoes_plataforma to service_role;
