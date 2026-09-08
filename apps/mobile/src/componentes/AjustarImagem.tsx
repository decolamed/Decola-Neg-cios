/**
 * Ajuste de imagem — o recorte que a pessoa escolhe, em vez do que sobrou.
 *
 * O QUE ESTAVA ERRADO. O banner era recortado sozinho: o sistema pegava o maior
 * retângulo 16:7 que cabia na foto e a única escolha oferecida era "parte de
 * cima / meio / parte de baixo". Numa foto em pé, isso descarta metade da
 * imagem sem a pessoa ver o que ficou — e o resultado só aparece na loja
 * publicada. Chamar aquilo de aleatório é justo: do ponto de vista de quem
 * escolheu a foto, era.
 *
 * O QUE MUDA. A foto aparece inteira, com a moldura do formato final por cima.
 * Arrastar move; os botões de zoom aproximam e afastam. O que estiver dentro da
 * moldura é exatamente o que vai ser gravado — nada de surpresa depois.
 *
 * COMO O RECORTE É CALCULADO. A tela trabalha em pixels de tela; o corte
 * acontece em pixels da imagem original. A conversão mora em `@/lib/recorte`,
 * fora daqui justamente para poder ser testada sozinha — um erro ali produz
 * imagem cortada errada em silêncio, semanas depois, na loja publicada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { recorteEmPixels, type AreaDeRecorte } from '@/lib/recorte';

type Props = {
  uri: string;
  larguraOriginal: number;
  alturaOriginal: number;
  /** Proporção do resultado: 16/7 para banner, 1 para logo e produto. */
  proporcao: number;
  titulo: string;
  aoConfirmar: (area: AreaDeRecorte) => void;
  aoCancelar: () => void;
  ocupado?: boolean;
};

export function AjustarImagem({
  uri,
  larguraOriginal,
  alturaOriginal,
  proporcao,
  titulo,
  aoConfirmar,
  aoCancelar,
  ocupado = false,
}: Props) {
  const { width: larguraTela } = useWindowDimensions();

  // A moldura ocupa a largura útil da tela, com teto para não virar uma faixa
  // gigante no computador.
  const larguraMoldura = Math.min(larguraTela - tema.espacamento.lg * 2, 460);
  const alturaMoldura = larguraMoldura / proporcao;

  /** Menor escala que ainda cobre a moldura inteira — o ponto de partida. */
  const escalaMinima = useMemo(
    () => Math.max(larguraMoldura / larguraOriginal, alturaMoldura / alturaOriginal),
    [larguraMoldura, alturaMoldura, larguraOriginal, alturaOriginal],
  );

  /**
   * Começar no MEIO da foto, e não no canto superior esquerdo.
   *
   * Com deslocamento zero a moldura cai sobre o canto da imagem — numa foto em
   * pé, a primeira coisa que a pessoa vê é o teto. O meio é onde o assunto
   * costuma estar, e é de onde ela normalmente vai só ajustar um pouco.
   */
  const centralizar = useCallback(
    (escalaAtual: number) => ({
      x: (larguraMoldura - larguraOriginal * escalaAtual) / 2,
      y: (alturaMoldura - alturaOriginal * escalaAtual) / 2,
    }),
    [larguraMoldura, alturaMoldura, larguraOriginal, alturaOriginal],
  );

  const [escala, setEscala] = useState(escalaMinima);
  const [deslocamento, setDeslocamento] = useState(() => centralizar(escalaMinima));

  const inicio = useRef({ x: 0, y: 0 });
  const atual = useRef(centralizar(escalaMinima));

  // Girar o aparelho muda a largura da moldura, e com ela a escala mínima: o
  // enquadramento anterior deixaria buraco. Recomeçar do meio é o único estado
  // que continua válido em qualquer tamanho de tela.
  useEffect(() => {
    const inicial = centralizar(escalaMinima);
    atual.current = inicial;
    setEscala(escalaMinima);
    setDeslocamento(inicial);
  }, [escalaMinima, centralizar]);

  /**
   * A imagem nunca pode deixar buraco na moldura: o deslocamento é preso entre
   * "canto alinhado" e "canto oposto alinhado".
   */
  const limitar = useCallback(
    (x: number, y: number, escalaAtual: number) => {
      const larguraVisivel = larguraOriginal * escalaAtual;
      const alturaVisivel = alturaOriginal * escalaAtual;
      const minimoX = larguraMoldura - larguraVisivel;
      const minimoY = alturaMoldura - alturaVisivel;
      return {
        x: Math.min(0, Math.max(minimoX, x)),
        y: Math.min(0, Math.max(minimoY, y)),
      };
    },
    [larguraOriginal, alturaOriginal, larguraMoldura, alturaMoldura],
  );

  const arrastar = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          inicio.current = { ...atual.current };
        },
        onPanResponderMove: (_evento, gesto) => {
          const proximo = limitar(
            inicio.current.x + gesto.dx,
            inicio.current.y + gesto.dy,
            escala,
          );
          atual.current = proximo;
          setDeslocamento(proximo);
        },
      }),
    [escala, limitar],
  );

  const mudarZoom = useCallback(
    (fator: number) => {
      const proxima = Math.max(escalaMinima, Math.min(escala * fator, escalaMinima * 5));

      // Aproxima em direção ao CENTRO da moldura, e não ao canto: é o que a
      // pessoa está olhando quando toca no "+".
      const centroX = (larguraMoldura / 2 - atual.current.x) / escala;
      const centroY = (alturaMoldura / 2 - atual.current.y) / escala;
      const bruto = {
        x: larguraMoldura / 2 - centroX * proxima,
        y: alturaMoldura / 2 - centroY * proxima,
      };

      const preso = limitar(bruto.x, bruto.y, proxima);
      atual.current = preso;
      setEscala(proxima);
      setDeslocamento(preso);
    },
    [escala, escalaMinima, larguraMoldura, alturaMoldura, limitar],
  );

  const confirmar = useCallback(() => {
    aoConfirmar(
      recorteEmPixels({
        larguraOriginal,
        alturaOriginal,
        larguraMoldura,
        alturaMoldura,
        escala,
        deslocamentoX: deslocamento.x,
        deslocamentoY: deslocamento.y,
      }),
    );
  }, [
    aoConfirmar,
    larguraOriginal,
    alturaOriginal,
    larguraMoldura,
    alturaMoldura,
    escala,
    deslocamento,
  ]);

  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.dica}>
        Arraste a foto para escolher o que aparece. Use + e − para aproximar.
      </Text>

      {/* A moldura no meio da tela, e não colada no texto: é ela que a pessoa
          está olhando, e o polegar precisa de espaço em volta para arrastar. */}
      <View style={estilos.palco}>
        <View
          style={[estilos.moldura, { width: larguraMoldura, height: alturaMoldura }]}
          {...arrastar.panHandlers}
        >
          <Image
            source={{ uri }}
            style={{
              position: 'absolute',
              left: deslocamento.x,
              top: deslocamento.y,
              width: larguraOriginal * escala,
              height: alturaOriginal * escala,
            }}
            resizeMode="cover"
          />
        </View>

        <View style={estilos.zoom}>
          <Botao
            titulo="−"
            variante="contorno"
            aoPressionar={() => mudarZoom(1 / 1.25)}
            desabilitado={escala <= escalaMinima + 0.001}
            estilo={estilos.botaoZoom}
          />
          <Botao
            titulo="+"
            variante="contorno"
            aoPressionar={() => mudarZoom(1.25)}
            desabilitado={escala >= escalaMinima * 5 - 0.001}
            estilo={estilos.botaoZoom}
          />
        </View>

        <Text style={estilos.rodape}>
          Só o que está dentro da moldura vai para a loja.
        </Text>
      </View>

      <View style={estilos.acoes}>
        <Botao titulo="Usar esta imagem" aoPressionar={confirmar} carregando={ocupado} />
        <Botao
          titulo="Escolher outra"
          variante="texto"
          aoPressionar={aoCancelar}
          desabilitado={ocupado}
        />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    padding: tema.espacamento.lg,
    gap: tema.espacamento.sm,
    backgroundColor: tema.cores.fundo,
    alignItems: 'center',
  },
  titulo: { ...tema.tipografia.h2, color: tema.cores.texto, alignSelf: 'flex-start' },
  dica: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    alignSelf: 'flex-start',
    marginBottom: tema.espacamento.sm,
  },
  palco: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tema.espacamento.md,
  },
  moldura: {
    overflow: 'hidden',
    borderRadius: tema.raio.md,
    borderWidth: 2,
    borderColor: tema.cores.acaoPrimaria,
    backgroundColor: tema.cores.bordaSuave,
  },
  zoom: { flexDirection: 'row', gap: tema.espacamento.md },
  botaoZoom: { width: 72 },
  rodape: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    textAlign: 'center',
  },
  acoes: {
    alignSelf: 'stretch',
    gap: tema.espacamento.xs,
  },
});
