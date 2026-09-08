/**
 * Dashboard e central de notificações — Seção 7.2.
 *
 * Os quatro cards vêm de uma RPC agregada (`resumo_dashboard`, migration
 * 0029): contar produtos e somar vendas no cliente exigiria baixar as duas
 * tabelas inteiras a cada abertura do app.
 *
 * A central de notificações une duas fontes que a especificação trata como uma
 * coisa só para o usuário: `alertas_estoque` (Seção 4.14) e `notificacoes`
 * (assinatura e administrativo). Cada uma tem a sua tabela porque o alerta de
 * estoque carrega produto e ciclo; do lado da tela, viram uma lista única
 * ordenada por data.
 */
import type { Enums } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { mensagemDeErro } from '@/lib/erros';
import { observarTabelas } from '@/lib/tempoReal';

export type ResumoDoDashboard = {
  vendas_hoje_total: number;
  vendas_hoje_quantidade: number;
  vendas_quantidade_total: number;
  produtos_ativos: number;
  estoque_baixo: number;
  /** Badge do sino: alertas e notificações ainda não lidos. */
  nao_lidas: number;
};

export async function carregarResumo(): Promise<ResumoDoDashboard> {
  const { data, error } = await supabase.rpc('resumo_dashboard');
  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as ResumoDoDashboard;
}

export type CategoriaDoAviso = Enums['notificacao_categoria'];

export type Aviso = {
  id: string;
  /** Qual tabela originou — decide onde marcar como lido. */
  fonte: 'alerta' | 'notificacao';
  categoria: CategoriaDoAviso;
  titulo: string;
  mensagem: string;
  criado_em: string;
  lido: boolean;
  /**
   * Seção 7.2 — "Tocar em uma notificação abre a tela relacionada".
   * `null` quando o aviso é só informativo.
   */
  destino: string | null;
};

type LinhaAlerta = {
  id: string;
  tipo: Enums['alerta_estoque_tipo'];
  mensagem: string;
  produto_id: string;
  lido_em: string | null;
  criado_em: string;
};

type LinhaNotificacao = {
  id: string;
  categoria: CategoriaDoAviso;
  titulo: string;
  mensagem: string;
  entidade: string | null;
  entidade_id: string | null;
  lido_em: string | null;
  criado_em: string;
};

const TITULO_DO_ALERTA: Record<Enums['alerta_estoque_tipo'], string> = {
  estoque_baixo: 'Estoque baixo',
  esgotado: 'Produto esgotado',
};

/**
 * A RLS já limita as duas consultas à empresa do usuário — e `notificacoes`
 * ainda filtra por destinatário, então um aviso dirigido ao Gestor não aparece
 * para o Funcionário.
 */
export async function listarAvisos(limite = 50): Promise<Aviso[]> {
  const [respostaAlertas, respostaNotificacoes] = await Promise.all([
    supabase
      .from('alertas_estoque')
      .select('id, tipo, mensagem, produto_id, lido_em, criado_em')
      .order('criado_em', { ascending: false })
      .limit(limite),
    supabase
      .from('notificacoes')
      .select('id, categoria, titulo, mensagem, entidade, entidade_id, lido_em, criado_em')
      .order('criado_em', { ascending: false })
      .limit(limite),
  ]);

  if (respostaAlertas.error) throw new Error(mensagemDeErro(respostaAlertas.error));
  if (respostaNotificacoes.error) throw new Error(mensagemDeErro(respostaNotificacoes.error));

  const alertas: Aviso[] = ((respostaAlertas.data ?? []) as LinhaAlerta[]).map((linha) => ({
    id: linha.id,
    fonte: 'alerta',
    categoria: 'estoque',
    titulo: TITULO_DO_ALERTA[linha.tipo],
    mensagem: linha.mensagem,
    criado_em: linha.criado_em,
    lido: linha.lido_em !== null,
    // Seção 7.2 — alerta de estoque leva à tela Estoque Baixo (Seção 7.6).
    destino: '/estoque-baixo',
  }));

  const notificacoes: Aviso[] = ((respostaNotificacoes.data ?? []) as LinhaNotificacao[]).map(
    (linha) => ({
      id: linha.id,
      fonte: 'notificacao',
      categoria: linha.categoria,
      titulo: linha.titulo,
      mensagem: linha.mensagem,
      criado_em: linha.criado_em,
      lido: linha.lido_em !== null,
      destino: destinoDoAviso(linha),
    }),
  );

  return [...alertas, ...notificacoes].sort(
    (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
  );
}

function destinoDoAviso(linha: LinhaNotificacao): string | null {
  if (linha.categoria === 'assinatura') return '/perfil/plano';
  if (linha.entidade === 'venda' && linha.entidade_id) return `/vendas/${linha.entidade_id}`;
  if (linha.entidade === 'solicitacao_cancelamento') return '/vendas/solicitacoes';
  return null;
}

/**
 * A única escrita permitida nas duas tabelas é marcar como lido — o GRANT é
 * por coluna (`lido_por`, `lido_em`), então nem um cliente modificado
 * conseguiria reescrever a mensagem de um alerta.
 */
export async function marcarComoLido(aviso: Aviso, usuarioId: string): Promise<void> {
  const tabela = aviso.fonte === 'alerta' ? 'alertas_estoque' : 'notificacoes';

  const { error } = await supabase
    .from(tabela)
    .update({ lido_por: usuarioId, lido_em: new Date().toISOString() })
    .eq('id', aviso.id);

  if (error) throw new Error(mensagemDeErro(error));
}

export async function marcarTodosComoLidos(avisos: Aviso[], usuarioId: string): Promise<void> {
  const naoLidos = avisos.filter((aviso) => !aviso.lido);
  if (naoLidos.length === 0) return;

  const agora = new Date().toISOString();
  const porFonte = (fonte: Aviso['fonte']) =>
    naoLidos.filter((aviso) => aviso.fonte === fonte).map((aviso) => aviso.id);

  const alertas = porFonte('alerta');
  const notificacoes = porFonte('notificacao');

  const escritas = [];
  if (alertas.length > 0) {
    escritas.push(
      supabase
        .from('alertas_estoque')
        .update({ lido_por: usuarioId, lido_em: agora })
        .in('id', alertas),
    );
  }
  if (notificacoes.length > 0) {
    escritas.push(
      supabase
        .from('notificacoes')
        .update({ lido_por: usuarioId, lido_em: agora })
        .in('id', notificacoes),
    );
  }

  const respostas = await Promise.all(escritas);
  const falha = respostas.find((resposta) => resposta.error);
  if (falha?.error) throw new Error(mensagemDeErro(falha.error));
}

/**
 * Seção 3.3 — o sino reflete em tempo real: uma venda de outro caixa que zera
 * o estoque acende o alerta sem precisar recarregar a tela.
 */
export function observarAvisos(empresaId: string, aoMudar: () => void) {
  return observarTabelas({
    nome: 'avisos',
    empresaId,
    assuntos: [{ tabela: 'alertas_estoque' }, { tabela: 'notificacoes' }],
    aoMudar,
  });
}
