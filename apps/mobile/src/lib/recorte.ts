/**
 * A conta do recorte — separada da tela porque erro aqui é silencioso.
 *
 * A tela de ajuste trabalha em pixels de TELA: a foto aparece reduzida, a
 * pessoa arrasta, aproxima. O recorte, porém, acontece em pixels da IMAGEM
 * ORIGINAL — é o que o manipulador de imagem entende. A conversão entre os
 * dois mundos é esta função.
 *
 * Ela vive fora do componente por um motivo prático: componente com
 * `react-native` dentro não roda em teste de linha de comando, e um erro de
 * um pixel aqui não aparece na tela — aparece na loja publicada, semanas
 * depois, como uma foto cortada errada que ninguém sabe explicar.
 */

export type AreaDeRecorte = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/**
 * Converte o que está sob a moldura em coordenadas da imagem original.
 *
 * `escala` é quantos pixels de tela cada pixel da imagem ocupa; `deslocamento`
 * é o canto superior esquerdo da imagem em relação ao da moldura (negativo
 * quando a imagem está puxada para fora, que é o caso normal).
 *
 * O limite no fim não é zelo excessivo: pedir ao manipulador um recorte que
 * começa em -3 ou passa da borda faz a operação falhar inteira, e o lojista vê
 * "não foi possível" sem entender o motivo.
 */
export function recorteEmPixels(params: {
  larguraOriginal: number;
  alturaOriginal: number;
  larguraMoldura: number;
  alturaMoldura: number;
  escala: number;
  deslocamentoX: number;
  deslocamentoY: number;
}): AreaDeRecorte {
  const {
    larguraOriginal,
    alturaOriginal,
    larguraMoldura,
    alturaMoldura,
    escala,
    deslocamentoX,
    deslocamentoY,
  } = params;

  const largura = Math.round(larguraMoldura / escala);
  const altura = Math.round(alturaMoldura / escala);

  const x = Math.round(-deslocamentoX / escala);
  const y = Math.round(-deslocamentoY / escala);

  const limitar = (valor: number, maximo: number) => Math.max(0, Math.min(valor, maximo));

  const larguraFinal = Math.min(largura, larguraOriginal);
  const alturaFinal = Math.min(altura, alturaOriginal);

  return {
    originX: limitar(x, larguraOriginal - larguraFinal),
    originY: limitar(y, alturaOriginal - alturaFinal),
    width: larguraFinal,
    height: alturaFinal,
  };
}

/**
 * Recorte centralizado na proporção pedida — o palpite de quem não escolheu.
 *
 * Só é usado quando não há escolha do lojista para respeitar (uma foto que
 * chegou por outro caminho, um valor antigo). Enquanto a pessoa estiver
 * olhando para a tela de ajuste, quem manda é ela.
 */
export function recorteCentralizado(
  larguraOriginal: number,
  alturaOriginal: number,
  proporcao: number,
): AreaDeRecorte {
  const proporcaoDaFoto = larguraOriginal / alturaOriginal;

  if (proporcaoDaFoto > proporcao) {
    const largura = Math.round(alturaOriginal * proporcao);
    return {
      originX: Math.round((larguraOriginal - largura) / 2),
      originY: 0,
      width: largura,
      height: alturaOriginal,
    };
  }

  const altura = Math.round(larguraOriginal / proporcao);
  return {
    originX: 0,
    originY: Math.round((alturaOriginal - altura) / 2),
    width: larguraOriginal,
    height: altura,
  };
}
