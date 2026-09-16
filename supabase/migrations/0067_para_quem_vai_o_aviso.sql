-- 0067 — para quem vai o aviso, e o que ele diz.
--
-- A função `enviar-push` precisa de três coisas sobre uma notificação: o texto,
-- quem deve receber, e a inscrição de cada aparelho dessas pessoas. Isso são
-- quatro tabelas — e a 0030 tirou do `service_role` o acesso direto a elas, de
-- propósito: a chave de serviço ignora RLS, e dar-lhe `select` em
-- `empresa_usuarios` seria a equipe inteira de todas as empresas nas mãos de
-- uma função que só precisa de uma linha.
--
-- Mesma decisão da 0064: responder a pergunta é mais estreito que devolver as
-- tabelas.
--
-- QUEM RECEBE:
--   destinatário definido .... só ele (é o caso do convite, do aviso pessoal);
--   destinatário nulo ........ todo mundo com vínculo ATIVO naquela empresa.
--
-- A PREFERÊNCIA DO USUÁRIO MANDA. `preferencias_notificacao` já existia e já
-- valia dentro do aplicativo; ela passa a valer também aqui, senão desligar
-- "estoque" nas configurações silenciaria a tela e continuaria acordando o
-- celular às 6h da manhã. Sem linha de preferência, recebe — é o padrão da
-- tabela, e o silêncio não pode ser o comportamento de quem nunca escolheu.
create or replace function public.destinos_do_push(p_notificacao_id uuid)
returns table (
  titulo    text,
  mensagem  text,
  categoria text,
  entidade  text,
  entidade_id uuid,
  endpoint  text,
  p256dh    text,
  auth      text
)
language sql
security definer
set search_path to ''
stable
as $function$
  with aviso as (
    select n.* from public.notificacoes n where n.id = p_notificacao_id
  ),
  gente as (
    select eu.usuario_id
    from public.empresa_usuarios eu, aviso a
    where eu.empresa_id = a.empresa_id
      and eu.status = 'ativo'
      and eu.usuario_id is not null
      and (a.destinatario_id is null or eu.usuario_id = a.destinatario_id)
  )
  select a.titulo, a.mensagem, a.categoria::text, a.entidade, a.entidade_id,
         i.endpoint, i.p256dh, i.auth
  from aviso a
  join gente g on true
  join public.inscricoes_web_push i on i.usuario_id = g.usuario_id
  left join public.preferencias_notificacao p on p.usuario_id = g.usuario_id
  where case a.categoria
          when 'estoque'        then coalesce(p.estoque, true)
          when 'assinatura'     then coalesce(p.assinatura, true)
          when 'administrativo' then coalesce(p.administrativo, true)
          when 'pedido'         then coalesce(p.pedido, true)
          else true
        end;
$function$;

comment on function public.destinos_do_push(uuid) is
  'O texto do aviso e as inscrições de quem deve recebê-lo, já filtradas pela '
  'preferência de cada um. Exclusiva do service_role: a 0030 tirou dele o '
  'acesso direto às tabelas, e responder a pergunta é mais estreito.';

revoke all on function public.destinos_do_push(uuid) from public, anon, authenticated;
grant execute on function public.destinos_do_push(uuid) to service_role;

-- Uma inscrição que o navegador declarou morta (404/410) é apagada pela função.
create or replace function public.esquecer_inscricao_push(p_endpoint text)
returns void
language sql
security definer
set search_path to ''
as $function$
  delete from public.inscricoes_web_push where endpoint = p_endpoint;
$function$;

revoke all on function public.esquecer_inscricao_push(text) from public, anon, authenticated;
grant execute on function public.esquecer_inscricao_push(text) to service_role;
