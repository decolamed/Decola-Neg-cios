-- 0064 — a função `aceitar-convite` precisa ler UM convite, e só.
--
-- A 0030 tirou do `service_role` o acesso direto às tabelas de plataforma, e
-- com razão: a chave de serviço ignora RLS, e dar-lhe `select` em
-- `empresa_usuarios` seria dar-lhe a equipe inteira de todas as empresas do
-- produto para resolver uma pergunta sobre uma linha.
--
-- Foi exatamente isso que o teste da função nova encontrou: ela respondia
-- "não foi possível verificar o convite agora" para um convite que existia,
-- porque a leitura era recusada. O conserto certo não é devolver a tabela — é
-- responder a pergunta.
--
-- ESTA FUNÇÃO NÃO É PARA O NAVEGADOR. Só o `service_role` executa; `anon` e
-- `authenticated` são revogados explicitamente. Do lado de quem não tem a
-- chave, o convite continua invisível até ser aceito, como sempre foi.
--
-- O QUE ELA NÃO DEVOLVE: permissões, papel, e quem mais está na empresa. Só o
-- necessário para decidir se dá para criar a conta e em qual endereço.
create or replace function public.convite_para_cadastro(p_vinculo_id uuid)
returns table (
  email_convite     text,
  nome_convite      text,
  status            text,
  convite_expira_em timestamptz,
  empresa_nome      text
)
language sql
security definer
set search_path to ''
stable
as $function$
  select lower(eu.email_convite), eu.nome_convite, eu.status::text,
         eu.convite_expira_em, e.nome
  from public.empresa_usuarios eu
  join public.empresas e on e.id = eu.empresa_id
  where eu.id = p_vinculo_id;
$function$;

comment on function public.convite_para_cadastro(uuid) is
  'Um convite, para a Edge Function aceitar-convite criar a conta no endereço '
  'certo. Exclusiva do service_role: a 0030 tirou dele o select direto em '
  'empresa_usuarios, e responder a pergunta é mais estreito que devolver a tabela.';

revoke all on function public.convite_para_cadastro(uuid) from public, anon, authenticated;
grant execute on function public.convite_para_cadastro(uuid) to service_role;
