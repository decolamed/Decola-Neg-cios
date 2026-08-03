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
 * `true` quando o erro veio de falta de permissão — a interface deve reagir
 * recarregando o estado do usuário, já que a permissão pode ter sido revogada
 * em tempo real por um Gestor (Seção 5.4).
 */
export function ehErroDePermissao(erro: unknown): boolean {
  return (erro as PostgrestError | undefined)?.code === CODIGOS.PERMISSAO;
}
