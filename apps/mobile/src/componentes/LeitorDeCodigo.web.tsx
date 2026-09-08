/**
 * Leitor de código de barras — versão do NAVEGADOR.
 *
 * POR QUE UM ARQUIVO SÓ PARA A WEB. O leitor usava `CameraView` do
 * `expo-camera` com `onBarcodeScanned`. No celular funciona; no navegador o
 * `expo-camera` abre a câmera e NUNCA dispara a leitura — o `expo-camera` não
 * implementa detecção de código de barras na web. O aplicativo é usado pelo
 * navegador, instalado na tela inicial, então na prática o leitor não existia.
 *
 * DOIS CAMINHOS, NESTA ORDEM:
 *
 *   1. `BarcodeDetector`, que o Chrome no Android traz de fábrica. É o
 *      decodificador do próprio sistema: rápido, sem baixar nada e sem
 *      esquentar o aparelho. Cobre a maioria dos lojistas.
 *   2. ZXing, carregado sob demanda. Cobre iPhone e navegadores de mesa, que
 *      não têm o primeiro. Só é baixado quando o leitor abre — não pesa na
 *      abertura do aplicativo de quem nunca escaneia.
 *
 * Se os dois falharem, a tela DIZ isso e oferece digitar o código. O que não
 * pode acontecer é o que acontecia: a câmera abrindo e nada nunca sendo lido.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import type { PropsDoLeitor } from '@/componentes/LeitorDeCodigo';

export { FORMATOS } from '@/componentes/LeitorDeCodigo';

/** Formatos no vocabulário do `BarcodeDetector` e do ZXing. */
const FORMATOS_WEB = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'qr_code',
];

type Estado = 'iniciando' | 'lendo' | 'sem_camera' | 'sem_leitor';

export function LeitorDeCodigo({
  aoLer,
  aoCancelar,
  instrucao = 'Aponte a câmera para o código de barras do produto.',
  pausado = false,
}: PropsDoLeitor) {
  const video = useRef<HTMLVideoElement | null>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const parar = useRef<(() => void) | null>(null);
  const ultimo = useRef<{ codigo: string; quando: number } | null>(null);
  const pausadoRef = useRef(pausado);

  const [estado, setEstado] = useState<Estado>('iniciando');
  const [detalhe, setDetalhe] = useState<string | null>(null);

  useEffect(() => {
    pausadoRef.current = pausado;
  }, [pausado]);

  /**
   * A câmera dispara em rajada sobre o mesmo código. Sem este freio, uma
   * etiqueta parada na frente da lente vira dez leituras e dez itens.
   */
  const entregar = useCallback(
    (codigo: string) => {
      if (pausadoRef.current) return;
      const agora = Date.now();
      if (ultimo.current?.codigo === codigo && agora - ultimo.current.quando < 2000) return;
      ultimo.current = { codigo, quando: agora };
      aoLer(codigo);
    },
    [aoLer],
  );

  useEffect(() => {
    let vivo = true;

    const comecar = async () => {
      // 1. A câmera.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `environment` é a traseira, que é onde está a etiqueta.
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!vivo) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        fluxo.current = stream;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => undefined);
        }
      } catch (e) {
        if (!vivo) return;
        setEstado('sem_camera');
        setDetalhe(
          e instanceof Error && /denied|NotAllowed/i.test(e.name + e.message)
            ? 'Você precisa autorizar o uso da câmera para este site.'
            : null,
        );
        return;
      }

      // 2. O decodificador do sistema, quando existe.
      const Detector = (globalThis as { BarcodeDetector?: any }).BarcodeDetector;
      if (Detector) {
        try {
          const detector = new Detector({ formats: FORMATOS_WEB });
          let ativo = true;
          parar.current = () => {
            ativo = false;
          };

          const laco = async () => {
            while (ativo && vivo) {
              try {
                if (video.current && video.current.readyState >= 2) {
                  const achados = await detector.detect(video.current);
                  const valor = achados?.[0]?.rawValue;
                  if (valor) entregar(String(valor));
                }
              } catch {
                // Quadro ruim: tenta o próximo em vez de derrubar o laço.
              }
              // ~7 quadros por segundo: suficiente para a leitura parecer
              // instantânea e leve o bastante para o celular não esquentar.
              await new Promise((r) => setTimeout(r, 140));
            }
          };

          if (vivo) setEstado('lendo');
          void laco();
          return;
        } catch {
          // Formato não suportado por este navegador: cai no ZXing.
        }
      }

      // 3. ZXing, sob demanda.
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (!vivo) return;

        const leitor = new BrowserMultiFormatReader();
        const controle = await leitor.decodeFromStream(
          fluxo.current as MediaStream,
          video.current ?? undefined,
          (resultado) => {
            if (resultado) entregar(resultado.getText());
          },
        );
        parar.current = () => controle.stop();
        if (vivo) setEstado('lendo');
      } catch (e) {
        if (!vivo) return;
        console.warn('[leitor] ZXing indisponível', e);
        setEstado('sem_leitor');
      }
    };

    void comecar();

    return () => {
      vivo = false;
      parar.current?.();
      parar.current = null;
      fluxo.current?.getTracks().forEach((t) => t.stop());
      fluxo.current = null;
    };
  }, [entregar]);

  if (estado === 'sem_camera') {
    return (
      <TelaMensagem
        mensagem={
          detalhe ??
          'Não conseguimos abrir a câmera neste aparelho. Você pode digitar o código à mão.'
        }
        aoTentarNovamente={aoCancelar}
      />
    );
  }

  if (estado === 'sem_leitor') {
    return (
      <TelaMensagem
        mensagem={
          'Este navegador não consegue ler código de barras. Tente pelo Chrome no Android, ou ' +
          'digite o código à mão.'
        }
        aoTentarNovamente={aoCancelar}
      />
    );
  }

  return (
    <View style={estilos.tela}>
      {/* `video` cru porque não há equivalente em React Native — e é ele que o
          decodificador lê quadro a quadro. */}
      <video
        ref={video}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          background: '#000',
        }}
      />

      <View style={estilos.sobreposicao}>
        <View style={estilos.alvo} />

        <View style={estilos.rodape}>
          <Text style={estilos.instrucao}>
            {estado === 'iniciando' ? 'Abrindo a câmera…' : instrucao}
          </Text>
          <Botao titulo="Cancelar" variante="secundario" aoPressionar={aoCancelar} />
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000' },
  sobreposicao: { flex: 1, justifyContent: 'space-between' },
  alvo: {
    alignSelf: 'center',
    marginTop: '35%',
    width: '78%',
    height: 150,
    borderWidth: 2,
    borderColor: tema.cores.acaoPrimaria,
    borderRadius: tema.raio.md,
  },
  rodape: {
    padding: tema.espacamento.lg,
    gap: tema.espacamento.sm,
    backgroundColor: 'rgba(1, 41, 70, 0.85)',
  },
  instrucao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoInverso,
    textAlign: 'center',
  },
});
