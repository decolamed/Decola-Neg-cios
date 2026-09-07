/**
 * Endereços públicos do produto, num lugar só.
 *
 * O link de contratação, o botão "Visualizar aplicativo" e o link da loja de
 * uma empresa apontam todos para o mesmo site. Ter a base repetida em três
 * arquivos é como duas delas continuam apontando para o domínio antigo depois
 * de uma troca.
 *
 * `VITE_URL_CADASTRO` sobrepõe quando o site vive em outro domínio (um
 * ambiente de homologação, por exemplo).
 */
const PADRAO = 'https://decola.pro';

export const URL_DO_SITE: string =
  import.meta.env.VITE_URL_CADASTRO?.trim().replace(/\/$/, '') || PADRAO;

/** Página de contratação com o plano já escolhido. */
export function linkDeContratacao(slug: string): string {
  return `${URL_DO_SITE}/cadastro?plano=${encodeURIComponent(slug)}`;
}

/** Vitrine pública de uma empresa. */
export function linkDaLoja(slug: string): string {
  return `${URL_DO_SITE}/loja/${slug}`;
}
