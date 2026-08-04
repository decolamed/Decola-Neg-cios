/**
 * Tipos do banco — espelho do schema aplicado no Supabase.
 *
 * REGERAR após qualquer migration:
 *   npx supabase gen types typescript --project-id nakqafnchwydfogcozvc > packages/types/src/database.ts
 *
 * Compartilhado entre app cliente e Painel Administrativo.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Enums = {
  alerta_estoque_tipo: 'estoque_baixo' | 'esgotado';
  assinatura_status:
    | 'pendente_pagamento'
    | 'trial'
    | 'ativa'
    | 'carencia'
    | 'modo_limitado'
    | 'cancelada';
  ciclo_vida: 'ativo' | 'arquivado' | 'excluido';
  cobranca_forma_pagamento: 'pix' | 'boleto' | 'cartao';
  cobranca_status: 'pendente' | 'confirmado' | 'vencido' | 'cancelado';
  desconto_tipo: 'percentual' | 'valor_fixo';
  empresa_status: 'ativa' | 'suspensa' | 'inativa';
  forma_pagamento_venda: 'dinheiro' | 'pix' | 'cartao' | 'outros';
  movimentacao_origem: 'venda' | 'manual' | 'estorno_venda';
  movimentacao_tipo: 'entrada' | 'saida';
  notificacao_categoria: 'estoque' | 'assinatura' | 'administrativo';
  papel_usuario: 'gestor_principal' | 'gestor' | 'funcionario';
  solicitacao_status: 'pendente' | 'aprovado' | 'rejeitado';
  tipo_campo: 'texto' | 'numero' | 'selecao' | 'booleano' | 'data';
  venda_status: 'pendente' | 'confirmada' | 'cancelada';
  vinculo_status: 'convidado' | 'ativo' | 'removido';
  /** Computado em tempo de leitura pela view `produtos_com_status` (Seção 8.3). */
  status_estoque: 'disponivel' | 'estoque_baixo' | 'esgotado';
};

/** Chaves canônicas de permissão da Seção 5.3 — espelham app.chaves_permissao(). */
export const CHAVES_PERMISSAO = [
  'cadastrar_produto',
  'editar_produto',
  'excluir_produto',
  'gerenciar_estoque',
  'visualizar_financeiro',
  'exportar_relatorios',
  'cancelar_venda',
  'gerenciar_assinatura',
] as const;

export type ChavePermissao = (typeof CHAVES_PERMISSAO)[number];
export type MapaPermissoes = Partial<Record<ChavePermissao, boolean>>;

type Linha<TRow, TInsert = Partial<TRow>, TUpdate = Partial<TRow>> = {
  Row: TRow;
  Insert: TInsert;
  Update: TUpdate;
  Relationships: [];
};

export type Empresa = {
  id: string;
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  logo_url: string | null;
  chave_pix: string | null;
  status: Enums['empresa_status'];
  alerta_estoque_percentual: number;
  criado_em: string;
  atualizado_em: string;
};

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  aceitou_termos_em: string | null;
  criado_em: string;
};

export type EmpresaUsuario = {
  id: string;
  empresa_id: string;
  usuario_id: string | null;
  nome_convite: string;
  email_convite: string;
  papel: Enums['papel_usuario'];
  permissoes: Json;
  status: Enums['vinculo_status'];
  convidado_em: string;
  convite_expira_em: string;
  aceito_em: string | null;
};

export type Plano = {
  id: string;
  nome: string;
  valor_mensal: number;
  funcionalidades: Json;
  limites: Json;
  ativo: boolean;
  slug: string;
  criado_em: string;
  atualizado_em: string;
};

export type Assinatura = {
  id: string;
  empresa_id: string;
  plano_id: string;
  valor_contratado: number;
  status: Enums['assinatura_status'];
  trial_expira_em: string | null;
  carencia_expira_em: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  proximo_vencimento: string | null;
  ativada_manualmente: boolean;
  ativada_por: string | null;
  /** Downgrade solicitado, a aplicar no próximo vencimento (Seção 6.7). */
  plano_agendado_id: string | null;
  troca_agendada_para: string | null;
  valor_agendado: number | null;
  criado_em: string;
  atualizado_em: string;
};

export type ConfiguracaoPlataforma = {
  id: string;
  linha_unica: boolean;
  trial_ativo: boolean;
  trial_dias: number;
  carencia_dias: number;
  atualizado_em: string;
  atualizado_por: string | null;
};

export type Produto = {
  id: string;
  empresa_id: string;
  nome: string;
  codigo: string | null;
  categoria_id: string | null;
  preco: number;
  estoque_atual: number;
  estoque_referencia_alerta: number;
  ciclo_vida: Enums['ciclo_vida'];
  atributos: Json;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type CategoriaProduto = {
  id: string;
  empresa_id: string;
  nome: string;
  ciclo_vida: Enums['ciclo_vida'];
  criado_em: string;
  atualizado_em: string;
};

export type Venda = {
  id: string;
  empresa_id: string;
  usuario_id: string;
  status: Enums['venda_status'];
  subtotal: number;
  desconto_tipo: Enums['desconto_tipo'] | null;
  desconto: number;
  total: number;
  forma_pagamento: Enums['forma_pagamento_venda'];
  cancelada_em: string | null;
  cancelada_por: string | null;
  criado_em: string;
};

export type MovimentacaoFinanceira = {
  id: string;
  empresa_id: string;
  tipo: Enums['movimentacao_tipo'];
  valor: number;
  descricao: string;
  categoria: string | null;
  origem: Enums['movimentacao_origem'];
  venda_id: string | null;
  data_movimentacao: string;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type AlertaEstoque = {
  id: string;
  empresa_id: string;
  produto_id: string;
  tipo: Enums['alerta_estoque_tipo'];
  mensagem: string;
  ciclo_referencia: number;
  lido_por: string | null;
  lido_em: string | null;
  criado_em: string;
};

export type Notificacao = {
  id: string;
  empresa_id: string;
  categoria: Enums['notificacao_categoria'];
  titulo: string;
  mensagem: string;
  destinatario_id: string | null;
  entidade: string | null;
  entidade_id: string | null;
  lido_por: string | null;
  lido_em: string | null;
  criado_em: string;
};

export type CampoProdutoDisponivel = {
  id: string;
  chave: string;
  nome_exibicao: string;
  tipo_campo: Enums['tipo_campo'];
  opcoes: Json | null;
  /** Nulo = campo padrão do sistema, disponível a todas as empresas. */
  empresa_id: string | null;
  criado_em: string;
};

export type EmpresaCampoProduto = {
  id: string;
  empresa_id: string;
  campo_id: string;
  ativo: boolean;
  obrigatorio: boolean;
  ordem: number;
};

export type VendaItem = {
  id: string;
  venda_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
};

export type Cobranca = {
  id: string;
  assinatura_id: string;
  asaas_payment_id: string;
  valor: number;
  forma_pagamento: Enums['cobranca_forma_pagamento'];
  status: Enums['cobranca_status'];
  vencimento: string;
  pago_em: string | null;
  criado_em: string;
};

export type SolicitacaoCancelamento = {
  id: string;
  empresa_id: string;
  venda_id: string;
  solicitado_por: string;
  motivo: string | null;
  status: Enums['solicitacao_status'];
  decidido_por: string | null;
  decidido_em: string | null;
  criado_em: string;
};

export type DispositivoPush = {
  id: string;
  usuario_id: string;
  expo_push_token: string;
  plataforma: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type PreferenciaNotificacao = {
  usuario_id: string;
  estoque: boolean;
  assinatura: boolean;
  administrativo: boolean;
  atualizado_em: string;
};

export type LogAuditoria = {
  id: string;
  empresa_id: string | null;
  usuario_id: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  dados_anteriores: Json | null;
  dados_novos: Json | null;
  criado_em: string;
};

export type AdministradorPlataforma = {
  id: string;
  nome: string;
  email: string;
  criado_em: string;
};

/**
 * View `produtos_com_status` (migration 0016) — Seção 8.3.
 * O status e o percentual restante são computados pelo banco em tempo de
 * leitura; o app nunca os recalcula.
 */
export type ProdutoComStatusRow = Produto & {
  categoria_nome: string | null;
  status_estoque: Enums['status_estoque'];
  percentual_restante: number | null;
};

export type Database = {
  public: {
    Tables: {
      empresas: Linha<Empresa>;
      usuarios: Linha<Usuario>;
      empresa_usuarios: Linha<EmpresaUsuario>;
      planos: Linha<Plano>;
      assinaturas: Linha<Assinatura>;
      configuracoes_plataforma: Linha<ConfiguracaoPlataforma>;
      produtos: Linha<Produto>;
      categorias_produto: Linha<CategoriaProduto>;
      vendas: Linha<Venda>;
      movimentacoes_financeiras: Linha<MovimentacaoFinanceira>;
      alertas_estoque: Linha<AlertaEstoque>;
      notificacoes: Linha<Notificacao>;
      campos_produto_disponiveis: Linha<CampoProdutoDisponivel>;
      empresa_campos_produto: Linha<
        EmpresaCampoProduto,
        Omit<EmpresaCampoProduto, 'id'> & { id?: string },
        Partial<EmpresaCampoProduto>
      >;
      venda_itens: Linha<VendaItem>;
      cobrancas: Linha<Cobranca>;
      solicitacoes_cancelamento: Linha<SolicitacaoCancelamento>;
      dispositivos_push: Linha<DispositivoPush>;
      preferencias_notificacao: Linha<PreferenciaNotificacao>;
      logs_auditoria: Linha<LogAuditoria>;
      administradores_plataforma: Linha<AdministradorPlataforma>;
    };
    Views: {
      produtos_com_status: {
        Row: ProdutoComStatusRow;
        Relationships: [];
      };
    };
    Functions: {
      criar_empresa_e_assinatura: {
        Args: {
          p_nome_empresa: string;
          p_plano_id: string;
          p_nome_usuario: string;
          p_aceitou_termos?: boolean;
        };
        Returns: Json;
      };
      convidar_funcionario: { Args: { p_nome: string; p_email: string }; Returns: string };
      reenviar_convite: { Args: { p_vinculo_id: string }; Returns: string };
      aceitar_convite: { Args: { p_vinculo_id: string }; Returns: string };
      alterar_papel_usuario: {
        Args: { p_vinculo_id: string; p_papel: Enums['papel_usuario'] };
        Returns: undefined;
      };
      definir_permissoes: { Args: { p_vinculo_id: string; p_permissoes: Json }; Returns: undefined };
      remover_usuario: { Args: { p_vinculo_id: string }; Returns: undefined };
      ajustar_estoque: {
        Args: {
          p_produto_id: string;
          p_quantidade: number;
          p_motivo?: string | null;
          p_tipo?: string;
        };
        Returns: Json;
      };
      arquivar_produto: { Args: { p_produto_id: string }; Returns: undefined };
      restaurar_produto: { Args: { p_produto_id: string }; Returns: undefined };
      excluir_produto: { Args: { p_produto_id: string }; Returns: undefined };
      criar_campo_personalizado: {
        Args: {
          p_nome_exibicao: string;
          p_tipo: Enums['tipo_campo'];
          p_opcoes?: Json | null;
        };
        Returns: string;
      };
      registrar_venda: {
        Args: {
          /** [{ produto_id, quantidade }] — o servidor define preço e total. */
          p_itens: Json;
          p_forma_pagamento: Enums['forma_pagamento_venda'];
          p_desconto_tipo?: Enums['desconto_tipo'] | null;
          p_desconto_valor?: number;
        };
        Returns: Json;
      };
      cancelar_venda: {
        Args: { p_venda_id: string; p_motivo?: string | null };
        Returns: undefined;
      };
      solicitar_cancelamento_venda: {
        Args: { p_venda_id: string; p_motivo?: string | null };
        Returns: string;
      };
      decidir_solicitacao_cancelamento: {
        Args: { p_solicitacao_id: string; p_aprovar: boolean };
        Returns: undefined;
      };
      /** Seção 8.6 — resumo do Financeiro, por agregação em tempo real. */
      resumo_financeiro: {
        Args: { p_desde: string; p_ate: string };
        Returns: Json;
      };
      /** Seção 8.6 — autocomplete das categorias já usadas pela empresa. */
      categorias_financeiras_usadas: {
        Args: Record<string, never>;
        Returns: string[];
      };
      /** Seção 10.2 — dados dos cinco gráficos, numa chamada só. */
      relatorio_vendas: {
        Args: { p_desde: string; p_ate: string };
        Returns: Json;
      };
      /** Seção 6.7 — upgrade imediato, downgrade no próximo ciclo. */
      trocar_plano: {
        Args: { p_plano_id: string };
        Returns: Json;
      };
      cancelar_troca_de_plano: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Enums;
    CompositeTypes: Record<never, never>;
  };
};

/** Retorno da RPC de criação de empresa (Seção 7.12, item 5). */
export type ResultadoCriacaoEmpresa = {
  empresa_id: string;
  assinatura_status: Enums['assinatura_status'];
  trial_expira_em: string | null;
};

/** Retorno da RPC de troca de plano (Seção 6.7). */
export type ResultadoTrocaDePlano = {
  /** `true` no upgrade (imediato); `false` no downgrade (próximo ciclo). */
  aplicado: boolean;
  tipo: 'upgrade' | 'downgrade';
  plano_id: string;
  /** Data em que o downgrade passa a valer. Ausente no upgrade. */
  a_partir_de?: string;
  mensagem: string;
};
