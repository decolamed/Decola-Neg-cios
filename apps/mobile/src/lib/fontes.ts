/**
 * Fontes da marca (Seção 2.2) — Glacial Indifference nos títulos, Montserrat
 * no corpo.
 *
 * COMO ATIVAR (três passos, nenhuma outra alteração de código):
 *
 *   1. Copie os arquivos para `apps/mobile/assets/fonts/`, com exatamente
 *      estes nomes:
 *
 *        GlacialIndifference-Regular.ttf
 *        GlacialIndifference-Bold.ttf
 *        Montserrat-Regular.ttf
 *        Montserrat-SemiBold.ttf
 *
 *   2. Descomente as quatro linhas de `MAPA_DE_FONTES` abaixo.
 *   3. Em `packages/theme/src/index.ts`, mude
 *      `FONTES_PERSONALIZADAS_DISPONIVEIS` para `true`.
 *
 * O carregamento em si já está pronto: `app/_layout.tsx` só monta a navegação
 * depois que as fontes declaradas aqui terminam de carregar, então nenhuma
 * tela aparece com a fonte do sistema e depois "salta" para a da marca.
 *
 * O passo 2 existe porque o empacotador resolve `require` de asset em tempo de
 * build: apontar para um arquivo que ainda não está no repositório quebraria o
 * build do app — e não é algo que se possa proteger com try/catch.
 */
import tema from '@decola/theme';

export const MAPA_DE_FONTES: Record<string, number> = {
  // [tema.fontes.titulo]: require('../../assets/fonts/GlacialIndifference-Regular.ttf'),
  // [tema.fontes.tituloBold]: require('../../assets/fonts/GlacialIndifference-Bold.ttf'),
  // [tema.fontes.corpo]: require('../../assets/fonts/Montserrat-Regular.ttf'),
  // [tema.fontes.corpoSemibold]: require('../../assets/fonts/Montserrat-SemiBold.ttf'),
};

/** Nomes que o tema espera encontrar registrados — usado no aviso de sanidade. */
export const FAMILIAS_ESPERADAS = [
  tema.fontes.titulo,
  tema.fontes.tituloBold,
  tema.fontes.corpo,
  tema.fontes.corpoSemibold,
] as const;

/**
 * `true` quando há fontes declaradas para carregar. Com o mapa vazio o app
 * segue direto, usando a fonte do sistema nos mesmos pesos e tamanhos.
 */
export const TEM_FONTES_PARA_CARREGAR = Object.keys(MAPA_DE_FONTES).length > 0;

/**
 * Avisa em desenvolvimento quando os dois interruptores saíram de sincronia —
 * o sintoma silencioso seria um texto sem fonte nenhuma.
 */
export function conferirConsistenciaDasFontes(): void {
  if (!__DEV__) return;

  if (tema.FONTES_PERSONALIZADAS_DISPONIVEIS && !TEM_FONTES_PARA_CARREGAR) {
    console.warn(
      '[fontes] O tema está pedindo as fontes da marca, mas MAPA_DE_FONTES está vazio. ' +
        'Descomente as linhas em src/lib/fontes.ts (passo 2) ou volte ' +
        'FONTES_PERSONALIZADAS_DISPONIVEIS para false.',
    );
  }

  if (!tema.FONTES_PERSONALIZADAS_DISPONIVEIS && TEM_FONTES_PARA_CARREGAR) {
    console.warn(
      '[fontes] As fontes da marca estão carregadas, mas o tema ainda usa a fonte do sistema. ' +
        'Mude FONTES_PERSONALIZADAS_DISPONIVEIS para true em packages/theme (passo 3).',
    );
  }
}
