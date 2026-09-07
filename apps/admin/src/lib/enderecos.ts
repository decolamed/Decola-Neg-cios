/**
 * Endereços públicos do produto, num lugar só.
 *
 * O link de contratação, o botão "Visualizar aplicativo" e o link da loja de
 * uma empresa apontam todos para o mesmo site. Ter a base repetida em três
 * arquivos é como duas delas continuam apontando para o domínio antigo depois
 * de uma troca.
 *
 * O padrão é o domínio da Vercel, e não um domínio comprado. Estes endereços
 * entram em link que o cliente salva e reusa — link de plano que você manda a
 * um interessado, link de loja que o lojista imprime. Um domínio anual que
 * vence transforma todos eles em erro de uma vez. `decola.pro` fica só no
 * remetente dos e-mails, onde o link é clicado em minutos e expira sozinho.
 *
 * `VITE_URL_SITE` sobrepõe (homologação, ou um domínio próprio no futuro);
 * `VITE_URL_CADASTRO` continua sendo lida pelo nome antigo, para uma
 * publicação existente não perder a configuração ao atualizar.
 */
const PADRAO = 'https://site-kappa-five-66.vercel.app';

export const URL_DO_SITE: string =
  import.meta.env.VITE_URL_SITE?.trim().replace(/\/$/, '') ||
  import.meta.env.VITE_URL_CADASTRO?.trim().replace(/\/$/, '') ||
  PADRAO;

/** Página de contratação com o plano já escolhido. */
export function linkDeContratacao(slug: string): string {
  return `${URL_DO_SITE}/cadastro?plano=${encodeURIComponent(slug)}`;
}

/**
 * O aplicativo do cliente, servido junto do site em `/app`.
 *
 * É para cá que "Visualizar aplicativo" deve levar: quem clica quer ver o que
 * o cliente vê ao entrar, não a página de vendas.
 */
export const URL_DO_APP = `${URL_DO_SITE}/app/`;

/** Vitrine pública de uma empresa. */
export function linkDaLoja(slug: string): string {
  return `${URL_DO_SITE}/loja/${slug}`;
}
