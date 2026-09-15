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
 * Arrastar move em qualquer direção; a pinça de dois dedos dá zoom, e no
 * computador a rodinha do mouse faz o mesmo. Os botões + e − continuam ali como
 * reserva — para quem está num computador sem rodinha, e para quem prefere um
 * passo de cada vez. O que estiver dentro da moldura é exatamente o que vai ser
 * gravado — nada de surpresa depois.
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
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { recorteEmPixels, type AreaDeRecorte } from '@/lib/recorte';

/** Quantas vezes a foto pode ser aproximada além do mínimo que cobre a moldura. */
const ZOOM_MAXIMO = 5;

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

  /**
   * A escala também num ref, além do estado.
   *
   * O gesto de pinça lê e escreve a escala DENTRO do mesmo movimento do dedo, e
   * o estado do React só chega no render seguinte. Ler o estado ali daria o
   * valor de um quadro atrás, e a imagem "escorregaria" atrás dos dedos.
   */
  const escalaRef = useRef(escalaMinima);

  /** Onde a moldura está na tela — necessário para achar o meio dos dedos. */
  const molduraNaTela = useRef({ x: 0, y: 0 });
  const molduraRef = useRef<View>(null);

  /**
   * A escala mínima e a função que prende a imagem, em refs.
   *
   * O ouvinte da rodinha do mouse é registrado UMA vez no nó do DOM — se ele
   * fosse recriado a cada mudança de escala, cada giro trocaria o ouvinte no
   * meio do gesto. Um ouvinte fixo que lê refs continua sempre com o valor de
   * agora, sem depender de quando foi criado.
   */
  const escalaMinimaRef = useRef(escalaMinima);
  const limitarRef = useRef<(x: number, y: number, escalaAtual: number) => { x: number; y: number }>(
    () => ({ x: 0, y: 0 }),
  );

  /**
   * O estado de uma pinça em andamento: a distância entre os dedos quando ela
   * começou, a escala daquele instante, e o ponto DA IMAGEM que estava sob o
   * meio dos dedos. É esse ponto que fica parado enquanto os dedos abrem e
   * fecham — é o que faz a pinça parecer que está agarrando a foto.
   */
  const pinca = useRef<{
    distancia: number;
    escala: number;
    imagemX: number;
    imagemY: number;
    focoX: number;
    focoY: number;
  } | null>(null);

  const medirMoldura = useCallback(() => {
    molduraRef.current?.measureInWindow((x, y) => {
      molduraNaTela.current = { x, y };
    });
  }, []);

  /**
   * NO NAVEGADOR, O GESTO PRECISA SER PEDIDO — não basta escutá-lo.
   *
   * Este aplicativo roda como site. Ali, dois dedos sobre a página significam
   * "aumentar a página inteira" e um dedo arrastando significa "rolar" — o
   * navegador decide isso ANTES de qualquer código nosso ver o toque, e a partir
   * daí para de mandar os eventos. Era isso que sobrava para quem enquadrava uma
   * foto: dava para empurrar a imagem de lado (o pouco que o navegador não
   * reivindica), a pinça aumentava a página em vez da foto, e o zoom só
   * acontecia mesmo pelos botões + e −.
   *
   * `touch-action: none` é como se diz ao navegador "esta parte da tela é minha".
   * É uma propriedade de CSS: não existe no aparelho, e lá esta linha não faz
   * nada — o `PanResponder` nativo já recebe tudo.
   */
  const semGestoDoNavegador =
    Platform.OS === 'web' ? ({ touchAction: 'none' } as unknown as ViewStyle) : null;

  /**
   * A rodinha do mouse aproxima e afasta, no computador.
   *
   * Pinça não existe com mouse, e o desenho pedia zoom "natural" — no
   * computador, natural é a rodinha. Ela é registrada à mão no elemento porque
   * `onWheel` não é um evento do React Native: só chega até aqui indo direto ao
   * nó do DOM, que no navegador é o que o `ref` guarda.
   *
   * `passive: false` é o que permite o `preventDefault`. Sem ele a rodinha
   * aproximaria a foto E rolaria a página junto.
   */
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const no = molduraRef.current as unknown as HTMLElement | null;
    if (!no || typeof no.addEventListener !== 'function') return;

    const aoRodar = (evento: WheelEvent) => {
      evento.preventDefault();
      medirMoldura();

      // Um "clique" de rodinha costuma ser 100; o expoente deixa o passo suave e
      // simétrico — aproximar e afastar o mesmo tanto volta ao mesmo lugar.
      const fator = Math.exp(-evento.deltaY / 320);
      const proxima = Math.max(
        escalaMinimaRef.current,
        Math.min(escalaRef.current * fator, escalaMinimaRef.current * ZOOM_MAXIMO),
      );
      if (proxima === escalaRef.current) return;

      // Aproxima em direção ao PONTEIRO, como qualquer mapa: o que está sob o
      // cursor fica onde está.
      const caixa = no.getBoundingClientRect();
      const focoX = evento.clientX - caixa.left;
      const focoY = evento.clientY - caixa.top;
      const imagemX = (focoX - atual.current.x) / escalaRef.current;
      const imagemY = (focoY - atual.current.y) / escalaRef.current;

      const preso = limitarRef.current(
        focoX - imagemX * proxima,
        focoY - imagemY * proxima,
        proxima,
      );

      atual.current = preso;
      escalaRef.current = proxima;
      setEscala(proxima);
      setDeslocamento(preso);
    };

    no.addEventListener('wheel', aoRodar, { passive: false });
    return () => no.removeEventListener('wheel', aoRodar);
  }, [medirMoldura]);

  // Girar o aparelho muda a largura da moldura, e com ela a escala mínima: o
  // enquadramento anterior deixaria buraco. Recomeçar do meio é o único estado
  // que continua válido em qualquer tamanho de tela.
  useEffect(() => {
    const inicial = centralizar(escalaMinima);
    atual.current = inicial;
    escalaRef.current = escalaMinima;
    escalaMinimaRef.current = escalaMinima;
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

  // O ouvinte da rodinha é fixo e lê daqui; sem esta linha ele continuaria
  // prendendo a imagem com as medidas de antes de girar o aparelho.
  limitarRef.current = limitar;

  const escalaMaxima = escalaMinima * ZOOM_MAXIMO;

  /**
   * Um dedo arrasta; dois dedos aproximam. O mesmo gesto, sem botão nenhum.
   *
   * A pinça é o jeito como as pessoas já mexem em foto em qualquer aparelho —
   * os botões + e − continuam ali para quem está no computador, com mouse, onde
   * pinça não existe.
   *
   * O PONTO DIFÍCIL É A TROCA DE NÚMERO DE DEDOS no meio do movimento. O
   * `PanResponder` concede o gesto UMA vez, e o `gesto.dx` continua somando
   * desde aquele instante; quem põe o segundo dedo e depois o tira levaria a
   * imagem para longe de um salto, porque o `dx` acumulado durante a pinça
   * seria aplicado de uma vez como arrasto. Por isso, ao voltar para um dedo, a
   * referência do arrasto é recalculada a partir do `dx` atual — e não do valor
   * de quando o gesto começou.
   */
  const arrastar = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Ninguém tira este gesto da mão no meio do caminho: um ScrollView por
        // fora roubaria o arrasto vertical e a foto travaria.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          inicio.current = { ...atual.current };
          pinca.current = null;
          medirMoldura();
        },
        onPanResponderMove: (evento, gesto) => {
          const toques = evento.nativeEvent.touches;

          // ---------------------------------------------------- dois dedos
          if (toques.length >= 2) {
            const [a, b] = toques;
            const distancia = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (distancia < 1) return;

            // Meio dos dedos, em coordenadas da moldura.
            const focoX = (a.pageX + b.pageX) / 2 - molduraNaTela.current.x;
            const focoY = (a.pageY + b.pageY) / 2 - molduraNaTela.current.y;

            if (!pinca.current) {
              // Começou agora (ou o segundo dedo acabou de entrar): guarda o
              // ponto da IMAGEM que está sob o meio dos dedos.
              pinca.current = {
                distancia,
                escala: escalaRef.current,
                imagemX: (focoX - atual.current.x) / escalaRef.current,
                imagemY: (focoY - atual.current.y) / escalaRef.current,
                focoX,
                focoY,
              };
              return;
            }

            const proxima = Math.max(
              escalaMinima,
              Math.min(pinca.current.escala * (distancia / pinca.current.distancia), escalaMaxima),
            );

            // O ponto agarrado continua sob os dedos — inclusive se eles se
            // moverem juntos, o que faz a pinça arrastar e aproximar de uma vez.
            const preso = limitar(
              focoX - pinca.current.imagemX * proxima,
              focoY - pinca.current.imagemY * proxima,
              proxima,
            );

            atual.current = preso;
            escalaRef.current = proxima;
            setEscala(proxima);
            setDeslocamento(preso);
            return;
          }

          // ------------------------------------------------------- um dedo
          if (pinca.current) {
            // Saímos da pinça. Reancora o arrasto no ponto atual, descontando o
            // `dx` que se acumulou enquanto os dois dedos estavam na tela.
            inicio.current = { x: atual.current.x - gesto.dx, y: atual.current.y - gesto.dy };
            pinca.current = null;
          }

          const proximo = limitar(
            inicio.current.x + gesto.dx,
            inicio.current.y + gesto.dy,
            escalaRef.current,
          );
          atual.current = proximo;
          setDeslocamento(proximo);
        },
        onPanResponderRelease: () => {
          pinca.current = null;
        },
        onPanResponderTerminate: () => {
          pinca.current = null;
        },
      }),
    [limitar, escalaMinima, escalaMaxima, medirMoldura],
  );

  const mudarZoom = useCallback(
    (fator: number) => {
      const proxima = Math.max(escalaMinima, Math.min(escala * fator, escalaMaxima));

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
      escalaRef.current = proxima;
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
        Arraste a foto para escolher o que aparece. Junte ou afaste dois dedos para dar zoom — no
        computador, use a rodinha do mouse.
      </Text>

      {/* A moldura no meio da tela, e não colada no texto: é ela que a pessoa
          está olhando, e o polegar precisa de espaço em volta para arrastar. */}
      <View style={estilos.palco}>
        <View
          ref={molduraRef}
          onLayout={medirMoldura}
          style={[
            estilos.moldura,
            { width: larguraMoldura, height: alturaMoldura },
            semGestoDoNavegador,
          ]}
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
            desabilitado={escala >= escalaMaxima - 0.001}
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
