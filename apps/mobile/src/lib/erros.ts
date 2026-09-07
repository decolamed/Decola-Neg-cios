/**
 * Tradução de erros do Postgres/Supabase para mensagens de usuário.
 *
 * As RPCs de 0009 levantam exceções com SQLSTATE escolhido de propósito, e as
 * políticas de RLS produzem erros próprios. Concentrar a tradução aqui evita
 * que uma tela mostre "new row violates row-level security policy" para um
 * lojista.
 */
import { PostgrestError } from '@supabase/supabase-js';
import { SemConexaoError } from './conectividade';

/** Códigos usados deliberadamente pelas RPCs e pelo Postgres. */
const CODIGOS = {
  /** insufficient_privilege — permissão negada (Seção 5.3). */
  PERMISSAO: '42501',
  /** invalid_parameter_value — validação de regra de negócio. */
  VALIDACAO: '22023',
  /** unique_violation — duplicidade (e-mail, vínculo, código de produto). */
  DUPLICADO: '23505',
  /** foreign_key_violation — referência inexistente. */
  NAO_ENCONTRADO: '23503',
  /** check_violation — invariante do schema (ex: estoque negativo). */
  RESTRICAO: '23514',
  /** RLS barrou a escrita. */
  RLS: '42501',
} as const;

const MENSAGEM_GENERICA = 'Não foi possível concluir a operação. Tente novamente.';

/**
 * As RPCs já escrevem mensagens prontas para o usuário (em português, com o
 * contexto da regra violada), então quando o código indica uma exceção nossa
 * repassamos a mensagem original. Erros estruturais do Postgres viram texto
 * genérico — nunca vazam detalhe de schema para a interface.
 */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof SemConexaoError) {
    return erro.message;
  }

  const pgErro = erro as PostgrestError | undefined;
  if (!pgErro || typeof pgErro !== 'object') {
    return MENSAGEM_GENERICA;
  }

  switch (pgErro.code) {
    case CODIGOS.PERMISSAO:
      // Mensagem da RPC quando existe; senão, texto padrão de permissão.
      return pgErro.message?.trim()
        ? pgErro.message
        : 'Você não tem permissão para realizar esta ação.';

    case CODIGOS.VALIDACAO:
    case CODIGOS.DUPLICADO:
      return pgErro.message?.trim() ? pgErro.message : MENSAGEM_GENERICA;

    case CODIGOS.NAO_ENCONTRADO:
      return pgErro.message?.trim() ? pgErro.message : 'Registro não encontrado.';

    case CODIGOS.RESTRICAO:
      return 'Os dados informados são inválidos para esta operação.';

    default:
      return MENSAGEM_GENERICA;
  }
}

/**
 * Mensagens em inglês que escapam das bibliotecas — rede, Storage, módulos
 * nativos do Expo, Auth. Nenhuma delas foi escrita pensando em lojista, e
 * várias não querem dizer nada nem para quem lê inglês ("Failed to fetch").
 *
 * A lista é de PADRÕES, não de textos exatos: as bibliotecas mudam a redação
 * entre versões e o miolo costuma sobreviver.
 */
const TRADUCOES: [RegExp, string][] = [
  [
    /failed to fetch|network request failed|networkerror|load failed|err_internet|fetch failed/i,
    'Não foi possível falar com o servidor. Verifique sua conexão com a internet e tente de novo.',
  ],
  [
    /timeout|timed out|aborted/i,
    'O servidor demorou demais para responder. Tente novamente em instantes.',
  ],
  [
    /row-level security|not authorized|unauthorized|permission denied|forbidden|403/i,
    'Você não tem permissão para fazer isso.',
  ],
  [
    /jwt|token.*(expired|invalid)|session.*(expired|missing)|refresh.*token/i,
    'Sua sessão expirou. Entre novamente para continuar.',
  ],
  [
    /exceeded the maximum|payload too large|file size|too large|413/i,
    'O arquivo é grande demais. Escolha um menor e tente de novo.',
  ],
  [
    /mime type|content type|not supported|unsupported/i,
    'Este tipo de arquivo não é aceito. Use uma imagem JPG ou PNG.',
  ],
  [
    /(is not available|not implemented|unsupported).*(web|browser)|not available on web/i,
    'Este recurso não funciona pelo navegador. Use o aplicativo instalado no celular.',
  ],
  [
    /duplicate key|already exists/i,
    'Já existe um registro com esses dados.',
  ],
  [
    /object not found|not found|404/i,
    'Não encontramos o que você procurava. Ele pode ter sido removido.',
  ],
  [
    /quota|storage.*full|insufficient storage/i,
    'O espaço de armazenamento acabou. Remova arquivos antigos e tente de novo.',
  ],
];

/** Sinais de que o texto foi escrito por nós, em português, para o usuário. */
const PARECE_PORTUGUES =
  /[áàâãéêíóôõúüç]|\b(não|voce|você|nao|selecione|informe|escolha|cadastr|permiss|estoque|venda|produto|pedido|chave|conta|senha)/i;

/** Sinais de mensagem técnica de biblioteca, em inglês. */
const PARECE_INGLES =
  /\b(failed|error|invalid|unable|cannot|unexpected|undefined|null|exception|request|response|network|denied|unauthorized|forbidden|timeout|exceeded|unsupported|missing|required|not found|is not a|does not)\b/i;

/**
 * O texto que a TELA deve mostrar para um erro qualquer.
 *
 * POR QUE ISTO EXISTE. As telas faziam `e instanceof Error ? e.message : '…'`.
 * Isso funciona para os erros que nós mesmos levantamos — que já vêm em
 * português, com a regra explicada — e falha para todo o resto: o usuário via
 * "Failed to fetch" ou "not available on web" e não tinha como saber se a
 * culpa era da internet, do arquivo escolhido ou do aplicativo.
 *
 * A regra é conservadora: mensagem nossa passa intacta; mensagem conhecida em
 * inglês vira a tradução correspondente; mensagem em inglês que não está na
 * lista vira o texto padrão da tela, que ao menos diz o que falhou.
 */
export function textoDoErro(erro: unknown, padrao: string): string {
  if (erro instanceof SemConexaoError) return erro.message;

  const possivelPg = erro as PostgrestError | undefined;
  if (possivelPg && typeof possivelPg === 'object' && typeof possivelPg.code === 'string') {
    const traduzido = mensagemDeErro(erro);
    if (traduzido !== MENSAGEM_GENERICA) return traduzido;
  }

  const texto = erro instanceof Error ? erro.message?.trim() : '';
  if (!texto) return padrao;

  if (PARECE_PORTUGUES.test(texto)) return texto;

  for (const [padraoDoTexto, traducao] of TRADUCOES) {
    if (padraoDoTexto.test(texto)) return traducao;
  }

  // Inglês desconhecido: o texto padrão da tela diz mais do que o original.
  if (PARECE_INGLES.test(texto)) return padrao;

  return texto;
}

/**
 * `true` quando o erro veio de falta de permissão — a interface deve reagir
 * recarregando o estado do usuário, já que a permissão pode ter sido revogada
 * em tempo real por um Gestor (Seção 5.4).
 */
export function ehErroDePermissao(erro: unknown): boolean {
  return (erro as PostgrestError | undefined)?.code === CODIGOS.PERMISSAO;
}
