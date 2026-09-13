-- =============================================================================
-- 0056 — Confirmar pagamento passa a ser UMA função, e deixa de depender só do
-- webhook.
--
-- O QUE ACONTECEU, MEDIDO. Um cliente pagou R$ 5,00 por Pix em 13/09 às 13:09.
-- O Asaas confirmou e mandou o recibo por e-mail. A assinatura dele continuou
-- `pendente_pagamento`, e ao tentar entrar o produto pediu pagamento de novo.
--
-- Nos logs: ZERO requisições ao `asaas-webhook` em 24 horas. O Asaas não nos
-- avisou. Seja porque o webhook não está cadastrado no painel dele, seja porque
-- está apontando para o lugar errado, o efeito é o mesmo — e é o pior de todos:
-- o dinheiro entrou e o cliente ficou de fora.
--
-- O DEFEITO DE ARQUITETURA NÃO É O WEBHOOK ESTAR DESCONFIGURADO. É o acesso
-- depender EXCLUSIVAMENTE dele. Webhook é entrega de terceiro: pode não estar
-- cadastrado, pode ser removido por engano, pode falhar e esgotar as
-- retentativas, pode ser cadastrado noutro ambiente. Toda vez que isso
-- acontecer, alguém paga e não entra — em silêncio.
--
-- A partir daqui existe um SEGUNDO caminho: perguntar ao Asaas. Quem pagou e
-- voltou para o cadastro (foi o que o cliente fez, e é o que qualquer um faria)
-- tem a cobrança consultada ANTES de abrir outra — e, se já estiver paga, a
-- conta é liberada na hora.
--
-- POR QUE A DECISÃO VEM PARA O BANCO. Passam a existir dois caminhos que
-- liberam acesso: o webhook e a reconciliação. Se cada um tivesse a sua cópia
-- do que "confirmar" significa, eles divergiriam — e a divergência apareceria
-- como acesso liberado num caminho e não no outro, que é o tipo de defeito que
-- ninguém encontra. Um lugar só decide; os dois chamam.
-- =============================================================================

create or replace function public.assinatura_registrar_pagamento(
  p_assinatura_id    uuid,
  p_asaas_payment_id text,
  p_valor            numeric,
  p_forma            text default 'pix',
  p_vencimento       date default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_assinatura public.assinaturas%rowtype;
  v_primeira   boolean;
begin
  select * into v_assinatura from public.assinaturas where id = p_assinatura_id;
  if not found then
    raise exception 'Assinatura não encontrada.' using errcode = '23503';
  end if;

  -- É a PRIMEIRA vez que esta assinatura é paga? A pergunta precisa ser feita
  -- antes do update, porque logo abaixo o status vira 'ativa' e a informação se
  -- perde. Ela decide o envio do e-mail de "crie sua senha", que sai na
  -- primeira confirmação e em nenhuma das mensalidades seguintes — mandá-lo
  -- todo mês seria oferecer, uma vez por mês, um link que troca a senha de quem
  -- já entrou.
  v_primeira := v_assinatura.status = 'pendente_pagamento';

  insert into public.cobrancas (assinatura_id, asaas_payment_id, valor,
                                forma_pagamento, status, vencimento, pago_em)
  values (p_assinatura_id, p_asaas_payment_id, coalesce(p_valor, 0),
          coalesce(p_forma, 'pix')::public.cobranca_forma_pagamento,
          'confirmado',
          coalesce(p_vencimento, current_date),
          now())
  on conflict (asaas_payment_id) do update
    set status  = 'confirmado',
        pago_em = coalesce(public.cobrancas.pago_em, now()),
        valor   = excluded.valor,
        forma_pagamento = excluded.forma_pagamento;

  -- Seção 6.6 — "o pagamento é regularizado → acesso completo é restaurado
  -- automaticamente". Vale inclusive saindo do modo limitado.
  update public.assinaturas
     set status = 'ativa',
         proximo_vencimento = (current_date + interval '1 month')::date,
         carencia_expira_em = null
   where id = p_assinatura_id;

  -- Só avisa quando algo de fato mudou: reprocessar o mesmo evento não pode
  -- encher a caixa de notificações do gestor.
  if v_assinatura.status <> 'ativa' then
    insert into public.notificacoes (empresa_id, categoria, titulo, mensagem)
    values (v_assinatura.empresa_id, 'assinatura', 'Pagamento confirmado',
            'Sua assinatura está ativa e o acesso completo foi liberado.');
  end if;

  return jsonb_build_object(
    'empresa_id',          v_assinatura.empresa_id,
    'primeira_confirmacao', v_primeira,
    'status_anterior',      v_assinatura.status
  );
end;
$$;

revoke all on function
  public.assinatura_registrar_pagamento(uuid, text, numeric, text, date) from public;
grant execute on function
  public.assinatura_registrar_pagamento(uuid, text, numeric, text, date) to service_role;
