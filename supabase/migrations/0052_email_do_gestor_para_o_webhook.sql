-- =============================================================================
-- 0052 — O webhook do Asaas volta a conseguir enviar o primeiro acesso.
--
-- O MESMO DEFEITO DA 0051, EM OUTRO LUGAR — E PIOR.
--
-- `asaas-webhook` é quem fecha o ciclo: o dinheiro entra, a assinatura vira
-- `ativa`, e o cliente recebe o e-mail com o link para criar a senha. Ele nunca
-- escolheu senha nenhuma antes disso; esse e-mail é o ÚNICO caminho para a
-- conta que ele acabou de pagar.
--
-- Para saber para quem enviar, a função lia `empresa_usuarios` procurando o
-- gestor principal — com a chave de serviço, que não tem SELECT nessa tabela
-- (migração 0030: "empresa_usuarios — só pelas RPCs de convite e papéis").
--
-- O resultado seria o pior desfecho possível do produto: o cliente PAGA, a
-- assinatura fica ativa, e o e-mail de acesso não sai. Ele fica sem entrar,
-- tendo pago — e sem nada na tela que explique o que houve.
--
-- E EM SILÊNCIO. `enviarPrimeiroAcesso` engole as falhas de propósito, para que
-- um problema de e-mail não faça o Asaas reenviar o evento e reprocessar o
-- pagamento. A resiliência está certa; o efeito colateral é que esta falha não
-- apareceria em lugar nenhum — só na reclamação de quem pagou e não entrou.
--
-- Nenhum privilégio novo de tabela é concedido: a leitura vira uma função
-- `security definer` com uma pergunta só, aberta apenas ao `service_role`.
-- =============================================================================

create or replace function public.contratacao_email_do_gestor(p_empresa_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select eu.email_convite
    from public.empresa_usuarios eu
   where eu.empresa_id = p_empresa_id
     and eu.papel = 'gestor_principal'
     and eu.status <> 'removido'
   order by eu.aceito_em nulls last
   limit 1;
$$;

-- Só o backend pergunta: esta função devolve o e-mail do dono de uma empresa a
-- partir do id dela, e isso não é informação de cliente.
revoke all on function public.contratacao_email_do_gestor(uuid) from public;
grant execute on function public.contratacao_email_do_gestor(uuid) to service_role;
