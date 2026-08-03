-- =============================================================================
-- 0015 — Correção: a tela de Escolha do Plano (Seção 7.13) é PRÉ-autenticação
--
-- A política `planos_leitura` de 0007 verificava "este é o plano da minha
-- assinatura?" com um EXISTS direto em `public.assinaturas`. Avaliar esse
-- subselect exige privilégio de SELECT em assinaturas — que o `anon` não tem
-- (e não deve ter, 0014). Resultado: qualquer leitura de `planos` sem login
-- falhava com "permission denied for table assinaturas", deixando a tela de
-- Escolha do Plano vazia e quebrando também o link direto de plano (Seção 6.3).
--
-- A verificação passa a viver numa função SECURITY DEFINER, que roda com o
-- privilégio do dono e não depende da role que chamou.
-- =============================================================================

-- Seção 6.1 — um assinante continua enxergando o próprio plano mesmo depois de
-- ele ser desativado para novas contratações.
create or replace function app.plano_contratado(p_plano uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assinaturas a
    where a.plano_id = p_plano
      and a.empresa_id = app.empresa_atual()
  )
$$;

grant execute on function app.plano_contratado(uuid) to authenticated, anon, service_role;

drop policy if exists planos_leitura on public.planos;

create policy planos_leitura on public.planos
  for select to anon, authenticated
  using (
    ativo
    or (select app.eh_admin_plataforma())
    or (select app.plano_contratado(planos.id))
  );
