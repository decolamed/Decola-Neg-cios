-- 0049 — A contratação passa a nascer no servidor.
--
-- O QUE QUEBROU, E POR QUÊ. O cadastro pelo link de planos fazia, do
-- navegador: `signUp` → RPC da empresa → checkout. Os dois últimos passos
-- dependiam da SESSÃO que o `signUp` devolve.
--
-- Só que o projeto está com "Confirm email" ligado no Supabase Auth. Com essa
-- opção, `signUp` NÃO devolve sessão: devolve um usuário e manda um e-mail de
-- confirmação. Os passos seguintes nunca aconteciam. Medido nos logs: três
-- `/auth/v1/signup` seguidos, todos 200, e nenhuma chamada a
-- `criar_empresa_e_assinatura`.
--
-- O resultado para o cliente era um beco fechado dos dois lados: tentar de
-- novo dizia "este e-mail já tem uma conta" (o usuário do Auth ficou lá), e
-- tentar entrar não funcionava (a senha da contratação é descartável, de
-- propósito — a senha de verdade vem por e-mail depois do pagamento). Três
-- contas ficaram exatamente assim.
--
-- A CORREÇÃO NÃO É MEXER NUMA CONFIGURAÇÃO. Seria trocar um beco por uma
-- dependência invisível: qualquer mudança futura naquele painel derrubaria a
-- contratação de novo, sem nada no código denunciar. A contratação passa a
-- acontecer INTEIRA no servidor, com a chave de serviço — que não precisa de
-- sessão, não precisa de confirmação de e-mail e não pode ser recusada por uma
-- caixa marcada no painel.
--
-- Esta função é o passo de banco desse caminho. Quem a chama é a Edge Function
-- `contratar`, e só ela: o GRANT é exclusivo do `service_role`.

create or replace function public.contratacao_criar_empresa(
  p_usuario_id   uuid,
  p_nome_empresa text,
  p_plano_id     uuid,
  p_nome_usuario text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano     public.planos%rowtype;
  v_empresa   uuid;
  v_assinatura uuid;
begin
  if p_usuario_id is null then
    raise exception 'Responsável não informado.' using errcode = '22023';
  end if;

  if coalesce(btrim(p_nome_empresa), '') = '' then
    raise exception 'Informe o nome do seu negócio.' using errcode = '22023';
  end if;

  -- Seção 5.1 — "1 usuário = 1 empresa" é absoluta.
  if exists (
    select 1 from public.empresa_usuarios
     where usuario_id = p_usuario_id and status <> 'removido'
  ) then
    raise exception 'Este e-mail já está vinculado a uma empresa.'
      using errcode = '23505';
  end if;

  -- Um administrador da plataforma não vira Gestor de empresa (Seção 11.1).
  if exists (select 1 from public.administradores_plataforma where id = p_usuario_id) then
    raise exception 'Esta conta é de administrador da plataforma.'
      using errcode = '22023';
  end if;

  select * into v_plano from public.planos where id = p_plano_id;
  if not found then
    raise exception 'Plano não encontrado.' using errcode = '23503';
  end if;
  if not v_plano.ativo then
    raise exception 'Este plano não está disponível para novas contratações.'
      using errcode = '22023';
  end if;

  insert into public.empresas (nome)
  values (btrim(p_nome_empresa))
  returning id into v_empresa;

  insert into public.empresa_usuarios (
    empresa_id, usuario_id, nome_convite, email_convite,
    papel, permissoes, status, aceito_em
  )
  select
    v_empresa, p_usuario_id,
    coalesce(nullif(btrim(p_nome_usuario), ''), u.nome),
    u.email, 'gestor_principal', app.permissoes_gestor(), 'ativo', now()
  from public.usuarios u
  where u.id = p_usuario_id;

  -- Se a linha de `usuarios` não existisse, o INSERT acima não gravaria nada e
  -- a empresa nasceria sem dono — em silêncio. Melhor explodir aqui.
  if not found then
    raise exception 'Não foi possível identificar o responsável pela conta.'
      using errcode = '23503';
  end if;

  -- Sem teste gratuito: o acesso começa quando o pagamento confirma, e quem
  -- muda este status para 'ativa' é só o webhook do Asaas.
  insert into public.assinaturas (
    empresa_id, plano_id, valor_contratado, status
  )
  values (v_empresa, v_plano.id, v_plano.valor_mensal, 'pendente_pagamento')
  returning id into v_assinatura;

  update public.usuarios
     set nome = coalesce(nullif(btrim(p_nome_usuario), ''), nome),
         aceitou_termos_em = coalesce(aceitou_termos_em, now())
   where id = p_usuario_id;

  perform app.registrar_log(
    v_empresa, 'empresa.criada', 'empresa', v_empresa, null,
    jsonb_build_object('nome', btrim(p_nome_empresa), 'plano_id', v_plano.id,
                       'origem', 'contratacao_web')
  );

  return jsonb_build_object(
    'empresa_id',    v_empresa,
    'assinatura_id', v_assinatura,
    'valor',         v_plano.valor_mensal,
    'plano_nome',    v_plano.nome
  );
end;
$$;

comment on function public.contratacao_criar_empresa(uuid, text, uuid, text) is
  'Cria empresa, vínculo de Gestor Principal e assinatura pendente de '
  'pagamento, para a contratação pelo site. Chamada SÓ pela Edge Function '
  '`contratar`, com a chave de serviço — por isso não depende de sessão nem '
  'da confirmação de e-mail do Auth.';

-- Ninguém além do backend. Um cliente autenticado que alcançasse esta função
-- poderia criar empresa para qualquer usuário.
revoke execute on function public.contratacao_criar_empresa(uuid, text, uuid, text)
  from public, anon, authenticated;
grant  execute on function public.contratacao_criar_empresa(uuid, text, uuid, text)
  to service_role;
