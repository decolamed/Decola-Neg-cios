-- 0068 — as chaves VAPID do Web Push.
--
-- ONDE ELAS MORAM, e por quê. A chave PRIVADA fica nesta tabela, ao lado do
-- segredo do gatilho — a mesma que não tem política nenhuma e cujo privilégio
-- foi revogado de `anon` e `authenticated` na 0066. Só o `service_role` lê, e
-- ele só existe dentro das Edge Functions.
--
-- O lugar canônico seria um secret do projeto. A escolha aqui é deliberada e
-- tem um motivo concreto: secret é configuração que envelhece calada, e este
-- projeto já foi mordido por isso duas vezes (a `URL_CONVITE_BASE` que ninguém
-- cadastrou e mandava o funcionário para um esquema de app nativo; a URL do
-- site guardada em painel). Um valor que o código cria e o código lê não tem
-- como ficar faltando num ambiente novo.
--
-- A CHAVE PÚBLICA NÃO É SEGREDO: ela vai no aplicativo, em texto claro, porque
-- é com ela que o navegador monta a inscrição. Está aqui só para as duas
-- ficarem juntas e ninguém trocar uma sem a outra — um par desemparelhado
-- produz inscrições que o serviço de push recusa, e o sintoma é silêncio.
--
-- TROCAR O PAR INVALIDA AS INSCRIÇÕES EXISTENTES. É o comportamento do padrão,
-- não uma limitação daqui: quem trocar precisa limpar `inscricoes_web_push` e
-- deixar os aparelhos se inscreverem de novo.
alter table public.segredo_do_push
  add column if not exists vapid_publica text,
  add column if not exists vapid_privada text;

update public.segredo_do_push
set vapid_publica = 'BA6jAIkVDdfrlfjNjHaRZEmDaD5z8eJJpze47RPSaKSkkElRuD0s7RuTYNCZ-wApSx525wOCgyYQ6Zkakq8aPsY',
    vapid_privada = 'WJ7WFsCMnSUghcIiVIvQ5fJOUqito_KTZAvMaLZhpBc'
where vapid_privada is null;

comment on table public.segredo_do_push is
  'Linha única: o segredo que o gatilho apresenta à função enviar-push, e o par '
  'de chaves VAPID. Sem política de RLS e sem privilégio para anon/authenticated '
  '— só o service_role, de dentro das Edge Functions.';
