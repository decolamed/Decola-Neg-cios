/**
 * A escolha de tema: aplicar, guardar e lembrar.
 *
 * TRÊS OPÇÕES, E "SISTEMA" É O PADRÃO. Quem já deixou o celular no escuro não
 * deveria precisar dizer de novo aqui — e quem quer o contrário do sistema
 * (trabalhar no claro com o telefone no escuro) precisa poder forçar. Por isso
 * a preferência tem três estados, e não um interruptor de dois.
 *
 * COMO A ESCOLHA VIRA COR. `data-tema` no `<html>` é o que o CSS lê (ver
 * `temas.ts`). "Sistema" não escreve atributo nenhum: a ausência é o que deixa
 * a consulta de mídia mandar.
 *
 * ONDE FICA GUARDADA. `localStorage`, por aparelho — não no banco. Tema é
 * preferência de quem está olhando a tela, e o mesmo lojista pode querer claro
 * no balcão e escuro no celular de casa. Guardar no perfil forçaria os dois a
 * serem iguais.
 */
import { CSS_DAS_CORES } from './temas';

export type Aparencia = 'sistema' | 'claro' | 'escuro';

export const CHAVE_DA_APARENCIA = 'decola:aparencia';

const ID_DO_ESTILO = 'decola-tema';

function ehValida(valor: unknown): valor is Aparencia {
  return valor === 'sistema' || valor === 'claro' || valor === 'escuro';
}

/**
 * O CSS das variáveis, colocado na página uma vez.
 *
 * Idempotente: chamar de novo não duplica a folha. Quem chama é a raiz do app,
 * e em desenvolvimento ela remonta várias vezes.
 */
export function instalarCoresDoTema(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ID_DO_ESTILO)) return;

  const estilo = document.createElement('style');
  estilo.id = ID_DO_ESTILO;
  estilo.textContent = CSS_DAS_CORES;
  document.head.appendChild(estilo);
}

/** A escolha guardada, ou "sistema" se nunca houve uma. */
export function aparenciaGuardada(): Aparencia {
  if (typeof localStorage === 'undefined') return 'sistema';
  try {
    const guardada = localStorage.getItem(CHAVE_DA_APARENCIA);
    return ehValida(guardada) ? guardada : 'sistema';
  } catch {
    // Janela anônima ou armazenamento bloqueado: o padrão resolve.
    return 'sistema';
  }
}

/**
 * Aplica a escolha à página. Guardar é opcional para que a mesma função sirva
 * ao carregamento (só aplicar) e ao toque na tela (aplicar e lembrar).
 */
export function aplicarAparencia(aparencia: Aparencia, guardar = true): void {
  if (typeof document === 'undefined') return;

  const raiz = document.documentElement;
  if (aparencia === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', aparencia);

  // A barra do navegador acompanha — sem isto, o topo do celular continua
  // amarelo-claro com a tela escura, e a emenda aparece.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      'content',
      corDaBarra(aparencia === 'sistema' ? (sistemaEstaEscuro() ? 'escuro' : 'claro') : aparencia),
    );
  }

  if (!guardar) return;
  try {
    localStorage.setItem(CHAVE_DA_APARENCIA, aparencia);
  } catch {
    // Não poder lembrar não impede de aplicar agora.
  }
}

export function sistemaEstaEscuro(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Qual tema está valendo de fato, resolvendo "sistema". */
export function temaEmVigor(aparencia: Aparencia): 'claro' | 'escuro' {
  return aparencia === 'sistema' ? (sistemaEstaEscuro() ? 'escuro' : 'claro') : aparencia;
}

function corDaBarra(tema: 'claro' | 'escuro'): string {
  return tema === 'escuro' ? '#0F1720' : '#F2B532';
}

/**
 * Avisa quando o SISTEMA muda de tema, para quem está em "sistema" acompanhar
 * sem recarregar a página. Devolve a função que cancela a inscrição.
 */
export function observarTemaDoSistema(aoMudar: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;

  const consulta = window.matchMedia('(prefers-color-scheme: dark)');
  consulta.addEventListener('change', aoMudar);
  return () => consulta.removeEventListener('change', aoMudar);
}
