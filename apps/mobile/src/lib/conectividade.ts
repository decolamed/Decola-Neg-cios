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

/**
 * Prazo para a checagem de conexão responder.
 *
 * `NetInfo.fetch()` na web faz uma requisição de sondagem antes de responder.
 * Numa rede móvel ruim essa requisição pode ficar pendurada — e como ela é
 * `await`, TUDO que depende dela fica pendurado junto: a abertura do app, o
 * envio de uma foto, o registro de uma venda. Uma tela que espera para sempre
 * é pior do que uma que erra: a pessoa não tem sequer o que tentar.
 */
const PRAZO_DA_CHECAGEM = 4000;

export async function estaConectado(): Promise<boolean> {
  /**
   * Na dúvida, CONECTADO.
   *
   * Se a sondagem não responde a tempo, isso não é prova de que falta
   * internet — é prova de que a sondagem não respondeu. Seguir em frente faz a
   * operação de verdade acontecer, e se ela falhar o erro que a pessoa vê vem
   * do servidor, dizendo o que houve. Barrar aqui produziria "Sem conexão" em
   * cima de uma internet que está funcionando.
   */
  const semResposta = new Promise<boolean>((resolver) => {
    setTimeout(() => resolver(true), PRAZO_DA_CHECAGEM);
  });

  const checagem = NetInfo.fetch()
    .then(
      (estado) =>
        // `isInternetReachable` pode ser null enquanto o teste ainda não
        // concluiu; nesse caso confiamos em `isConnected`.
        Boolean(estado.isConnected) && estado.isInternetReachable !== false,
    )
    .catch(() => true);

  return Promise.race([checagem, semResposta]);
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
