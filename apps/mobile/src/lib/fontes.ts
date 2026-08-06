/**
 * Fontes da marca (Seção 2.2).
 *
 * Os arquivos vêm do pacote `@expo-google-fonts/montserrat`, que os traz como
 * assets versionados em `node_modules`. Não há `.ttf` solto no repositório,
 * nem download em tempo de execução: o empacotador resolve os `require` do
 * pacote como qualquer outro asset e embarca as variações no bundle.
 *
 * Três pesos, que é o que a hierarquia da Seção 2.2 usa:
 *   400 Regular   — corpo de texto e legendas
 *   600 SemiBold  — títulos de seção, botões, valores em destaque
 *   700 Bold      — títulos de tela e números grandes
 *
 * Sobre a Glacial Indifference: ver a decisão registrada em
 * `packages/theme/src/index.ts`, junto da constante `fontes`.
 */
// Importado por subcaminho, um peso por vez, e NÃO do índice do pacote: o
// índice reexporta as 18 variações da família, e o empacotador embarca todo
// asset que ele alcança — seriam ~6 MB de fontes no bundle para usar três.
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import tema from '@decola/theme';

/**
 * As chaves são exatamente os nomes que o tema referencia em
 * `tipografia.*.fontFamily` — é assim que o React Native encontra o arquivo.
 *
 * Montado a partir de pares em vez de um literal porque `titulo` e
 * `corpoSemibold` apontam para o mesmo peso (600): como literal, seriam duas
 * propriedades com o mesmo nome. Assim as quatro referências do tema ficam
 * declaradas, e uma mudança futura em só uma delas não passa despercebida.
 */
export const MAPA_DE_FONTES: Record<string, number> = Object.fromEntries([
  [tema.fontes.corpo, Montserrat_400Regular],
  [tema.fontes.corpoSemibold, Montserrat_600SemiBold],
  [tema.fontes.titulo, Montserrat_600SemiBold],
  [tema.fontes.tituloBold, Montserrat_700Bold],
]);

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
 * Avisa em desenvolvimento quando os interruptores saíram de sincronia — o
 * sintoma silencioso seria um texto sem fonte nenhuma.
 */
export function conferirConsistenciaDasFontes(): void {
  if (!__DEV__) return;

  if (tema.FONTES_PERSONALIZADAS_DISPONIVEIS && !TEM_FONTES_PARA_CARREGAR) {
    console.warn(
      '[fontes] O tema está pedindo as fontes da marca, mas MAPA_DE_FONTES está vazio. ' +
        'Volte FONTES_PERSONALIZADAS_DISPONIVEIS para false em packages/theme, ' +
        'ou declare as fontes aqui.',
    );
  }

  if (!tema.FONTES_PERSONALIZADAS_DISPONIVEIS && TEM_FONTES_PARA_CARREGAR) {
    console.warn(
      '[fontes] As fontes da marca estão carregadas, mas o tema ainda usa a fonte do sistema. ' +
        'Mude FONTES_PERSONALIZADAS_DISPONIVEIS para true em packages/theme.',
    );
  }

  const faltando = FAMILIAS_ESPERADAS.filter((nome) => !(nome in MAPA_DE_FONTES));
  if (faltando.length > 0) {
    console.warn(
      `[fontes] Famílias referenciadas pelo tema e não registradas: ${faltando.join(', ')}`,
    );
  }
}
