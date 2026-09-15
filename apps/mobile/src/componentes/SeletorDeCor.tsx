/**
 * Seletor de cor com paleta de verdade — arrastar o dedo, não caçar hexadecimal.
 *
 * O QUE ESTAVA ERRADO. A escolha era seis amostras prontas mais um campo de
 * texto pedindo "#RRGGBB". Quem quer o vermelho da própria marca não tem esse
 * número na cabeça: ele está no cartão de visita, não na memória. Na prática a
 * personalização acabava em "escolha uma das seis" — e seis lojas com a mesma
 * cor não é personalização.
 *
 * COMO ELE É DESENHADO. Um quadrado de saturação e brilho, mais uma faixa de
 * matiz embaixo. É o seletor que todo mundo já conhece de aplicativo de foto, e
 * a razão de ser esses dois controles e não três campos numéricos é que a
 * pessoa está procurando uma cor que ela reconhece quando vê — não um valor que
 * ela sabe dizer.
 *
 * POR QUE EM SVG, e não com uma biblioteca de gradiente. `react-native-svg` já
 * é dependência deste aplicativo (o QR Code do Pix usa). Uma dependência a mais
 * para desenhar dois retângulos com degradê pesaria no pacote que roda no 4G do
 * lojista, e o SVG funciona igual no navegador e no aparelho.
 *
 * AS CONTAS FICAM EM REFS, não no estado. O gesto lê e escreve a cor DENTRO do
 * mesmo movimento do dedo; o estado do React só chega no render seguinte, e o
 * ponteiro escorregaria atrás do dedo. É a mesma lição do recorte de imagem.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Circle } from 'react-native-svg';
import tema from '@decola/theme';
import { CampoTexto } from '@/componentes/CampoTexto';

/* ============================================================== conversões */

export function corValida(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && /^#[0-9a-fA-F]{6}$/.test(valor.trim());
}

type Hsv = { h: number; s: number; v: number };

function hsvParaHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  const dois = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${dois(r)}${dois(g)}${dois(b)}`.toUpperCase();
}

function hexParaHsv(hex: string): Hsv {
  const limpo = hex.replace('#', '');
  const r = parseInt(limpo.slice(0, 2), 16) / 255;
  const g = parseInt(limpo.slice(2, 4), 16) / 255;
  const b = parseInt(limpo.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/** Só a matiz, em degradê — o fundo da faixa de baixo. */
const MATIZES = [0, 60, 120, 180, 240, 300, 360].map((h) => ({
  deslocamento: `${(h / 360) * 100}%`,
  cor: hsvParaHex({ h: h % 360, s: 1, v: 1 }),
}));

/* ================================================================== a peça */

type Props = {
  rotulo: string;
  /** A cor atual, ou `null` quando o lojista não escolheu nada. */
  valor: string | null;
  aoMudar: (cor: string | null) => void;
  /** O que vale quando `valor` é nulo — mostrado como ponto de partida. */
  padrao: string;
  bloqueado?: boolean;
  /** Uma frase curta sobre o que esta cor pinta. */
  dica?: string;
};

const ALTURA_DA_AREA = 150;
const ALTURA_DA_FAIXA = 28;

export function SeletorDeCor({ rotulo, valor, aoMudar, padrao, bloqueado = false, dica }: Props) {
  const efetiva = corValida(valor) ? valor.toUpperCase() : padrao.toUpperCase();

  /**
   * A matiz vive aqui, e não é recalculada da cor a cada toque.
   *
   * Preto e branco não TÊM matiz — `hexParaHsv('#000000')` devolve 0, que é
   * vermelho. Sem guardar a matiz escolhida, arrastar até o canto escuro do
   * quadrado jogaria o ponteiro da faixa para o vermelho, e subir de novo
   * traria uma cor diferente da que a pessoa estava ajustando.
   */
  const inicial = useMemo(() => hexParaHsv(efetiva), []);
  const [matiz, setMatiz] = useState(inicial.h);
  const matizRef = useRef(inicial.h);

  const hsv = useMemo(() => {
    const atual = hexParaHsv(efetiva);
    return { h: atual.s === 0 ? matiz : atual.h, s: atual.s, v: atual.v };
  }, [efetiva, matiz]);

  /** Largura medida — o gesto precisa dela para virar fração. */
  const [largura, setLargura] = useState(0);
  const larguraRef = useRef(0);
  const medir = useCallback((l: number) => {
    larguraRef.current = l;
    setLargura(l);
  }, []);

  /**
   * ONDE cada controle está na tela, medido.
   *
   * O gesto usa `pageX/pageY` e desconta esta origem, em vez de usar o
   * `locationX` do evento. Motivo: o alvo do toque é o `<svg>` que desenha o
   * degradê, não a `View` que escuta — e `locationX` vem relativo ao alvo, ou
   * não vem. Foi exatamente isso que fez a primeira versão não registrar
   * arrasto nenhum no navegador.
   */
  const areaRef = useRef<View>(null);
  const faixaRef = useRef<View>(null);
  const origemDaArea = useRef({ x: 0, y: 0 });
  const origemDaFaixa = useRef({ x: 0, y: 0 });

  const medirOrigens = useCallback(() => {
    areaRef.current?.measureInWindow((x, y) => {
      origemDaArea.current = { x, y };
    });
    faixaRef.current?.measureInWindow((x, y) => {
      origemDaFaixa.current = { x, y };
    });
  }, []);

  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  const aplicar = useCallback(
    (proximo: Hsv) => {
      matizRef.current = proximo.h;
      setMatiz(proximo.h);
      aoMudar(hsvParaHex(proximo));
    },
    [aoMudar],
  );

  /** O quadrado: horizontal é saturação, vertical é brilho (de cima para baixo). */
  const naArea = useCallback(
    (paginaX: number, paginaY: number) => {
      const l = larguraRef.current || 1;
      const x = paginaX - origemDaArea.current.x;
      const y = paginaY - origemDaArea.current.y;
      const s = Math.max(0, Math.min(1, x / l));
      const v = Math.max(0, Math.min(1, 1 - y / ALTURA_DA_AREA));
      aplicar({ h: matizRef.current, s, v });
    },
    [aplicar],
  );

  const naFaixa = useCallback(
    (paginaX: number) => {
      const l = larguraRef.current || 1;
      const x = paginaX - origemDaFaixa.current.x;
      const h = Math.max(0, Math.min(359.9, (x / l) * 360));
      const atual = hsvRef.current;
      // Arrastar a matiz de um cinza não deveria manter o cinza: quem mexe ali
      // está procurando cor. Saturação e brilho ganham um mínimo.
      aplicar({ h, s: atual.s === 0 ? 1 : atual.s, v: atual.v === 0 ? 1 : atual.v });
    },
    [aplicar],
  );

  const gestoDaArea = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !bloqueado,
        onMoveShouldSetPanResponder: () => !bloqueado,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          medirOrigens();
          naArea(e.nativeEvent.pageX, e.nativeEvent.pageY);
        },
        onPanResponderMove: (e) => naArea(e.nativeEvent.pageX, e.nativeEvent.pageY),
      }),
    [naArea, bloqueado, medirOrigens],
  );

  const gestoDaFaixa = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !bloqueado,
        onMoveShouldSetPanResponder: () => !bloqueado,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          medirOrigens();
          naFaixa(e.nativeEvent.pageX);
        },
        onPanResponderMove: (e) => naFaixa(e.nativeEvent.pageX),
      }),
    [naFaixa, bloqueado, medirOrigens],
  );

  // No navegador, o arrasto tem de ser NOSSO — senão a página rola junto.
  const semGestoDoNavegador =
    Platform.OS === 'web' ? ({ touchAction: 'none' } as unknown as ViewStyle) : null;

  const pontoX = hsv.s * largura;
  const pontoY = (1 - hsv.v) * ALTURA_DA_AREA;
  const matizX = (hsv.h / 360) * largura;
  const corDaMatiz = hsvParaHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <View style={estilos.bloco}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        <View style={[estilos.amostra, { backgroundColor: efetiva }]} />
      </View>

      <View
        ref={areaRef}
        style={[estilos.area, semGestoDoNavegador]}
        onLayout={(e) => {
          medir(e.nativeEvent.layout.width);
          medirOrigens();
        }}
        {...gestoDaArea.panHandlers}
      >
        {largura > 0 ? (
          <Svg width="100%" height={ALTURA_DA_AREA} pointerEvents="none">
            <Defs>
              <LinearGradient id="sat" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor="#FFFFFF" />
                <Stop offset="100%" stopColor={corDaMatiz} />
              </LinearGradient>
              <LinearGradient id="brilho" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#000000" stopOpacity="0" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={largura} height={ALTURA_DA_AREA} fill="url(#sat)" />
            <Rect x="0" y="0" width={largura} height={ALTURA_DA_AREA} fill="url(#brilho)" />

            {/* O ponteiro tem dois anéis: um branco e um preto. Um anel só
                desaparece justamente na metade do quadrado onde ele tem a
                mesma cor do fundo. */}
            <Circle cx={pontoX} cy={pontoY} r="10" fill="none" stroke="#000000" strokeWidth="3" opacity="0.35" />
            <Circle cx={pontoX} cy={pontoY} r="10" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
          </Svg>
        ) : null}
      </View>

      <View
        ref={faixaRef}
        style={[estilos.faixa, semGestoDoNavegador]}
        onLayout={medirOrigens}
        {...gestoDaFaixa.panHandlers}
      >
        {largura > 0 ? (
          <Svg width="100%" height={ALTURA_DA_FAIXA} pointerEvents="none">
            <Defs>
              <LinearGradient id="matiz" x1="0" y1="0" x2="1" y2="0">
                {MATIZES.map((m) => (
                  <Stop key={m.deslocamento} offset={m.deslocamento} stopColor={m.cor} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect
              x="0"
              y="0"
              width={largura}
              height={ALTURA_DA_FAIXA}
              rx={ALTURA_DA_FAIXA / 2}
              fill="url(#matiz)"
            />
            <Circle
              cx={Math.max(9, Math.min(largura - 9, matizX))}
              cy={ALTURA_DA_FAIXA / 2}
              r="9"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3"
            />
          </Svg>
        ) : null}
      </View>

      {/* O hexadecimal continua editável: quem TEM o código da marca na mão
          digita e acabou, sem caçar o tom exato no quadrado. */}
      <CampoTexto
        rotulo="Código da cor"
        valor={valor ?? ''}
        aoMudar={(v) => {
          const texto = v.trim();
          if (texto === '') {
            aoMudar(null);
            return;
          }
          const com = texto.startsWith('#') ? texto : `#${texto}`;
          aoMudar(com.toUpperCase());
        }}
        bloqueado={bloqueado}
        placeholder={padrao}
      />

      {valor && !corValida(valor) ? (
        <Text style={estilos.erro}>Use o formato #RRGGBB — por exemplo, {padrao}.</Text>
      ) : null}

      {dica ? <Text style={estilos.dica}>{dica}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: tema.espacamento.sm, marginBottom: tema.espacamento.md },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tema.espacamento.sm,
  },
  rotulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  amostra: {
    width: 34,
    height: 34,
    borderRadius: tema.raio.md,
    borderWidth: 1,
    borderColor: tema.cores.borda,
  },
  area: {
    height: ALTURA_DA_AREA,
    borderRadius: tema.raio.md,
    overflow: 'hidden',
    backgroundColor: tema.cores.fundoCampo,
  },
  faixa: {
    height: ALTURA_DA_FAIXA,
    borderRadius: ALTURA_DA_FAIXA / 2,
    overflow: 'hidden',
    backgroundColor: tema.cores.fundoCampo,
  },
  erro: { ...tema.tipografia.legenda, color: tema.cores.erro },
  dica: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, lineHeight: 18 },
});
