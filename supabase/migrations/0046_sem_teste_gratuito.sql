-- 0046 — O acesso passa a começar no pagamento, não na promessa dele.
--
-- O modelo era: cria a conta, ganha 7 dias, paga depois. O modelo passa a ser
-- o da Decola MED: escolhe o plano, cria a conta, PAGA, e só então recebe por
-- e-mail o link para criar a senha e entrar.
--
-- Nada disso é código novo — `criar_empresa_e_assinatura` (0009) já decide
-- entre `trial` e `pendente_pagamento` lendo esta chave, e
-- `pendente_pagamento` já significa "sem acesso ao conteúdo" em todo o
-- aplicativo. O que muda aqui é a chave.
--
-- CONTINUA REVERSÍVEL PELO PAINEL. `Configurações` no painel administrativo lê
-- e grava estas mesmas colunas: se um dia o teste gratuito voltar a fazer
-- sentido — numa campanha, por exemplo — é um botão, não uma migração.
--
-- `trial_dias` fica em 7 de propósito, e não em 0: é o valor que volta a valer
-- se alguém religar o teste, e zerá-lo transformaria "ligado" em "ligado por
-- nenhum dia", que é pior do que desligado por ser confuso.

update public.configuracoes_plataforma
   set trial_ativo = false,
       atualizado_em = now();

-- Assinaturas que ainda estão em trial NÃO são interrompidas.
--
-- Quem entrou sob a regra antiga entrou sob a regra antiga; cortar o acesso de
-- alguém que está usando, por causa de uma decisão comercial tomada depois,
-- seria quebrar um combinado. Elas seguem o curso normal: quando o trial
-- vencer, `expirar_trials` (0026) as move como sempre moveu.
