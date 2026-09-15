-- ============================================================================
-- 0060 — "Configurar depois" da primeira configuração
--
-- O QUE ESTA COLUNA GUARDA, e o que ela NÃO guarda. Ela guarda apenas que a
-- pessoa pediu para não ver mais o roteiro de boas-vindas. Ela NÃO guarda quais
-- etapas foram concluídas — isso é lido dos próprios dados (`chave_pix`,
-- `horario_funcionamento`, `whatsapp`, `loja_slug`).
--
-- É a diferença entre uma pergunta com resposta e uma pergunta com anotação
-- sobre a resposta. Uma coluna "pix_configurado" pode discordar da realidade: o
-- lojista apaga a chave e o sistema continua achando que está tudo pronto.
-- Perguntando ao dado, a resposta não tem como envelhecer — e a tela de
-- Configurações, que é por onde ele vai mexer nisso depois, não precisa
-- lembrar de atualizar bandeira nenhuma.
-- ============================================================================

alter table public.empresas
  add column if not exists configuracao_inicial_dispensada_em timestamptz;

comment on column public.empresas.configuracao_inicial_dispensada_em is
  'Quando o Gestor escolheu "Configurar depois" no roteiro de primeiro acesso. '
  'Só silencia o roteiro; o que falta continua sendo derivado dos dados.';

-- Mesmo cuidado da 0059: `authenticated` não tem UPDATE na tabela inteira (a
-- 0007 devolveu coluna a coluna), então coluna nova nasce sem escrita. Sem esta
-- linha o botão "Configurar depois" não faria efeito nenhum — e o roteiro
-- voltaria a aparecer no próximo acesso, para sempre.
grant update (configuracao_inicial_dispensada_em) on public.empresas to authenticated;
