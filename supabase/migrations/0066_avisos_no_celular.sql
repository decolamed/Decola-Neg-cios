-- 0066 — aviso na barra de notificações do aparelho, com o app fechado.
--
-- O PROBLEMA. Tudo o que o produto precisa contar ao lojista já vira linha em
-- `notificacoes`: pedido novo, estoque acabando, assinatura vencendo. Mas essa
-- linha só chega a alguém que ESTIVER COM O APLICATIVO ABERTO. Pedido que entra
-- às 21h, com o celular no bolso, esperava até a próxima vez que a pessoa
-- abrisse o app — e um pedido que ninguém vê é um pedido perdido.
--
-- A SAÍDA É WEB PUSH. O Decola é servido como site, e o navegador consegue
-- receber um aviso e mostrá-lo na barra do sistema mesmo com a aba fechada,
-- desde que exista um Service Worker registrado e uma inscrição guardada. É o
-- que estas duas coisas aqui fazem: guardar a inscrição, e disparar o envio.
--
-- POR QUE UMA TABELA NOVA e não `dispositivos_push`. Aquela guarda
-- `expo_push_token`, que é a credencial do serviço da Expo para aplicativo
-- NATIVO — coluna obrigatória, formato diferente, serviço diferente. Uma
-- inscrição Web Push são três valores (endpoint, p256dh, auth) e não cabe ali
-- sem mentir sobre o que a coluna significa. As duas podem coexistir no dia em
-- que existir app nativo.

create table if not exists public.inscricoes_web_push (
  id         uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  /**
   * O endereço que o navegador deu para entregar avisos A ESTE APARELHO.
   * É ele que identifica a inscrição — único, porque o mesmo navegador
   * reinscrito devolve o mesmo endpoint e não pode virar duas linhas.
   */
  endpoint   text not null unique,
  /** As duas chaves da criptografia de ponta a ponta (RFC 8291). */
  p256dh     text not null,
  auth       text not null,
  /** Só para diagnóstico: "quem não está recebendo usa qual navegador?" */
  agente     text,
  criado_em  timestamptz not null default now(),
  usado_em   timestamptz
);

comment on table public.inscricoes_web_push is
  'Inscrições de Web Push, uma por navegador/aparelho. Preenchida pelo próprio '
  'usuário ao permitir as notificações; lida apenas pela função enviar-push.';

create index if not exists inscricoes_web_push_usuario_idx
  on public.inscricoes_web_push (usuario_id);

alter table public.inscricoes_web_push enable row level security;

-- Cada um cuida das PRÓPRIAS inscrições, e só delas. Ler a inscrição de outro
-- usuário seria poder mandar aviso no celular dele.
drop policy if exists inscricoes_push_minhas on public.inscricoes_web_push;
create policy inscricoes_push_minhas on public.inscricoes_web_push
  for all to authenticated
  using ((select auth.uid()) = usuario_id)
  with check ((select auth.uid()) = usuario_id);

revoke all on public.inscricoes_web_push from anon, authenticated;
grant select, insert, delete on public.inscricoes_web_push to authenticated;

-- A função de envio roda com a chave de serviço; a 0030 tirou dela as tabelas
-- de plataforma, então o acesso é dado explicitamente a esta.
grant select, update, delete on public.inscricoes_web_push to service_role;

-- ---------------------------------------------------------------------------
-- O SEGREDO QUE O GATILHO APRESENTA.
--
-- A função de envio precisa recusar quem não é o banco — senão qualquer um que
-- adivinhasse um id de notificação faria o celular de outra pessoa apitar. E o
-- gatilho não tem como conhecer a chave de serviço (ela vive só nas funções).
--
-- A saída é um segredo que MORA NO BANCO: o gatilho o lê (é `security
-- definer`), a função o relê com a chave de serviço e compara. Ninguém mais
-- alcança esta tabela — nem `anon`, nem `authenticated`, nem por RLS, porque
-- não há política nenhuma e o privilégio foi revogado.
create table if not exists public.segredo_do_push (
  linha_unica boolean primary key default true check (linha_unica),
  token       text not null default encode(gen_random_bytes(32), 'hex')
);

alter table public.segredo_do_push enable row level security;
revoke all on public.segredo_do_push from anon, authenticated;
grant select on public.segredo_do_push to service_role;

insert into public.segredo_do_push (linha_unica) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- O DISPARO.
--
-- A notificação já é criada pelas RPCs que existem (pedido, estoque,
-- assinatura). Pendurar o envio num GATILHO dessa tabela é o que faz o aviso
-- valer para todas elas de uma vez — inclusive para as que forem escritas
-- amanhã — em vez de espalhar uma chamada de push dentro de cada uma, que é
-- onde uma delas acaba esquecida.
--
-- `pg_net` é assíncrono de propósito: o INSERT da notificação não pode esperar
-- (nem falhar por causa de) uma chamada HTTP. Quem está registrando uma venda
-- não deve ver erro porque o serviço de push demorou.
create or replace function app.avisar_no_celular()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
begin
  select token into v_token from public.segredo_do_push limit 1;
  if v_token is null then return new; end if;

  perform net.http_post(
    url := 'https://nakqafnchwydfogcozvc.supabase.co/functions/v1/enviar-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-decola-push', v_token
    ),
    -- Só o id. O conteúdo do aviso é relido no servidor, para o corpo desta
    -- chamada não virar um jeito de mandar texto arbitrário para um celular.
    body := jsonb_build_object('notificacao_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception
  -- ENVIO FALHO NÃO DESFAZ A NOTIFICAÇÃO. Ela continua valendo dentro do
  -- aplicativo, que é o canal que sempre funcionou; o push é o extra.
  when others then
    raise warning 'push não disparado para a notificação %: %', new.id, sqlerrm;
    return new;
end;
$function$;

drop trigger if exists notificacao_avisa_no_celular on public.notificacoes;
create trigger notificacao_avisa_no_celular
  after insert on public.notificacoes
  for each row execute function app.avisar_no_celular();
