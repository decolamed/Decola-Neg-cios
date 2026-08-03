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
  /** Destaques, gráficos, ícones. */
  secundaria: paleta.azulClaro,
  /** Cor de destaque/CTA (splash). */
  destaque: paleta.amarelo,
  /** Ícones e elementos secundários. */
  apoio: paleta.laranja,

  /**
   * Botões primários de largura total (Seção 2.3) e ações destrutivas usam o
   * mesmo vermelho — é o que a especificação define para ambos.
   */
  acaoPrimaria: paleta.vermelho,
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

  texto: paleta.azulMarinho,
  textoSuave: '#5A6B78',
  textoInverso: paleta.branco,

  borda: '#E1E5E8',
  bordaErro: paleta.vermelho,
} as const;

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
 * Vire esta constante para `true` ao adicionar os arquivos: é a única
 * alteração necessária para a marca aparecer.
 */
export const FONTES_PERSONALIZADAS_DISPONIVEIS = false;

const familia = (nome: string) => (FONTES_PERSONALIZADAS_DISPONIVEIS ? nome : undefined);

/** Hierarquia da tabela da Seção 2.2, um item por linha da especificação. */
export const tipografia = {
  h1: { fontFamily: familia(fontes.tituloBold), fontSize: 24, fontWeight: '700' },
  h2: { fontFamily: familia(fontes.titulo), fontSize: 18, fontWeight: '600' },
  corpo: { fontFamily: familia(fontes.corpo), fontSize: 14, fontWeight: '400' },
  /** Valores monetários e nomes de produto. */
  corpoDestacado: { fontFamily: familia(fontes.corpoSemibold), fontSize: 14, fontWeight: '600' },
  /** Textos auxiliares e timestamps. */
  legenda: { fontFamily: familia(fontes.corpo), fontSize: 12, fontWeight: '400' },
  botao: { fontFamily: familia(fontes.corpoSemibold), fontSize: 14, fontWeight: '600' },
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
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const raio = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const elevacao = {
  card: {
    shadowColor: paleta.preto,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
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

export const tema = {
  paleta,
  cores,
  fontes,
  FONTES_PERSONALIZADAS_DISPONIVEIS,
  tipografia,
  espacamento,
  raio,
  elevacao,
  estados,
  escurecer,
} as const;

export type Tema = typeof tema;
export default tema;
