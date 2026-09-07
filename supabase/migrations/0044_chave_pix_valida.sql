-- 0044 — A chave Pix precisa ser uma chave Pix.
--
-- O campo aceitava texto livre. Uma empresa gravou o próprio telefone como
-- "74999300306" — que é como se escreve telefone no Brasil, mas não é uma
-- chave Pix: chave de telefone só vale com o país na frente, "+5574999300306".
-- O aplicativo montava o BR Code em cima daquilo, o QR abria normalmente no
-- banco do cliente e o pagamento ia para lugar nenhum.
--
-- Um QR errado é pior do que QR nenhum, porque ninguém desconfia dele. Por isso
-- a regra desce para o banco: a mesma validação existe na tela, mas a tela é
-- só a primeira porta.
--
-- Os cinco formatos são os que o Banco Central define. CPF e CNPJ são
-- conferidos pelos dígitos verificadores — não basta ter o tamanho certo.

-- ---------------------------------------------------------------- validação

create or replace function app.cpf_valido(digitos text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int;
  resto int;
  esperado int;
  tamanho int;
  peso int;
begin
  if digitos is null or length(digitos) <> 11 or digitos !~ '^[0-9]{11}$' then
    return false;
  end if;

  -- 00000000000, 11111111111… fecham a conta e não são CPF de ninguém.
  if digitos ~ '^(.)\1{10}$' then
    return false;
  end if;

  foreach tamanho in array array[9, 10] loop
    soma := 0;
    peso := tamanho + 1;
    for i in 1..tamanho loop
      soma := soma + substr(digitos, i, 1)::int * (peso - i + 1);
    end loop;
    resto := (soma * 10) % 11;
    esperado := case when resto = 10 then 0 else resto end;
    if esperado <> substr(digitos, tamanho + 1, 1)::int then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function app.cnpj_valido(digitos text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int;
  resto int;
  esperado int;
  tamanho int;
  peso int;
begin
  if digitos is null or length(digitos) <> 14 or digitos !~ '^[0-9]{14}$' then
    return false;
  end if;

  if digitos ~ '^(.)\1{13}$' then
    return false;
  end if;

  foreach tamanho in array array[12, 13] loop
    soma := 0;
    peso := tamanho - 7;
    for i in 1..tamanho loop
      soma := soma + substr(digitos, i, 1)::int * peso;
      peso := peso - 1;
      if peso < 2 then
        peso := 9;
      end if;
    end loop;
    resto := soma % 11;
    esperado := case when resto < 2 then 0 else 11 - resto end;
    if esperado <> substr(digitos, tamanho + 1, 1)::int then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Forma CANÔNICA da chave: é assim que ela tem de estar gravada.
-- Telefone em E.164 (+55 + DDD + número, celular começando em 9 ou fixo em
-- 2–5), e-mail minúsculo, CPF/CNPJ só dígitos, aleatória em UUID minúsculo.
create or replace function app.chave_pix_valida(chave text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select chave is null
      or app.cpf_valido(chave)
      or app.cnpj_valido(chave)
      or chave ~ '^\+55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$'
      or (chave ~ '^[^@[:space:][:upper:]]+@[^@[:space:][:upper:]]+\.[^@[:space:][:upper:]]{2,}$'
          and length(chave) <= 77)
      or chave ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

comment on function app.chave_pix_valida(text) is
  'Verdadeiro para NULL (empresa que não recebe por Pix) ou para uma chave Pix '
  'já na forma canônica: CPF/CNPJ com dígitos verificadores corretos, telefone '
  'em E.164, e-mail minúsculo ou UUID minúsculo.';

-- A expressão de um CHECK roda com os privilégios de quem está gravando, e o
-- gestor grava a própria empresa como `authenticated`. Sem estes GRANTs o
-- salvamento falharia por permissão, não por chave errada. As três funções são
-- puramente aritméticas: não leem nem escrevem nada.
grant execute on function app.cpf_valido(text) to authenticated;
grant execute on function app.cnpj_valido(text) to authenticated;
grant execute on function app.chave_pix_valida(text) to authenticated;

-- ------------------------------------------------- consertar o que já existe
--
-- Antes de exigir o formato, arruma o que dá para arrumar sem adivinhar.
-- Onze dígitos que NÃO passam no dígito verificador do CPF e começam com DDD
-- válido só podem ser telefone — não é chute, é o único formato que sobra.

update public.empresas
   set chave_pix = lower(btrim(chave_pix))
 where chave_pix is not null
   and chave_pix <> lower(btrim(chave_pix));

-- CPF/CNPJ digitado com pontuação.
update public.empresas
   set chave_pix = regexp_replace(chave_pix, '[^0-9]', '', 'g')
 where chave_pix is not null
   and chave_pix ~ '[.\-/]'
   and chave_pix !~ '@'
   and (app.cpf_valido(regexp_replace(chave_pix, '[^0-9]', '', 'g'))
     or app.cnpj_valido(regexp_replace(chave_pix, '[^0-9]', '', 'g')));

-- Telefone escrito como as pessoas escrevem telefone. O "55" só é tratado como
-- código do país quando o número fica com tamanho de ligação internacional —
-- senão o DDD 55 (Santa Maria/RS) seria comido.
with candidato as (
  select id,
         case
           when length(digitos) in (12, 13) and left(digitos, 2) = '55'
             then '+55' || substr(digitos, 3)
           else '+55' || digitos
         end as chave
    from (
      select id, regexp_replace(chave_pix, '[^0-9]', '', 'g') as digitos
        from public.empresas
       where chave_pix is not null
         and chave_pix !~ '@'
         and not app.chave_pix_valida(chave_pix)
    ) bruto
)
update public.empresas e
   set chave_pix = c.chave
  from candidato c
 where e.id = c.id
   and app.chave_pix_valida(c.chave);

-- O que sobrou não é interpretável. Fica NULL: melhor a loja aparecer sem Pix
-- (e o gestor recadastrar) do que continuar emitindo cobrança que não chega.
update public.empresas
   set chave_pix = null
 where chave_pix is not null
   and not app.chave_pix_valida(chave_pix);

-- ---------------------------------------------------------------- restrição

alter table public.empresas
  drop constraint if exists empresas_chave_pix_formato;

alter table public.empresas
  add constraint empresas_chave_pix_formato
  check (app.chave_pix_valida(chave_pix));
