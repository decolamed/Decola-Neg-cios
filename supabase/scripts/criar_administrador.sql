-- =============================================================================
-- Seed manual do Administrador da Plataforma
-- Especificação: Seções 4.15 e 7.15
--
-- Administradores NÃO são criados por autoatendimento — são cadastrados
-- diretamente no banco pelo próprio time. Por isso este arquivo fica FORA de
-- supabase/migrations/: ele não deve ser versionado com um e-mail real nem
-- replayado automaticamente em outro ambiente.
--
-- COMO USAR
--   1. Crie o usuário no Supabase Auth (Dashboard → Authentication → Add user,
--      com "Auto Confirm User" marcado). Isso dispara o trigger de 0008 e cria
--      a linha correspondente em `public.usuarios`.
--   2. Rode este script no SQL Editor trocando o e-mail e o nome abaixo.
--   3. Confirme com a consulta de verificação no fim.
--
-- Um administrador da plataforma NÃO deve ter vínculo com nenhuma empresa
-- (Seção 11.1) — o script recusa o cadastro se houver.
-- =============================================================================

do $$
declare
  v_email text := 'admin@decolanegocios.com.br';  -- <<< TROQUE
  v_nome  text := 'Administrador Decola';         -- <<< TROQUE
  v_id    uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email);

  if v_id is null then
    raise exception
      'Nenhum usuário no Supabase Auth com o e-mail %. Crie-o primeiro no Dashboard (Authentication → Add user).',
      v_email;
  end if;

  if exists (
    select 1 from public.empresa_usuarios
    where usuario_id = v_id and status <> 'removido'
  ) then
    raise exception
      'O usuário % está vinculado a uma empresa cliente e não pode ser administrador da plataforma (Seção 11.1).',
      v_email;
  end if;

  insert into public.administradores_plataforma (id, nome, email)
  values (v_id, v_nome, lower(v_email))
  on conflict (id) do update set nome = excluded.nome;

  raise notice 'Administrador da plataforma cadastrado: % (%)', v_nome, v_email;
end;
$$;

-- Verificação
select ap.id, ap.nome, ap.email, ap.criado_em
from public.administradores_plataforma ap
order by ap.criado_em;
