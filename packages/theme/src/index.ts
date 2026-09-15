/**
 * Decola Negócios — Design Tokens
 * Especificação: Seções 2.1 (Paleta), 2.2 (Tipografia), 2.3 (Estados)
 *
 * ESTE É O ÚNICO LUGAR onde valores visuais são definidos. Nenhum hex, tamanho
 * de fonte ou espaçamento deve aparecer hardcoded em componente ou tela —
 * o refino visual posterior (design tool) precisa ser aplicável só aqui.
 *
 * Compartilhado entre o app cliente (apps/mobile) e o Painel Administrativo
 * (apps/admin) para que a marca não divirja entre os dois.
 *
 * Refino visual (esta passada): os valores foram calibrados contra os mockups
 * de referência da marca — CTA em amarelo com texto azul-marinho, cards mais
 * arredondados e com sombra mais suave, ladrilhos de ícone coloridos e
 * hierarquia tipográfica mais alta. Nenhuma estrutura ou papel semântico foi
 * removido: só os valores mudaram.
 */

import { TEMA_CLARO, variavel, type PapelDeCor } from './temas';

/**
 * Estamos no navegador? Decidido uma vez, no carregamento do módulo.
 *
 * Não usa `Platform.OS` de propósito: este pacote é importado também pelo site
 * e pelo painel, que não têm React Native. `document` é o teste que funciona
 * nos três.
 */
const ehWeb = typeof document !== 'undefined';

// =============================================================================
// Seção 2.1 — Paleta de cores
// =============================================================================

/**
 * Uma cor que o navegador resolve, em vez de um valor fixo.
 *
 * No SITE devolve `var(--dn-<papel>)`: o `StyleSheet` congela o NOME da
 * variável, e quem lhe dá valor é o CSS — então trocar de tema é trocar um
 * atributo no `<html>`, sem reescrever os estilos de 65 telas.
 *
 * NO APARELHO devolve o valor do tema claro. React Native não tem CSS, e uma
 * string "var(...)" chegaria à ponte nativa como cor inválida. O tema escuro é,
 * hoje, um recurso do site; no app nativo a tela continua clara. Está dito aqui
 * porque é a diferença de comportamento que alguém vai notar primeiro.
 */
function dinamica(papel: PapelDeCor): string {
  return ehWeb ? `var(${variavel(papel)})` : TEMA_CLARO[papel];
}

/** Fração → porcentagem com no máximo duas casas, para o CSS. */
function pct(fracao: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fracao)) * 10000) / 100}%`;
}

/** Cores da marca, exatamente como especificadas. Não use estas diretamente
 *  em telas: prefira os papéis semânticos em `cores` abaixo. */
export const paleta = {
  azulMarinho: '#01395E',
  azulClaro: '#58B7E6',
  vermelho: '#D63C3C',
  amarelo: '#F2B532',
  cinzaClaro: '#F5F6F7',
  laranja: '#F47A20',

  branco: '#FFFFFF',
  preto: '#000000',
} as const;

/**
 * Papéis semânticos. As telas referenciam SEMPRE estes nomes — assim, trocar
 * a cor de "ação destrutiva" é uma edição de uma linha, não uma caçada.
 */
export const cores = {
  /** Headers, textos de destaque, navegação. */
  primaria: dinamica('primaria'),
  /** Azul-marinho mais profundo — fundo de painéis e faixas de destaque. */
  primariaEscura: dinamica('primariaEscura'),
  /**
   * O azul da marca quando ele é PREENCHIMENTO, e não leitura: caixa marcada,
   * segmento selecionado, cartão de destaque — tudo que leva `textoInverso` por
   * cima. Existe porque no tema escuro os dois papéis querem valores opostos
   * (ver a nota em `temas.ts`). No tema claro é o mesmo azul-marinho.
   */
  primariaFundo: dinamica('primariaFundo'),
  /** Destaques, gráficos, ícones. */
  secundaria: paleta.azulClaro,
  /** Cor de destaque/CTA (splash). */
  destaque: paleta.amarelo,
  /** Ícones e elementos secundários. */
  apoio: paleta.laranja,

  /**
   * Botões primários de largura total: amarelo da marca com texto
   * azul-marinho, como na referência visual. O vermelho segue reservado para
   * ações destrutivas e indicadores negativos.
   */
  acaoPrimaria: paleta.amarelo,
  /** Texto/ícone sobre `acaoPrimaria`. */
  textoSobreAcao: paleta.azulMarinho,
  destrutiva: paleta.vermelho,

  /** Indicadores de estado. */
  erro: paleta.vermelho,
  alerta: paleta.amarelo,
  /** Saídas do financeiro e estoque baixo (Seção 2.1). */
  negativo: paleta.vermelho,
  /** Entradas do financeiro. */
  positivo: paleta.azulClaro,
  neutro: paleta.amarelo,

  /** Fundo de telas e de cards. */
  fundo: dinamica('fundo'),
  fundoCard: dinamica('fundoCard'),
  superficie: dinamica('superficie'),
  /** Fundo de campos de formulário e trilhas de segmento. */
  fundoCampo: dinamica('fundoCampo'),

  texto: dinamica('texto'),
  textoSuave: dinamica('textoSuave'),
  /**
   * Texto sobre `primariaFundo` e sobre a sobreposição da câmera do leitor de
   * código. Branco nos DOIS temas de propósito: a câmera é escura sempre, e
   * `primariaFundo` já é escolhido para receber branco por cima.
   */
  textoInverso: paleta.branco,
  /** Texto sobre fundo tonal amarelo (avisos de atenção). */
  textoAlerta: dinamica('textoAlerta'),

  borda: dinamica('borda'),
  bordaSuave: dinamica('bordaSuave'),
  bordaErro: paleta.vermelho,
} as const;

/**
 * Fundos tonais — a mesma cor da marca a 12% sobre o fundo. Usados nos
 * ladrilhos de ícone, badges preenchidos e faixas de aviso, para que nenhum
 * tom pastel novo precise ser inventado numa tela.
 *
 * "Sobre o fundo", e não "sobre branco": no tema escuro a diluição é contra a
 * cor do cartão, senão cada ladrilho vira uma mancha clara. Ver `baseTonal` em
 * `temas.ts`.
 */
export const tons = {
  primaria: dinamica('tomPrimaria'),
  secundaria: dinamica('tomSecundaria'),
  destaque: dinamica('tomDestaque'),
  apoio: dinamica('tomApoio'),
  negativo: dinamica('tomNegativo'),
} as const;

/**
 * Cores de ladrilho de ícone, na ordem em que devem ser distribuídas em
 * grades de atalho e listas (Acesso rápido, Onboarding, menu Mais).
 */
export const acentos = [
  paleta.laranja,
  paleta.azulClaro,
  paleta.azulMarinho,
  paleta.amarelo,
  paleta.vermelho,
] as const;

// =============================================================================
// Seção 2.2 — Tipografia
// =============================================================================

/**
 * Nomes das famílias como o React Native as registra — um arquivo por peso.
 * Vêm de `@expo-google-fonts/montserrat`, que traz os arquivos junto: não há
 * `.ttf` solto no repositório nem download em tempo de execução.
 *
 * DECISÃO (Seção 2.2): a especificação pede Glacial Indifference nos títulos,
 * mas ela não é livre nem está no Google Fonts, e nunca chegou como arquivo.
 * A prévia visual aprovada no Claude Design renderiza TUDO em Montserrat —
 * títulos inclusive —, então adotar Montserrat nos dois papéis reproduz
 * exatamente o que foi validado, em vez de aproximar com uma terceira fonte.
 * Para voltar à Glacial Indifference no futuro basta trocar `titulo` e
 * `tituloBold` aqui e registrar os arquivos em `src/lib/fontes.ts`.
 */
export const fontes = {
  /** Títulos e logo. */
  titulo: 'Montserrat_600SemiBold',
  tituloBold: 'Montserrat_700Bold',
  /** Corpo de texto e interface. */
  corpo: 'Montserrat_400Regular',
  corpoSemibold: 'Montserrat_600SemiBold',
} as const;

/**
 * Família para CSS. Na web a fonte é uma só e o peso numérico escolhe o
 * arquivo — diferente do React Native, que precisa de um nome por peso.
 * O painel a carrega de `@fontsource/montserrat`, empacotada junto com o
 * bundle: sem requisição a CDN, funciona offline e não vaza visita a
 * terceiros.
 */
export const familiaWeb = 'Montserrat';

/**
 * As fontes da marca estão disponíveis: os pacotes acima trazem os arquivos.
 * Continua sendo o interruptor único — vire para `false` e os dois apps caem
 * na fonte do sistema, mantendo pesos e tamanhos.
 */
export const FONTES_PERSONALIZADAS_DISPONIVEIS = true;

const familia = (nome: string) => (FONTES_PERSONALIZADAS_DISPONIVEIS ? nome : undefined);

/** Hierarquia da tabela da Seção 2.2, um item por linha da especificação. */
export const tipografia = {
  /** Títulos de tela e saudação. */
  h1: {
    fontFamily: familia(fontes.tituloBold),
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  h2: {
    fontFamily: familia(fontes.titulo),
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  /** Valor monetário grande (card de destaque, saldo do financeiro). */
  numero: {
    fontFamily: familia(fontes.tituloBold),
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  corpo: { fontFamily: familia(fontes.corpo), fontSize: 14, fontWeight: '400', lineHeight: 20 },
  /** Valores monetários e nomes de produto. */
  corpoDestacado: {
    fontFamily: familia(fontes.corpoSemibold),
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  /** Textos auxiliares e timestamps. */
  legenda: { fontFamily: familia(fontes.corpo), fontSize: 12, fontWeight: '400', lineHeight: 16 },
  /** Rótulo de campo, aba e barra de navegação. */
  rotulo: {
    fontFamily: familia(fontes.corpoSemibold),
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  botao: {
    fontFamily: familia(fontes.corpoSemibold),
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  /** Menor escala: contador de badge, rótulo da barra de navegação, iniciais. */
  micro: {
    fontFamily: familia(fontes.corpoSemibold),
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
} as const;

// =============================================================================
// Espaçamento, raio e elevação
// Escala de 4pt. Não especificada no documento — definida aqui para evitar
// números mágicos nas telas e concentrar o ajuste posterior em um só lugar.
// =============================================================================

export const espacamento = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 32,
  xxl: 48,
} as const;

export const raio = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const elevacao = {
  card: {
    shadowColor: '#0B2A44',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  /** Elementos flutuantes: botão + do menu, painéis sobrepostos. */
  flutuante: {
    shadowColor: '#0B2A44',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

/** Altura padrão de botões e campos — mantém formulários alinhados. */
export const alturas = {
  controle: 52,
  botao: 52,
  ladrilho: 44,
} as const;

// =============================================================================
// Seção 2.3 — Estados visuais dos componentes interativos
// Aplicados uniformemente a botões, campos e cards clicáveis, SEM exceção por
// tela (a especificação é explícita quanto a isso).
// =============================================================================

export const estados = {
  /** Pressed/Ativo: escurecimento de ~10% da cor de fundo. */
  pressedEscurecimento: 0.1,
  /** Disabled: opacidade ~40% e sem resposta a toque. */
  disabledOpacidade: 0.4,
  /** Erro: borda vermelha no campo, com mensagem abaixo no mesmo tom. */
  larguraBordaErro: 1.5,
} as const;

/**
 * Escurece uma cor hex pela fração informada — usada no estado Pressed.
 * Mantida aqui junto dos tokens para que o comportamento de feedback tátil
 * acompanhe a paleta se ela mudar.
 */
export function escurecer(hex: string, fracao: number = estados.pressedEscurecimento): string {
  // No navegador quem mistura é o navegador — ver a nota em `clarear`. Aqui a
  // mistura é com preto nos dois temas: escurecer é o estado "pressionado", e
  // ele deve escurecer mesmo no tema escuro.
  if (ehWeb) return `color-mix(in srgb, ${hex} ${pct(1 - fracao)}, black)`;

  const limpo = hex.replace('#', '');
  const completo =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo;

  const fator = 1 - fracao;
  const canal = (inicio: number) => {
    const valor = Math.round(parseInt(completo.slice(inicio, inicio + 2), 16) * fator);
    return Math.max(0, Math.min(255, valor)).toString(16).padStart(2, '0');
  };

  return `#${canal(0)}${canal(2)}${canal(4)}`;
}

/**
 * Mistura uma cor da paleta com branco — para fundos tonais derivados de uma
 * cor recebida em runtime (ex.: badge que já traz a cor do status).
 */
export function clarear(hex: string, fracao = 0.88): string {
  /**
   * NO NAVEGADOR, QUEM MISTURA É O NAVEGADOR — e não com branco.
   *
   * Dois motivos para não fazer a conta aqui:
   *
   *   1. A cor pode não ser um hex. As cores do tema são `var(--dn-*)` na web,
   *      e `parseInt('var(--dn-texto)')` dá `NaN` — a cor sairia `#NaNNaNNaN`,
   *      um ladrilho preto, sem erro nenhum no caminho.
   *
   *   2. Misturar com BRANCO só está certo no tema claro. No escuro, um pastel
   *      claro vira uma mancha sobre a tela escura. `--dn-baseTonal` é branco no
   *      claro e a cor do cartão no escuro, então "a cor a 12%" continua
   *      querendo dizer a mesma coisa nos dois — diluída no fundo, não no
   *      branco.
   *
   * `color-mix` resolve DEPOIS da variável, então acompanha a troca de tema; a
   * conta feita aqui nunca acompanharia.
   */
  if (ehWeb) {
    return `color-mix(in srgb, ${hex} ${pct(1 - fracao)}, var(${variavel('baseTonal')}))`;
  }

  const limpo = hex.replace('#', '');
  const canal = (inicio: number) => {
    const base = parseInt(limpo.slice(inicio, inicio + 2), 16);
    const valor = Math.round(base + (255 - base) * fracao);
    return Math.max(0, Math.min(255, valor)).toString(16).padStart(2, '0');
  };
  return `#${canal(0)}${canal(2)}${canal(4)}`;
}

export const tema = {
  paleta,
  cores,
  tons,
  acentos,
  fontes,
  familiaWeb,
  FONTES_PERSONALIZADAS_DISPONIVEIS,
  tipografia,
  espacamento,
  raio,
  elevacao,
  alturas,
  estados,
  escurecer,
  clarear,
} as const;

export type Tema = typeof tema;
export default tema;

// Tema claro/escuro. Ver as notas em `temas.ts` (por que são variáveis CSS) e
// em `aparencia.ts` (como a escolha é aplicada e lembrada).
export {
  CSS_DAS_CORES,
  TEMA_CLARO,
  TEMA_ESCURO,
  variavel,
  type PapelDeCor,
} from './temas';
export {
  aparenciaGuardada,
  aplicarAparencia,
  CHAVE_DA_APARENCIA,
  instalarCoresDoTema,
  observarTemaDoSistema,
  sistemaEstaEscuro,
  temaEmVigor,
  type Aparencia,
} from './aparencia';

/**
 * A paleta da vitrine, derivada das três cores do lojista.
 *
 * Fica exportada daqui para o site e o aplicativo lerem a MESMA conta — a
 * vitrine pinta, a prévia promete, e as duas têm de dizer a mesma coisa.
 */
export {
  CORES_PADRAO,
  contraste,
  corValida as corDeLojaValida,
  paletaDaLoja,
  textoAutomatico,
  type CoresEscolhidas,
  type PaletaDaLoja,
} from './paletaDaLoja';
