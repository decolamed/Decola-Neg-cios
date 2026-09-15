-- ============================================================================
-- 0059 — Horário de funcionamento da loja
--
-- O QUE FALTAVA. A loja virtual atende 24 horas por dia e o balcão não. Um
-- pedido que entra às 23h de domingo fica parado até segunda sem que ninguém
-- tenha dito isso ao cliente — ele volta em vinte minutos achando que foi
-- ignorado. A informação existe na cabeça do lojista e em lugar nenhum do
-- sistema.
--
-- O FORMATO, e por que este. Um jsonb com sete posições, uma por dia da semana,
-- na MESMA ORDEM do `Date.getDay()` do JavaScript: 0 é domingo, 6 é sábado.
-- Isso não é detalhe de implementação preguiçosa — é o que dispensa uma tabela
-- de conversão entre o banco e as duas telas que vão ler isto (o aplicativo do
-- lojista e a vitrine do cliente), e tabela de conversão é onde nasce o bug de
-- "a loja aparece aberta no domingo".
--
--   null ............ o lojista ainda não configurou nada
--   [null, {...}, …]  sete posições; `null` naquele dia = fechado
--   {"abre": "08:00", "fecha": "18:00"}
--
-- UM INTERVALO POR DIA, e não vários. Muita loja fecha para o almoço, e a
-- vontade de suportar isso é grande. Mas cada intervalo a mais é uma linha a
-- mais para o lojista preencher em SETE dias, e o que ele perde por não ter o
-- almoço no sistema é pequeno perto do que perde por desistir de preencher a
-- tela inteira. Se um dia isso mudar, a posição do dia vira uma lista de
-- intervalos e o validador abaixo é o único lugar que precisa saber.
--
-- O FUSO NÃO É GUARDADO, de propósito. "Está aberto agora?" é respondido no
-- relógio de quem olha. Para o lojista configurando, o relógio dele é o da
-- loja; para o cliente, que quase sempre está na mesma região, também. Guardar
-- fuso resolveria o cliente viajando — e custaria mais um campo obrigatório na
-- primeira configuração para atender um caso que quase não existe.
-- ============================================================================

-- ---------------------------------------------------------------- validador
--
-- POR QUE VALIDAR NO BANCO. O aplicativo já valida, e o aplicativo não é a
-- última palavra sobre nada (é a regra do projeto). Um jsonb sem forma definida
-- chega na vitrine e quebra a página do lojista para os clientes dele — do lado
-- público, onde ninguém está olhando o console.
create or replace function app.horario_de_funcionamento_valido(valor jsonb)
returns boolean
language sql
immutable
as $$
  select
    valor is null
    or (
      jsonb_typeof(valor) = 'array'
      and jsonb_array_length(valor) = 7
      and not exists (
        select 1
        from jsonb_array_elements(valor) as dia
        where not (
          -- Dia fechado.
          jsonb_typeof(dia.value) = 'null'
          or (
            jsonb_typeof(dia.value) = 'object'
            and dia.value ? 'abre'
            and dia.value ? 'fecha'
            and dia.value ->> 'abre' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            and dia.value ->> 'fecha' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          )
        )
      )
    );
$$;

comment on function app.horario_de_funcionamento_valido(jsonb) is
  'Sete posições (domingo a sábado). Cada uma é null (fechado) ou '
  '{"abre":"HH:MM","fecha":"HH:MM"}. Fechar ANTES de abrir é permitido de '
  'propósito: é como se escreve a madrugada — abre 18:00, fecha 02:00.';

-- ------------------------------------------------------------------- coluna
alter table public.empresas
  add column if not exists horario_funcionamento jsonb;

alter table public.empresas
  drop constraint if exists empresas_horario_funcionamento_valido;

alter table public.empresas
  add constraint empresas_horario_funcionamento_valido
  check (app.horario_de_funcionamento_valido(horario_funcionamento));

comment on column public.empresas.horario_funcionamento is
  'Horário de atendimento, sete posições na ordem do Date.getDay() (0=domingo). '
  'null = o lojista ainda não configurou — a vitrine então não afirma nada '
  'sobre estar aberta ou fechada, que é diferente de afirmar que está aberta.';

-- ------------------------------------------------------------- privilégios
--
-- ISTO AQUI É O PONTO FÁCIL DE ESQUECER. `authenticated` não tem UPDATE na
-- tabela inteira: a migração 0007 revogou e devolveu coluna a coluna, para que
-- um Gestor não consiga mexer em `status` (que é do administrador da
-- plataforma). Uma coluna nova, portanto, nasce sem permissão de escrita — a
-- RLS libera, o privilégio recusa, e a tela de configuração grava "com
-- sucesso" sem gravar nada.
grant update (horario_funcionamento) on public.empresas to authenticated;

-- ------------------------------------------------------------------ vitrine
--
-- `create or replace`, e NÃO `drop` + `create`. A migração 0047 derrubava as
-- três views para recriá-las; copiar aquele bloco aqui teria republicado uma
-- definição de `vitrine_produtos` que não é mais a que está no ar — ela mudou
-- de tabelas desde então (`categorias_produto`, `ciclo_vida`,
-- `empresa_campos_produto`) e `vitrine_lojas` ganhou a coluna `tema`. O
-- resultado seria a vitrine de todo mundo quebrada por uma coluna nova de
-- horário. Uma migração antiga descreve o passado, não o presente.
--
-- `vitrine_lojas` não tem dependentes (é `vitrine_categorias` que depende de
-- `vitrine_produtos`, e nenhuma das duas lê esta aqui), então substituir no
-- lugar é seguro. A regra do `create or replace` é que colunas novas só podem
-- ser ACRESCENTADAS NO FIM — por isso `horario_funcionamento` vem por último, e
-- não ao lado de `loja_cor`, onde ficaria melhor de ler.
create or replace view public.vitrine_lojas
with (security_invoker = off) as
select
  e.id,
  e.loja_slug                                      as slug,
  coalesce(nullif(btrim(e.loja_nome), ''), e.nome) as nome,
  e.loja_descricao                                 as descricao,
  e.logo_url,
  e.whatsapp,
  e.endereco,
  e.loja_instagram                                 as instagram,
  e.chave_pix is not null                          as aceita_pix,
  e.loja_cor,
  case when e.loja_banners_ativos then e.loja_banners else '[]'::jsonb end as banners,
  coalesce(e.loja_tema, '{}'::jsonb)               as tema,
  e.horario_funcionamento
from public.empresas e
where e.loja_ativa
  and e.loja_slug is not null
  and e.status = 'ativa'
  and exists (
    select 1 from public.assinaturas a
    where a.empresa_id = e.id
      and a.status in ('trial', 'ativa', 'carencia')
  );

comment on view public.vitrine_lojas is
  'Superfície pública da loja. Note o que NÃO sai daqui: cnpj, telefone '
  'interno, a própria chave Pix (só o fato de existir) e qualquer dado de '
  'assinatura. O horário de funcionamento sai porque é exatamente o que o '
  'cliente precisa saber antes de fazer o pedido.';

grant select on public.vitrine_lojas to anon, authenticated;
