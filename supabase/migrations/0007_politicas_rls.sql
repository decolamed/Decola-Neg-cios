-- =============================================================================
-- 0007 — Row Level Security
-- Especificação: Seção 9.1 — "toda regra de permissão é implementada via RLS,
-- nunca apenas escondendo botões na interface. Um cliente modificado nunca
-- pode executar uma ação para a qual o usuário não tem permissão."
--
-- Princípios aplicados aqui:
--   1. RLS habilitada em TODAS as tabelas, sem exceção.
--   2. Ausência de política = operação proibida. Várias tabelas não têm
--      política de DELETE de propósito (vendas, produtos, categorias,
--      logs_auditoria) — a exclusão é sempre lógica.
--   3. Operações que exigem atomicidade ou validação composta (venda,
--      cancelamento, convite, troca de plano) não têm política de escrita
--      direta: passam obrigatoriamente pelas RPCs de 0009, que revalidam tudo.
--   4. Status da conta (Seções 6.6/6.9) é lido sem trava, para o app poder
--      explicar ao usuário por que está bloqueado; os DADOS é que são travados.
-- =============================================================================

alter table public.administradores_plataforma enable row level security;
alter table public.configuracoes_plataforma enable row level security;
alter table public.planos enable row level security;
alter table public.usuarios enable row level security;
alter table public.empresas enable row level security;
alter table public.empresa_usuarios enable row level security;
alter table public.assinaturas enable row level security;
alter table public.cobrancas enable row level security;
alter table public.categorias_produto enable row level security;
alter table public.campos_produto_disponiveis enable row level security;
alter table public.empresa_campos_produto enable row level security;
alter table public.produtos enable row level security;
alter table public.vendas enable row level security;
alter table public.venda_itens enable row level security;
alter table public.movimentacoes_financeiras enable row level security;
alter table public.solicitacoes_cancelamento enable row level security;
alter table public.alertas_estoque enable row level security;
alter table public.notificacoes enable row level security;
alter table public.dispositivos_push enable row level security;
alter table public.preferencias_notificacao enable row level security;
alter table public.logs_auditoria enable row level security;

-- =============================================================================
-- PLATAFORMA (Painel Administrativo — Seções 4.15, 4.16, 7.15, 11.1)
-- Completamente separado do app cliente: nenhuma política abaixo é satisfeita
-- por um usuário de empresa.
-- =============================================================================

-- Um administrador enxerga a si mesmo e aos demais administradores.
create policy administradores_leitura on public.administradores_plataforma
  for select to authenticated
  using ((select app.eh_admin_plataforma()));

-- Criação de administrador é feita por seed/backend (service_role), nunca por
-- autoatendimento (Seção 7.15) — sem política de INSERT/UPDATE/DELETE.

-- Seção 7.13 — a tela de Escolha do Plano é PRÉ-autenticação e precisa saber
-- se o trial está ativo e quantos dias dura.
create policy configuracoes_leitura_publica on public.configuracoes_plataforma
  for select to anon, authenticated
  using (true);

create policy configuracoes_escrita_admin on public.configuracoes_plataforma
  for update to authenticated
  using ((select app.eh_admin_plataforma()))
  with check ((select app.eh_admin_plataforma()));

-- Seção 6.1 / 7.13 — planos ativos são visíveis a todos, inclusive antes do
-- login. Um assinante continua enxergando seu próprio plano mesmo se ele for
-- desativado para novas contratações (Seção 6.1).
create policy planos_leitura on public.planos
  for select to anon, authenticated
  using (
    ativo
    or (select app.eh_admin_plataforma())
    or exists (
      select 1 from public.assinaturas a
      where a.plano_id = planos.id
        and a.empresa_id = (select app.empresa_atual())
    )
  );

create policy planos_insercao_admin on public.planos
  for insert to authenticated
  with check ((select app.eh_admin_plataforma()));

create policy planos_edicao_admin on public.planos
  for update to authenticated
  using ((select app.eh_admin_plataforma()))
  with check ((select app.eh_admin_plataforma()));

-- Planos não são apagados: desativar (`ativo = false`) é a operação prevista
-- (Seção 7.15 C) — sem política de DELETE.

-- =============================================================================
-- CONTAS E EMPRESA
-- =============================================================================

-- Seção 5.6 — o histórico continua atribuído ao usuário removido, então
-- colegas (inclusive ex-colegas) permanecem visíveis.
create policy usuarios_leitura on public.usuarios
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app.eh_colega(usuarios.id))
    or (select app.eh_admin_plataforma())
  );

-- O usuário edita apenas o próprio cadastro (Seção 7.14, tela de Perfil).
create policy usuarios_edicao_propria on public.usuarios
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- A linha em `usuarios` nasce do trigger em auth.users (0008) — sem política
-- de INSERT. Usuários nunca são apagados (Seção 5.6) — sem política de DELETE.

-- Leitura do cadastro da empresa SEM trava de status: o app precisa saber que
-- a conta está suspensa/limitada para exibir a mensagem correta (Seções 6.6,
-- 7.10, 7.11). Os dados de negócio é que ficam bloqueados.
create policy empresas_leitura on public.empresas
  for select to authenticated
  using (
    id = (select app.empresa_atual())
    or (select app.eh_admin_plataforma())
  );

-- Seção 5.3 — configurar a empresa (dados cadastrais, chave Pix, percentual de
-- alerta) é ação exclusiva do papel Gestor.
create policy empresas_edicao_gestor on public.empresas
  for update to authenticated
  using ((select app.pode_escrever_como_gestor(empresas.id)))
  with check ((select app.pode_escrever_como_gestor(empresas.id)));

create policy empresas_admin_total on public.empresas
  for all to authenticated
  using ((select app.eh_admin_plataforma()))
  with check ((select app.eh_admin_plataforma()));

-- `empresas.status` só muda por ação do administrador da plataforma
-- (Seção 6.9). Um Gestor com UPDATE na tabela não consegue tocar na coluna:
-- a trava é de privilégio, não de política.
revoke update on public.empresas from authenticated;
grant update (nome, cnpj, endereco, telefone, logo_url, chave_pix,
              alerta_estoque_percentual, atualizado_em)
  on public.empresas to authenticated;

-- Vínculos: leitura liberada para a empresa inteira (tela de Funcionários,
-- Seção 7.8) e para o próprio usuário (para saber seu papel na Splash).
create policy empresa_usuarios_leitura on public.empresa_usuarios
  for select to authenticated
  using (
    usuario_id = (select auth.uid())
    or empresa_id = (select app.empresa_atual())
    or (select app.eh_admin_plataforma())
  );

-- Convidar, aceitar convite, promover, rebaixar e remover passam pelas RPCs de
-- 0009 — envolvem limite de plano (Seção 6.8), imutabilidade do Gestor
-- Principal (Seção 4.3) e a regra de vínculo único (Seção 5.1). Sem política
-- de escrita direta.

create policy empresa_usuarios_admin_total on public.empresa_usuarios
  for all to authenticated
  using ((select app.eh_admin_plataforma()))
  with check ((select app.eh_admin_plataforma()));

-- =============================================================================
-- ASSINATURA E COBRANÇA
-- =============================================================================

-- Leitura sem trava de status, pelo mesmo motivo de `empresas`: a tela de
-- Perfil (Seção 7.14) mostra o status da assinatura, e o app precisa detectar
-- a mudança para 'ativa' após o pagamento (Seção 7.12, item 6).
create policy assinaturas_leitura on public.assinaturas
  for select to authenticated
  using (
    empresa_id = (select app.empresa_atual())
    or (select app.eh_admin_plataforma())
  );

-- NENHUMA escrita pelo app cliente. O status da assinatura é definido apenas
-- pelo webhook do Asaas (Edge Function, service_role) ou pelo administrador —
-- caso contrário um cliente modificado se marcaria como 'ativa' sem pagar.
create policy assinaturas_admin_total on public.assinaturas
  for all to authenticated
  using ((select app.eh_admin_plataforma()))
  with check ((select app.eh_admin_plataforma()));

-- Seção 7.14 — extrato de pagamentos exige `gerenciar_assinatura` (Gestor).
create policy cobrancas_leitura on public.cobrancas
  for select to authenticated
  using (
    (select app.eh_admin_plataforma())
    or (
      (select app.tem_permissao('gerenciar_assinatura'))
      and exists (
        select 1 from public.assinaturas a
        where a.id = cobrancas.assinatura_id
          and a.empresa_id = (select app.empresa_atual())
      )
    )
  );

-- Cobranças são criadas/atualizadas exclusivamente pelo backend Asaas
-- (service_role) — sem política de escrita para authenticated.

-- =============================================================================
-- CATÁLOGO DE PRODUTOS
-- =============================================================================

create policy categorias_leitura on public.categorias_produto
  for select to authenticated
  using ((select app.pode_ler(categorias_produto.empresa_id)));

create policy categorias_insercao_gestor on public.categorias_produto
  for insert to authenticated
  with check ((select app.pode_escrever_como_gestor(categorias_produto.empresa_id)));

create policy categorias_edicao_gestor on public.categorias_produto
  for update to authenticated
  using ((select app.pode_escrever_como_gestor(categorias_produto.empresa_id)))
  with check ((select app.pode_escrever_como_gestor(categorias_produto.empresa_id)));

-- Seção 4.7 / 8.4 — categorias nunca são apagadas: sem política de DELETE.

-- Campos padrão do sistema (empresa_id nulo) são visíveis a todos; campos
-- personalizados, só à empresa dona (Seção 4.5).
create policy campos_produto_leitura on public.campos_produto_disponiveis
  for select to authenticated
  using (
    empresa_id is null
    or empresa_id = (select app.empresa_atual())
    or (select app.eh_admin_plataforma())
  );

-- O Gestor cria campos personalizados da própria empresa (Seção 4.6).
-- `empresa_id is not null` impede que um Gestor crie um campo "do sistema".
create policy campos_produto_insercao_gestor on public.campos_produto_disponiveis
  for insert to authenticated
  with check (
    empresa_id is not null
    and (select app.pode_escrever_como_gestor(campos_produto_disponiveis.empresa_id))
  );

create policy campos_produto_edicao_gestor on public.campos_produto_disponiveis
  for update to authenticated
  using (
    empresa_id is not null
    and (select app.pode_escrever_como_gestor(campos_produto_disponiveis.empresa_id))
  )
  with check (
    empresa_id is not null
    and (select app.pode_escrever_como_gestor(campos_produto_disponiveis.empresa_id))
  );

-- Todo membro precisa ler a configuração para renderizar o formulário de
-- produto; só o Gestor altera (Seção 4.6).
create policy empresa_campos_leitura on public.empresa_campos_produto
  for select to authenticated
  using ((select app.pode_ler(empresa_campos_produto.empresa_id)));

create policy empresa_campos_escrita_gestor on public.empresa_campos_produto
  for all to authenticated
  using ((select app.pode_escrever_como_gestor(empresa_campos_produto.empresa_id)))
  with check ((select app.pode_escrever_como_gestor(empresa_campos_produto.empresa_id)));

-- -----------------------------------------------------------------------------
-- Produtos
-- A permissão por COLUNA (editar dados vs. mexer no estoque vs. arquivar) é
-- aplicada pelo trigger `produtos_validar_permissao_colunas` em 0008 — uma
-- policy não consegue comparar OLD e NEW.
-- -----------------------------------------------------------------------------
create policy produtos_leitura on public.produtos
  for select to authenticated
  using ((select app.pode_ler(produtos.empresa_id)));

create policy produtos_insercao on public.produtos
  for insert to authenticated
  with check ((select app.pode_escrever(produtos.empresa_id, 'cadastrar_produto')));

-- Porta de entrada larga (qualquer uma das três permissões de escrita em
-- produto); o trigger de 0008 estreita conforme as colunas efetivamente
-- alteradas.
create policy produtos_edicao on public.produtos
  for update to authenticated
  using (
    (select app.pode_escrever(produtos.empresa_id)) and (
      (select app.tem_permissao('editar_produto'))
      or (select app.tem_permissao('gerenciar_estoque'))
      or (select app.tem_permissao('excluir_produto'))
    )
  )
  with check (
    (select app.pode_escrever(produtos.empresa_id)) and (
      (select app.tem_permissao('editar_produto'))
      or (select app.tem_permissao('gerenciar_estoque'))
      or (select app.tem_permissao('excluir_produto'))
    )
  );

-- Seção 8.4 — produtos nunca são apagados fisicamente: sem política de DELETE.

-- =============================================================================
-- VENDAS
-- =============================================================================

create policy vendas_leitura on public.vendas
  for select to authenticated
  using ((select app.pode_ler(vendas.empresa_id)));

-- Registrar e cancelar venda passam pelas RPCs de 0009: são operações
-- transacionais que mexem em estoque e financeiro ao mesmo tempo (Seções 7.4,
-- 8.5, 8.6). Sem política de INSERT/UPDATE/DELETE — vendas nunca são apagadas.

create policy venda_itens_leitura on public.venda_itens
  for select to authenticated
  using ((select app.pode_ler((select app.venda_empresa(venda_itens.venda_id)))));

-- =============================================================================
-- FINANCEIRO (Seção 8.6)
-- =============================================================================

-- Seção 5.3 — ver o módulo Financeiro exige `visualizar_financeiro`.
create policy movimentacoes_leitura on public.movimentacoes_financeiras
  for select to authenticated
  using (
    (select app.pode_ler(movimentacoes_financeiras.empresa_id))
    and (select app.tem_permissao('visualizar_financeiro'))
  );

-- Apenas lançamentos MANUAIS são criados/editados/excluídos pelo app, e
-- apenas pelo Gestor (Seção 8.6). Movimentações de origem `venda` e
-- `estorno_venda` são geradas pelas RPCs de venda/cancelamento e ficam
-- imutáveis para o cliente.
create policy movimentacoes_insercao_manual on public.movimentacoes_financeiras
  for insert to authenticated
  with check (
    origem = 'manual'
    and venda_id is null
    and (select app.pode_escrever_como_gestor(movimentacoes_financeiras.empresa_id))
  );

create policy movimentacoes_edicao_manual on public.movimentacoes_financeiras
  for update to authenticated
  using (
    origem = 'manual'
    and (select app.pode_escrever_como_gestor(movimentacoes_financeiras.empresa_id))
  )
  with check (
    origem = 'manual'
    and venda_id is null
    and (select app.pode_escrever_como_gestor(movimentacoes_financeiras.empresa_id))
  );

create policy movimentacoes_exclusao_manual on public.movimentacoes_financeiras
  for delete to authenticated
  using (
    origem = 'manual'
    and (select app.pode_escrever_como_gestor(movimentacoes_financeiras.empresa_id))
  );

-- =============================================================================
-- SOLICITAÇÕES DE CANCELAMENTO (Seções 4.17, 8.5)
-- =============================================================================

create policy solicitacoes_leitura on public.solicitacoes_cancelamento
  for select to authenticated
  using ((select app.pode_ler(solicitacoes_cancelamento.empresa_id)));

-- Qualquer membro ativo pode SOLICITAR — é justamente o caminho de quem não
-- tem a permissão `cancelar_venda` (Seção 8.5).
create policy solicitacoes_insercao on public.solicitacoes_cancelamento
  for insert to authenticated
  with check (
    solicitado_por = (select auth.uid())
    and status = 'pendente'
    and decidido_por is null
    and (select app.pode_escrever(solicitacoes_cancelamento.empresa_id))
  );

-- Aprovar/rejeitar passa pela RPC `decidir_solicitacao_cancelamento` (0009),
-- porque aprovar dispara a reversão de estoque e financeiro.

-- =============================================================================
-- ALERTAS E NOTIFICAÇÕES
-- =============================================================================

create policy alertas_leitura on public.alertas_estoque
  for select to authenticated
  using ((select app.pode_ler(alertas_estoque.empresa_id)));

-- A única escrita permitida é marcar como lido.
create policy alertas_marcar_lido on public.alertas_estoque
  for update to authenticated
  using ((select app.pode_ler(alertas_estoque.empresa_id)))
  with check ((select app.pode_ler(alertas_estoque.empresa_id)));

revoke update on public.alertas_estoque from authenticated;
grant update (lido_por, lido_em) on public.alertas_estoque to authenticated;

-- Alertas são gerados pelo trigger de estoque (0008) — sem política de INSERT.

create policy notificacoes_leitura on public.notificacoes
  for select to authenticated
  using (
    (select app.pode_ler(notificacoes.empresa_id))
    and (destinatario_id is null or destinatario_id = (select auth.uid()))
  );

create policy notificacoes_marcar_lido on public.notificacoes
  for update to authenticated
  using (
    (select app.pode_ler(notificacoes.empresa_id))
    and (destinatario_id is null or destinatario_id = (select auth.uid()))
  )
  with check (
    (select app.pode_ler(notificacoes.empresa_id))
    and (destinatario_id is null or destinatario_id = (select auth.uid()))
  );

revoke update on public.notificacoes from authenticated;
grant update (lido_por, lido_em) on public.notificacoes to authenticated;

-- Notificações são criadas pelo backend (service_role) — sem política de INSERT.

-- Token de push e preferências: cada usuário gerencia apenas os seus
-- (Seção 7.14). Não dependem do estado da assinatura — um usuário em modo
-- limitado continua podendo registrar dispositivo e ajustar preferências.
create policy dispositivos_push_proprios on public.dispositivos_push
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

create policy preferencias_proprias on public.preferencias_notificacao
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- =============================================================================
-- AUDITORIA (Seções 9.1, 10.1)
-- =============================================================================

-- Somente leitura, e apenas para o Gestor. Nenhuma política de INSERT
-- (escrita exclusiva dos triggers SECURITY DEFINER de 0008), e nenhuma de
-- UPDATE ou DELETE — em nenhuma circunstância, para nenhum papel.
create policy logs_leitura_gestor on public.logs_auditoria
  for select to authenticated
  using (
    (select app.eh_admin_plataforma())
    or (
      logs_auditoria.empresa_id = (select app.empresa_atual())
      and (select app.eh_gestor())
    )
  );
