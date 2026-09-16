-- 0069 — o aviso de pedido leva AO PEDIDO.
--
-- `app.notificar_pedido` gravava título e mensagem e mais nada. Dentro do
-- aplicativo isso bastava: a pessoa já estava lá e a lista de avisos era um
-- toque. Com o push (0066) o contexto mudou — o aviso chega na barra do
-- sistema, às vezes de madrugada, e o toque nele é a PRIMEIRA coisa que a
-- pessoa faz. Cair numa lista genérica e ter de achar o pedido ali é o tipo de
-- atrito que faz alguém fechar o aviso e "ver depois".
--
-- `entidade` e `entidade_id` já existiam na tabela, sem ninguém preencher; é
-- deles que `enviar-push` tira o destino do toque.
--
-- O PARÂMETRO É OPCIONAL de propósito. `expirar_reservas_vencidas` também chama
-- esta função, e ali o aviso é sobre VÁRIOS pedidos que venceram — não há um
-- pedido para abrir. Forçar um id obrigatório faria aquele caso inventar um.
create or replace function app.notificar_pedido(
  p_empresa uuid,
  p_titulo text,
  p_mensagem text,
  p_pedido_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.notificacoes (
    empresa_id, categoria, titulo, mensagem, destinatario_id, entidade, entidade_id
  )
  select p_empresa, 'pedido', p_titulo, p_mensagem, eu.usuario_id,
         case when p_pedido_id is null then null else 'pedido' end,
         p_pedido_id
  from public.empresa_usuarios eu
  where eu.empresa_id = p_empresa and eu.status = 'ativo'
    and eu.papel in ('gestor_principal','gestor') and eu.usuario_id is not null;
end;
$function$;

comment on function app.notificar_pedido(uuid, text, text, uuid) is
  'Um aviso de pedido para cada gestor ativo da empresa. Com p_pedido_id, o '
  'toque na notificação do celular abre aquele pedido (ver enviar-push).';

-- ---------------------------------------------------------------------------
-- Quem cria o pedido passa a dizer QUAL pedido.
--
-- Substituição cirúrgica dentro do corpo da função: reescrever
-- `vitrine_criar_pedido` inteira por causa de um argumento seria copiar cem
-- linhas de regra de estoque e reserva para mudar uma — e é copiando que se
-- perde uma linha no caminho.
do $$
declare
  v_def text := pg_get_functiondef('public.vitrine_criar_pedido'::regproc);
  v_velho text := 'else ''retirada, paga no balcão'' end));';
  v_novo  text := 'else ''retirada, paga no balcão'' end), v_pedido.id);';
begin
  if position(v_velho in v_def) = 0 then
    raise exception 'vitrine_criar_pedido mudou: a chamada esperada de notificar_pedido não foi encontrada.';
  end if;
  execute replace(v_def, v_velho, v_novo);
end $$;

-- ---------------------------------------------------------------------------
-- A VERSÃO DE TRÊS ARGUMENTOS PRECISA SAIR, e isto não é limpeza: é conserto.
--
-- Acrescentar um parâmetro COM VALOR PADRÃO não substitui a função — cria uma
-- SOBRECARGA. As duas passaram a existir, e aí toda chamada de três argumentos
-- virou ambígua para o Postgres: serve a antiga e serve a nova com o padrão.
-- `expirar_reservas_vencidas` chama assim, e teria quebrado na próxima
-- expiração de reserva — longe daqui, sem ninguém ligar uma coisa à outra.
--
-- Com a antiga fora, a nova atende os dois formatos de chamada.
drop function if exists app.notificar_pedido(uuid, text, text);

do $$
declare v_quantas int;
begin
  select count(*) into v_quantas from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app' and p.proname = 'notificar_pedido';
  if v_quantas <> 1 then
    raise exception 'esperava uma única app.notificar_pedido, encontrei %', v_quantas;
  end if;
end $$;
