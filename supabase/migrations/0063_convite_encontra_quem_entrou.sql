-- 0063 — o convite pendente encontra quem acabou de entrar.
--
-- O QUE ACONTECEU. Um funcionário recebeu o convite, criou a conta, e o aceite
-- não chegou a acontecer (o cadastro dependia de uma confirmação de e-mail que
-- largava a pessoa noutra página). No login seguinte ele leu, em vermelho:
-- "Você não está vinculado a nenhuma empresa ativa no momento."
--
-- A frase é verdadeira e é INÚTIL. Havia um convite aberto, com o nome dele,
-- para o e-mail exato com que ele tinha acabado de entrar — e o produto, que
-- sabia disso, mandou procurar o Gestor.
--
-- O cadastro foi consertado noutro lugar (a função `aceitar-convite` cria a
-- conta no servidor, sem segundo e-mail). Esta migração conserta o BECO: quem
-- entra sem empresa e tem convite pendente passa a ser levado ao aceite.

-- ---------------------------------------------------------------------------
-- 1. O e-mail ausente não pode virar "qualquer e-mail serve".
--
-- `aceitar_convite` comparava `lower(email_convite) <> v_email`. Se
-- `public.usuarios` não tivesse a linha do usuário (o gatilho
-- `auth_usuario_criado` a cria, mas basta ele falhar uma vez), `v_email` seria
-- NULL — e a comparação daria NULL, que num `if` do plpgsql NÃO dispara. A
-- guarda de e-mail sumiria em silêncio, e qualquer autenticado aceitaria
-- qualquer convite.
--
-- Hoje não há nenhuma linha faltando: conferi antes de mexer. Isso não torna a
-- guarda correta — torna a falha adormecida. `is distinct from` compara NULL
-- como diferente, e a ausência de e-mail passa a ser recusa explícita.
create or replace function public.aceitar_convite(p_vinculo_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_usuario uuid := (select auth.uid());
  v_email text;
  v_vinculo public.empresa_usuarios%rowtype;
begin
  if v_usuario is null then
    raise exception 'É necessário estar autenticado para aceitar o convite.' using errcode = '42501';
  end if;

  select lower(u.email) into v_email from public.usuarios u where u.id = v_usuario;

  if v_email is null then
    raise exception 'Não foi possível confirmar o e-mail da sua conta. Entre de novo e tente outra vez.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.empresa_usuarios eu
    where eu.usuario_id = v_usuario and eu.status = 'ativo'
  ) then
    raise exception 'Esta conta já está vinculada a uma empresa.' using errcode = '23505';
  end if;

  select * into v_vinculo from public.empresa_usuarios where id = p_vinculo_id for update;

  if not found or v_vinculo.status <> 'convidado' then
    raise exception 'Convite não encontrado.' using errcode = '23503';
  end if;

  if lower(v_vinculo.email_convite) is distinct from v_email then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;

  if v_vinculo.convite_expira_em < now() then
    raise exception 'Este convite expirou. Peça ao Gestor para reenviá-lo.' using errcode = '22023';
  end if;

  update public.empresa_usuarios
  set usuario_id = v_usuario, status = 'ativo', aceito_em = now()
  where id = p_vinculo_id;

  return v_vinculo.empresa_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. "Existe um convite esperando por mim?"
--
-- A RLS de `empresa_usuarios` só enxerga quem já é da empresa — por isso o
-- convidado nunca conseguiu ler o próprio convite, e por isso esta função é
-- `security definer`.
--
-- ELA NÃO ABRE NADA. Só devolve convites cujo `email_convite` é EXATAMENTE o
-- e-mail da sessão, e só os que ainda estão `convidado` e dentro do prazo.
-- Quem chama já provou ser dono daquele e-mail — entrou com ele. O único dado
-- novo que ela entrega é a existência de um convite para a própria pessoa, que
-- é justamente o que o e-mail dela já dizia.
create or replace function public.meu_convite_pendente()
returns table (vinculo_id uuid, empresa_nome text, convite_expira_em timestamptz)
language sql
security definer
set search_path to ''
stable
as $function$
  select eu.id, e.nome, eu.convite_expira_em
  from public.empresa_usuarios eu
  join public.empresas e on e.id = eu.empresa_id
  where eu.status = 'convidado'
    and eu.convite_expira_em >= now()
    and lower(eu.email_convite) = (
      select lower(u.email) from public.usuarios u where u.id = (select auth.uid())
    )
    -- Conta sem e-mail no espelho não casa com convite nenhum: sem isto, o
    -- `= NULL` da comparação acima já devolveria vazio, mas deixar explícito
    -- evita que uma mudança futura reabra a porta que a parte 1 fechou.
    and (select auth.uid()) is not null
  order by eu.convidado_em desc
  limit 1;
$function$;

comment on function public.meu_convite_pendente() is
  'O convite em aberto para o e-mail da sessão, se houver. Existe porque a RLS '
  'impede o convidado de ler o próprio convite antes de aceitá-lo, e sem isso '
  'quem entrava sem empresa lia "procure o Gestor" tendo um convite esperando.';

revoke all on function public.meu_convite_pendente() from public, anon;
grant execute on function public.meu_convite_pendente() to authenticated;
