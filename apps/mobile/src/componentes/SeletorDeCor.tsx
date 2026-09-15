/**
 * Escolha de cor: um botão, e a paleta só quando ela for pedida.
 *
 * O QUE ESTAVA ERRADO — e o relato foi exato. A paleta ficava aberta na tela de
 * Aparência, solta entre os outros campos. Rolar a página com o dedo passando
 * por cima dela MUDAVA A COR: o gesto de rolar e o gesto de escolher são o
 * mesmo movimento, e quem ganha é quem está embaixo do dedo. Pior: como o
 * salvamento é um só, no fim da tela, a pessoa descobria a cor trocada sem
 * saber qual era a anterior para desfazer.
 *
 * Não dava para resolver só "melhorando" o gesto. Um controle contínuo de
 * arrastar não pode dividir espaço com uma página que rola — a ambiguidade é da
 * situação, não da implementação. Ele foi para trás de um botão:
 *
 *   ESCOLHER COR → abre a paleta → ajusta → CONFIRMAR ou CANCELAR.
 *
 * Cancelar devolve a cor exatamente como estava, que é a saída que faltava.
 * Enquanto a paleta está aberta, ela é a única coisa na tela: não há o que
 * rolar, e o dedo só pode estar escolhendo cor.
 *
 * A CONFIRMAÇÃO NÃO SALVA NADA no servidor — continua sendo o "Salvar" da tela
 * que grava, como em todos os outros campos. O que ela faz é fechar a decisão:
 * a partir dali a cor só muda se a pessoa abrir a paleta de novo.
 *
 * O DESENHO DA PALETA: um quadrado de saturação e brilho mais uma faixa de
 * matiz, em `react-native-svg` (já é dependência, o QR do Pix usa). É o seletor
 * que todo mundo conhece de aplicativo de foto — a pessoa procura uma cor que
 * reconhece quando vê, não um valor que sabe dizer.
 *
 * AS CONTAS FICAM EM REFS, não no estado: o gesto lê e escreve a cor dentro do
 * mesmo movimento do dedo, e o estado do React só chega no render seguinte.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Circle } from 'react-native-svg';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
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

const ALTURA_DA_AREA = 170;
const ALTURA_DA_FAIXA = 30;

/**
 * A paleta em si. Só existe dentro da janela — fora dela, ninguém arrasta nada
 * por acidente.
 */
function PaletaDeCor({
  valor,
  aoMudar,
}: {
  valor: string;
  aoMudar: (cor: string) => void;
}) {
  /**
   * A matiz vive aqui, e não é recalculada da cor a cada toque.
   *
   * Preto e branco não TÊM matiz — `hexParaHsv('#000000')` devolve 0, que é
   * vermelho. Sem guardar a matiz escolhida, arrastar até o canto escuro do
   * quadrado jogaria o ponteiro da faixa para o vermelho, e subir de novo
   * traria uma cor diferente da que a pessoa estava ajustando.
   */
  const inicial = useMemo(() => hexParaHsv(valor), []);
  const [matiz, setMatiz] = useState(inicial.h);
  const matizRef = useRef(inicial.h);

  const hsv = useMemo(() => {
    const atual = hexParaHsv(valor);
    return { h: atual.s === 0 ? matiz : atual.h, s: atual.s, v: atual.v };
  }, [valor, matiz]);

  const [largura, setLargura] = useState(0);
  const larguraRef = useRef(0);
  const medir = useCallback((l: number) => {
    larguraRef.current = l;
    setLargura(l);
  }, []);

  /**
   * ONDE cada controle está na tela, medido.
   *
   * O gesto usa `pageX/pageY` e desconta esta origem, em vez do `locationX` do
   * evento. Motivo: o alvo do toque é o `<svg>` que desenha o degradê, não a
   * `View` que escuta — e `locationX` vem relativo ao alvo, ou não vem. Foi
   * isso que fez a primeira versão não registrar arrasto nenhum no navegador.
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
      aplicar({
        h: matizRef.current,
        s: Math.max(0, Math.min(1, x / l)),
        v: Math.max(0, Math.min(1, 1 - y / ALTURA_DA_AREA)),
      });
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
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          medirOrigens();
          naArea(e.nativeEvent.pageX, e.nativeEvent.pageY);
        },
        onPanResponderMove: (e) => naArea(e.nativeEvent.pageX, e.nativeEvent.pageY),
      }),
    [naArea, medirOrigens],
  );

  const gestoDaFaixa = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          medirOrigens();
          naFaixa(e.nativeEvent.pageX);
        },
        onPanResponderMove: (e) => naFaixa(e.nativeEvent.pageX),
      }),
    [naFaixa, medirOrigens],
  );

  // No navegador, o arrasto tem de ser NOSSO — senão a página rola junto.
  const semGestoDoNavegador =
    Platform.OS === 'web' ? ({ touchAction: 'none' } as unknown as ViewStyle) : null;

  const pontoX = hsv.s * largura;
  const pontoY = (1 - hsv.v) * ALTURA_DA_AREA;
  const matizX = (hsv.h / 360) * largura;
  const corDaMatiz = hsvParaHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <View style={estilos.paleta}>
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

            {/* Dois anéis, um preto e um branco: um anel só desaparece
                justamente na metade do quadrado onde ele tem a cor do fundo. */}
            <Circle cx={pontoX} cy={pontoY} r="11" fill="none" stroke="#000000" strokeWidth="3" opacity="0.35" />
            <Circle cx={pontoX} cy={pontoY} r="11" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
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
              cx={Math.max(10, Math.min(largura - 10, matizX))}
              cy={ALTURA_DA_FAIXA / 2}
              r="10"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3"
            />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/* =========================================================== o seletor === */

type Props = {
  rotulo: string;
  /** A cor atual, ou `null` quando o lojista não escolheu nada. */
  valor: string | null;
  aoMudar: (cor: string | null) => void;
  /** O que vale quando `valor` é nulo. */
  padrao: string;
  bloqueado?: boolean;
  /** Uma frase curta sobre o que esta cor pinta. */
  dica?: string;
};

export function SeletorDeCor({ rotulo, valor, aoMudar, padrao, bloqueado = false, dica }: Props) {
  const efetiva = corValida(valor) ? valor.toUpperCase() : padrao.toUpperCase();

  const [aberta, setAberta] = useState(false);
  /**
   * A cor EM EDIÇÃO, separada da cor da tela.
   *
   * É isto que faz "Cancelar" existir de verdade: enquanto a janela está
   * aberta, o formulário não sabe de nada. Sem o rascunho, cancelar exigiria
   * lembrar o valor antigo em algum lugar — e é exatamente esse "lembrar" que
   * faltava quando a paleta mexia na cor sozinha.
   */
  const [rascunho, setRascunho] = useState(efetiva);
  const [digitado, setDigitado] = useState(efetiva);

  const abrir = useCallback(() => {
    setRascunho(efetiva);
    setDigitado(efetiva);
    setAberta(true);
  }, [efetiva]);

  const confirmar = useCallback(() => {
    aoMudar(rascunho);
    setAberta(false);
  }, [aoMudar, rascunho]);

  /** Sair sem mexer em nada. */
  const cancelar = useCallback(() => setAberta(false), []);

  const mudarNaPaleta = useCallback((cor: string) => {
    setRascunho(cor);
    setDigitado(cor);
  }, []);

  return (
    <View style={estilos.bloco}>
      <View style={estilos.linha}>
        <View style={[estilos.amostra, { backgroundColor: efetiva }]} />
        <View style={estilos.linhaTexto}>
          <Text style={estilos.rotulo}>{rotulo}</Text>
          <Text style={estilos.codigo}>
            {corValida(valor) ? efetiva : `${padrao} (padrão)`}
          </Text>
        </View>
        <Botao
          titulo="Escolher"
          variante="contorno"
          aoPressionar={abrir}
          desabilitado={bloqueado}
          estilo={estilos.botaoEscolher}
        />
      </View>

      {dica ? <Text style={estilos.dica}>{dica}</Text> : null}

      <Modal
        visible={aberta}
        transparent
        animationType="fade"
        // O botão de voltar do Android fecha sem aplicar, como o Cancelar.
        onRequestClose={cancelar}
      >
        <View style={estilos.fundoDaJanela}>
          <View style={estilos.janela}>
            <Text style={estilos.tituloDaJanela}>{rotulo}</Text>

            {/* A cor em edição, grande: é o que a pessoa está decidindo. */}
            <View style={[estilos.previa, { backgroundColor: rascunho }]} />

            <PaletaDeCor valor={rascunho} aoMudar={mudarNaPaleta} />

            <CampoTexto
              rotulo="Código da cor"
              valor={digitado}
              aoMudar={(v) => {
                const texto = v.trim();
                const com = texto.startsWith('#') || texto === '' ? texto : `#${texto}`;
                setDigitado(com.toUpperCase());
                // Só vale quando estiver completo: a cada letra digitada o
                // valor passa por estados inválidos, e mexer na prévia neles
                // faria a cor piscar.
                if (corValida(com)) setRascunho(com.toUpperCase());
              }}
              placeholder={padrao}
            />

            <View style={estilos.acoes}>
              <Botao titulo="Usar esta cor" aoPressionar={confirmar} />
              <Botao titulo="Cancelar" variante="texto" aoPressionar={cancelar} />
              {/* A saída de quem mexeu sem querer e não lembra a cor de antes.
                  Só aparece quando há uma escolha para desfazer. */}
              {corValida(valor) ? (
                <Botao
                  titulo="Voltar ao padrão"
                  variante="texto"
                  aoPressionar={() => {
                    aoMudar(null);
                    setAberta(false);
                  }}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { marginBottom: tema.espacamento.md },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    padding: tema.espacamento.md,
  },
  linhaTexto: { flex: 1, minWidth: 0 },
  rotulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  codigo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  amostra: {
    width: 40,
    height: 40,
    borderRadius: tema.raio.md,
    borderWidth: 1,
    borderColor: tema.cores.borda,
  },
  botaoEscolher: { width: 116 },
  dica: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    lineHeight: 18,
    marginTop: tema.espacamento.xs,
  },

  fundoDaJanela: {
    flex: 1,
    backgroundColor: 'rgba(11, 42, 68, 0.55)',
    justifyContent: 'center',
    padding: tema.espacamento.lg,
  },
  janela: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    gap: tema.espacamento.sm,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  tituloDaJanela: { ...tema.tipografia.h2, color: tema.cores.texto },
  previa: {
    height: 44,
    borderRadius: tema.raio.md,
    borderWidth: 1,
    borderColor: tema.cores.borda,
  },
  paleta: { gap: tema.espacamento.sm },
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
  acoes: { marginTop: tema.espacamento.xs },
});
