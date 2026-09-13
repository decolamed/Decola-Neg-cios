-- =============================================================================
-- 0054 — Empresa sem documento consegue pagar.
--
-- A 0053 passou a pedir CPF/CNPJ no cadastro e a gravá-lo na empresa. Sobrou um
-- buraco: as empresas que JÁ existiam ficaram sem documento, e quem está nesse
-- estado não consegue pagar de jeito nenhum.
--
-- É um estado alcançável de três formas, não só pelo histórico:
--   - contratou antes da 0053 e não pagou;
--   - foi criada pelo administrador da plataforma (`admin-criar-empresa`), que
--     não pede documento;
--   - contratou, o Asaas recusou a cobrança, e a pessoa voltou depois.
--
-- Quando ela volta e preenche o formulário de novo, o documento está ali, na
-- mão — e era descartado, porque a retomada só olhava o que estava gravado. Esta
-- função deixa a retomada aproveitar o que acabou de ser digitado.
--
-- SÓ PREENCHE O QUE ESTÁ VAZIO. Um documento já gravado não é sobrescrito por
-- quem quer que chame esta função: trocar o CPF do titular de uma empresa é
-- assunto de "Dados da empresa", com o dono logado e a RLS valendo — não de um
-- endpoint público de contratação.
-- =============================================================================

create or replace function public.contratacao_definir_documento(
  p_assinatura_id uuid,
  p_documento     text
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_documento text;
  v_empresa   uuid;
  v_atual     text;
begin
  v_documento := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');

  if v_documento is null or length(v_documento) not in (11, 14) then
    raise exception 'Informe um CPF ou CNPJ válido.' using errcode = '22023';
  end if;

  select a.empresa_id, e.cnpj
    into v_empresa, v_atual
    from public.assinaturas a
    join public.empresas e on e.id = a.empresa_id
   where a.id = p_assinatura_id;

  if v_empresa is null then
    raise exception 'Assinatura não encontrada.' using errcode = '23503';
  end if;

  -- Já tem documento? Ele manda. Devolver o que vale evita que quem chamou
  -- ache que gravou uma coisa e o Asaas receba outra.
  if v_atual is not null and btrim(v_atual) <> '' then
    return v_atual;
  end if;

  update public.empresas set cnpj = v_documento where id = v_empresa;
  return v_documento;
end;
$$;

revoke all on function public.contratacao_definir_documento(uuid, text) from public;
grant execute on function public.contratacao_definir_documento(uuid, text) to service_role;
