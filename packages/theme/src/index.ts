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

// =============================================================================
// Seção 2.1 — Paleta de cores
// =============================================================================

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
  primaria: paleta.azulMarinho,
  /** Azul-marinho mais profundo — fundo de painéis e faixas de destaque. */
  primariaEscura: '#012A46',
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
  fundo: paleta.cinzaClaro,
  fundoCard: paleta.branco,
  superficie: paleta.branco,
  /** Fundo de campos de formulário e trilhas de segmento. */
  fundoCampo: '#F7F8FA',

  texto: paleta.azulMarinho,
  textoSuave: '#5A6B78',
  textoInverso: paleta.branco,
  /** Texto sobre fundo tonal amarelo (avisos de atenção). */
  textoAlerta: '#8A6412',

  borda: '#E1E5E8',
  bordaSuave: '#EDF0F2',
  bordaErro: paleta.vermelho,
} as const;

/**
 * Fundos tonais — a mesma cor da marca a 12% sobre branco. Usados nos
 * ladrilhos de ícone, badges preenchidos e faixas de aviso, para que nenhum
 * tom pastel novo precise ser inventado numa tela.
 */
export const tons = {
  primaria: '#E6EBEF',
  secundaria: '#E8F5FC',
  destaque: '#FDF4E0',
  apoio: '#FEF0E4',
  negativo: '#FBE9E9',
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

export const fontes = {
  /** Títulos e logo. */
  titulo: 'GlacialIndifference',
  tituloBold: 'GlacialIndifference-Bold',
  /** Corpo de texto e interface. */
  corpo: 'Montserrat-Regular',
  corpoSemibold: 'Montserrat-SemiBold',
} as const;

/**
 * As fontes da Seção 2.2 exigem os arquivos .ttf em
 * `apps/mobile/assets/fonts/`. Enquanto eles não estiverem no repositório, o
 * app usa a fonte do sistema — os pesos e tamanhos abaixo, que são o que a
 * especificação define, continuam valendo.
 *
 * Vire esta constante para `true` quando as fontes estiverem disponíveis. O
 * carregamento no app cliente já está implementado: ver as instruções em
 * `apps/mobile/src/lib/fontes.ts` (três passos, um deles é este). O painel
 * administrativo já usa Montserrat via web font e passa a usar a fonte de
 * título quando o @font-face em `apps/admin/src/estilos.css` for habilitado.
 */
export const FONTES_PERSONALIZADAS_DISPONIVEIS = false;

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
