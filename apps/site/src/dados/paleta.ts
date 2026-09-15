/**
 * As três cores do lojista viram a paleta inteira da vitrine.
 *
 * O LOJISTA ESCOLHE TRÊS: fundo, destaque e texto. A vitrine precisa de uma
 * dúzia — superfície dos cartões, texto secundário, linhas divisórias, o
 * ladrilho atrás da foto do produto, a cor do nome sobre a barra. Derivar as
 * outras daqui, em vez de pedir doze ao lojista, é o que faz a loja continuar
 * parecendo desenhada depois de mexerem nela.
 *
 * O CONTRASTE NÃO É ESCOLHA DELE. Ele escolhe cores; a legibilidade é conta
 * nossa. Duas coisas podem dar errado e as duas são tratadas aqui:
 *
 *   texto sobre o cartão .... alguém escolhe cinza-claro num fundo branco e a
 *                             loja fica ilegível. Se a razão de contraste cair
 *                             abaixo do mínimo, a cor do texto é trocada pela
 *                             automática (preto ou branco, pelo fundo).
 *
 *   nome sobre a barra ...... o nome da loja fica sobre a cor de DESTAQUE, não
 *                             sobre o fundo. Texto azul-escuro sobre destaque
 *                             azul-escuro some. Mesma regra, contra a outra cor.
 *
 * Isto não é uma preferência estética: é o que impede a personalização de
 * produzir uma loja que o cliente do lojista não consegue ler — e ele não tem
 * como saber, porque na tela dele já está tudo memorizado.
 *
 * A RAZÃO MÍNIMA É 4.5, o critério AA da W3C para texto normal.
 */

/** O desenho aprovado, quando o lojista não escolheu nada. */
export const CORES_PADRAO = {
  destaque: '#01395E',
  fundo: '#EEF3F9',
  texto: '#10283F',
} as const;

const CONTRASTE_MINIMO = 4.5;

type RGB = { r: number; g: number; b: number };

function paraRgb(hex: string): RGB {
  const limpo = hex.replace('#', '');
  const cheio =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo;
  return {
    r: parseInt(cheio.slice(0, 2), 16),
    g: parseInt(cheio.slice(2, 4), 16),
    b: parseInt(cheio.slice(4, 6), 16),
  };
}

function paraHex({ r, g, b }: RGB): string {
  const dois = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${dois(r)}${dois(g)}${dois(b)}`;
}

/** É uma cor `#RRGGBB` (ou `#RGB`) de verdade? */
export function corValida(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(valor.trim());
}

/** Luminância relativa da recomendação da W3C — a base do contraste. */
function luminancia(hex: string): number {
  const { r, g, b } = paraRgb(hex);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste entre duas cores: 1 (iguais) a 21 (preto e branco). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

/** Preto ou branco — o que se lê melhor sobre esta cor. */
export function textoAutomatico(fundo: string): string {
  return contraste('#FFFFFF', fundo) >= contraste('#14110F', fundo) ? '#FFFFFF' : '#14110F';
}

/** `quanto` = 0 devolve `a`; 1 devolve `b`. */
function misturar(a: string, b: string, quanto: number): string {
  const x = paraRgb(a);
  const y = paraRgb(b);
  return paraHex({
    r: x.r + (y.r - x.r) * quanto,
    g: x.g + (y.g - x.g) * quanto,
    b: x.b + (y.b - x.b) * quanto,
  });
}

export type CoresEscolhidas = {
  destaque?: string | null;
  fundo?: string | null;
  texto?: string | null;
};

export type PaletaDaLoja = {
  destaque: string;
  sobreDestaque: string;
  fundo: string;
  superficie: string;
  ladrilho: string;
  tinta: string;
  suave: string;
  linha: string;
  /** A cor do nome da loja na barra — já conferida contra o destaque. */
  sobreBarra: string;
};

/**
 * Monta a paleta inteira a partir do que o lojista escolheu.
 *
 * A SUPERFÍCIE (o branco dos cartões) é DERIVADA do fundo, e não fixa. Num
 * fundo escuro, cartões brancos viram lanternas; a superfície sobe um degrau a
 * partir do fundo, na direção que o fundo pede — clareia quando o fundo é
 * escuro, embranquece quando é claro. É o que mantém a hierarquia "cartão
 * acima do fundo" em qualquer cor.
 */
export function paletaDaLoja(escolhidas: CoresEscolhidas): PaletaDaLoja {
  const destaque = corValida(escolhidas.destaque) ? escolhidas.destaque : CORES_PADRAO.destaque;
  const fundo = corValida(escolhidas.fundo) ? escolhidas.fundo : CORES_PADRAO.fundo;
  const textoPedido = corValida(escolhidas.texto) ? escolhidas.texto : CORES_PADRAO.texto;

  const fundoEscuro = luminancia(fundo) < 0.2;
  const superficie = fundoEscuro ? misturar(fundo, '#FFFFFF', 0.1) : misturar(fundo, '#FFFFFF', 0.75);

  // O texto pedido só vale se der para ler sobre o cartão.
  const tinta =
    contraste(textoPedido, superficie) >= CONTRASTE_MINIMO
      ? textoPedido
      : textoAutomatico(superficie);

  // O nome da loja vive sobre o DESTAQUE, que é outra cor: a conferência é
  // separada, e por isso existem duas respostas diferentes para "que cor tem o
  // texto" nesta loja.
  const sobreBarra =
    contraste(tinta, destaque) >= CONTRASTE_MINIMO ? tinta : textoAutomatico(destaque);

  return {
    destaque,
    sobreDestaque: textoAutomatico(destaque),
    fundo,
    superficie,
    ladrilho: misturar(superficie, fundo, 0.65),
    tinta,
    // Texto secundário: a meio caminho do fundo, ainda legível.
    suave: misturar(tinta, superficie, 0.45),
    linha: misturar(tinta, superficie, 0.86),
    sobreBarra,
  };
}
