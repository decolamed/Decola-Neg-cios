/**
 * Tema claro e tema escuro — e por que isto não exigiu reescrever 65 telas.
 *
 * O PROBLEMA. As cores do produto são lidas no topo de cada arquivo, dentro de
 * `StyleSheet.create`, que roda uma vez quando o módulo é importado. O valor
 * fica congelado ali. Trocar de tema em tempo de execução exigiria transformar
 * cada um desses 65 blocos numa função chamada dentro do componente — uma
 * reescrita do app inteiro para um recurso de aparência.
 *
 * O CAMINHO. O produto é servido como site, e no navegador uma cor pode ser uma
 * VARIÁVEL: `var(--dn-fundo)`. O `StyleSheet` continua congelando o valor, só
 * que o valor congelado passa a ser o nome da variável — e quem resolve o nome
 * é o navegador, a cada pintura. Trocar o tema vira um atributo no `<html>`.
 *
 * Verificado antes de adotar, no Chromium: `var()` resolve em `fill` e `stroke`
 * de SVG (é como todos os ícones e gráficos daqui são desenhados) e acompanha a
 * troca ao vivo. Sem isso os ícones ficariam pretos e o caminho não serviria.
 *
 * NO APARELHO (app nativo) não existe CSS. Lá as cores continuam sendo os
 * valores do tema claro, e a troca não tem efeito — está documentado em
 * `cores`, e é a razão de os valores claros continuarem sendo a fonte da
 * verdade aqui embaixo em vez de viverem só no CSS.
 */

/** Os papéis cujo valor muda entre claro e escuro. */
export type PapelDeCor =
  | 'primaria'
  | 'primariaEscura'
  | 'primariaFundo'
  | 'fundo'
  | 'fundoCard'
  | 'superficie'
  | 'fundoCampo'
  | 'texto'
  | 'textoSuave'
  | 'textoAlerta'
  | 'borda'
  | 'bordaSuave'
  | 'tomPrimaria'
  | 'tomSecundaria'
  | 'tomDestaque'
  | 'tomApoio'
  | 'tomNegativo'
  | 'baseTonal';

export const TEMA_CLARO: Record<PapelDeCor, string> = {
  primaria: '#01395E',
  primariaEscura: '#012A46',
  primariaFundo: '#01395E',

  fundo: '#F5F6F7',
  fundoCard: '#FFFFFF',
  superficie: '#FFFFFF',
  fundoCampo: '#F7F8FA',

  texto: '#01395E',
  textoSuave: '#5A6B78',
  textoAlerta: '#8A6412',

  borda: '#E1E5E8',
  bordaSuave: '#EDF0F2',

  tomPrimaria: '#E6EBEF',
  tomSecundaria: '#E8F5FC',
  tomDestaque: '#FDF4E0',
  tomApoio: '#FEF0E4',
  tomNegativo: '#FBE9E9',

  baseTonal: '#FFFFFF',
};

/**
 * O escuro não é o claro invertido.
 *
 * DOIS PAPÉIS PARA O AZUL DA MARCA, e não um. `primaria` é lida como TEXTO e
 * ícone em 35 lugares e como FUNDO em 7, e no escuro os dois querem coisas
 * opostas: texto precisa ser claro para se ler sobre o fundo escuro; fundo
 * precisa ser escuro o bastante para o texto branco por cima se ler. Um valor
 * só serviria mal aos dois. `primariaFundo` existe para os preenchimentos
 * (caixa marcada, segmento selecionado, cartão de destaque) e deixa `primaria`
 * livre para ser a cor de leitura.
 *
 * `textoInverso` continua branco nos dois temas de propósito: ele também cobre
 * a sobreposição da câmera do leitor de código, que é escura sempre.
 *
 * As cores da marca (amarelo, azul-claro, laranja, vermelho) não mudam: elas
 * são a identidade, e todas se leem sobre o fundo escuro.
 */
export const TEMA_ESCURO: Record<PapelDeCor, string> = {
  primaria: '#6FB8E4',
  primariaEscura: '#0B1219',
  primariaFundo: '#1E5F8E',

  fundo: '#0F1720',
  fundoCard: '#16212C',
  superficie: '#16212C',
  fundoCampo: '#1D2934',

  texto: '#E8EEF3',
  textoSuave: '#9AAAB6',
  textoAlerta: '#F2C55C',

  borda: '#2A3743',
  bordaSuave: '#222E39',

  // Os fundos tonais: a mesma ideia do claro (a cor a 12%), só que misturada
  // com o fundo escuro em vez de com branco.
  tomPrimaria: '#1B2B38',
  tomSecundaria: '#14303F',
  tomDestaque: '#332A16',
  tomApoio: '#33241A',
  tomNegativo: '#33191C',

  /**
   * COM O QUE UMA COR DA MARCA É DILUÍDA para virar fundo de ladrilho.
   *
   * `clarear()` misturava sempre com BRANCO — é o que faz o ladrilho pastel do
   * tema claro. No escuro isso produzia manchas claras espalhadas sobre a tela
   * escura, e pior: incoerentes entre si, porque as cores fixas da marca
   * clareavam e as cores que viraram variável escureciam. Diluir contra o fundo
   * do cartão dá o mesmo efeito de "a cor a 12%" que o tema claro tem, só que
   * na direção certa.
   */
  baseTonal: '#16212C',
};

/** O nome da variável CSS de um papel. */
export function variavel(papel: PapelDeCor): string {
  return `--dn-${papel}`;
}

function bloco(valores: Record<PapelDeCor, string>): string {
  return (Object.keys(valores) as PapelDeCor[])
    .map((papel) => `${variavel(papel)}:${valores[papel]}`)
    .join(';');
}

/**
 * O CSS que dá valor às variáveis. Injetado uma vez na página.
 *
 * Três blocos, nesta ordem, e a ordem importa:
 *
 *   1. `:root` — o claro é o padrão.
 *   2. a consulta de mídia — sem escolha explícita, seguimos o sistema. O
 *      `:not([data-tema="claro"])` é o que permite alguém ficar no claro mesmo
 *      com o celular no escuro.
 *   3. `[data-tema="escuro"]` — a escolha explícita vence os dois anteriores.
 */
export const CSS_DAS_CORES = [
  `:root{${bloco(TEMA_CLARO)}}`,
  `@media (prefers-color-scheme: dark){:root:not([data-tema="claro"]){${bloco(TEMA_ESCURO)}}}`,
  `:root[data-tema="escuro"]{${bloco(TEMA_ESCURO)}}`,
].join('\n');
