/**
 * Conectividade — Seção 3.5 (sem tolerância offline na V1).
 *
 * A especificação é explícita: operações críticas exigem conexão ativa e, sem
 * rede, o app deve EXIBIR UMA MENSAGEM CLARA — nunca enfileirar em background,
 * nem simplesmente travar. Este módulo concentra essa checagem para que
 * nenhuma tela invente a própria mensagem.
 */
import NetInfo from '@react-native-community/netinfo';

/** Mensagens exatas da especificação, por contexto de tela. */
export const MENSAGENS_SEM_CONEXAO = {
  /** Seção 7.10 — Splash. */
  splash: 'Sem conexão. Verifique sua internet.',
  /** Seção 7.11 — Login. */
  login: 'Sem conexão. Conecte-se à internet para entrar.',
  /** Seção 7.12 — Cadastro. */
  cadastro: 'Sem conexão. Conecte-se à internet para continuar.',
  /** Seção 3.5 — demais operações críticas (venda, estoque, produto, financeiro). */
  operacao: 'Sem conexão. É necessário estar conectado à internet para concluir esta ação.',
} as const;

export type ContextoConexao = keyof typeof MENSAGENS_SEM_CONEXAO;

export class SemConexaoError extends Error {
  readonly semConexao = true;

  constructor(contexto: ContextoConexao = 'operacao') {
    super(MENSAGENS_SEM_CONEXAO[contexto]);
    this.name = 'SemConexaoError';
  }
}

export async function estaConectado(): Promise<boolean> {
  const estado = await NetInfo.fetch();
  // `isInternetReachable` pode ser null enquanto o teste ainda não concluiu;
  // nesse caso confiamos em `isConnected` para não bloquear indevidamente.
  return Boolean(estado.isConnected) && estado.isInternetReachable !== false;
}

/**
 * Porta de entrada de toda operação crítica (Seção 3.5): registrar venda,
 * atualizar estoque, cadastrar/editar produto, cancelar venda, qualquer
 * escrita no financeiro ou nos dados da empresa.
 *
 * Falhar aqui é apenas uma cortesia de UX — quem realmente garante a
 * integridade é o backend (RLS + RPC). Um app sem rede não escreve nada de
 * qualquer forma.
 */
export async function exigirConexao(contexto: ContextoConexao = 'operacao'): Promise<void> {
  if (!(await estaConectado())) {
    throw new SemConexaoError(contexto);
  }
}

export function assinarMudancaDeConexao(aoMudar: (conectado: boolean) => void): () => void {
  return NetInfo.addEventListener((estado) => {
    aoMudar(Boolean(estado.isConnected) && estado.isInternetReachable !== false);
  });
}
