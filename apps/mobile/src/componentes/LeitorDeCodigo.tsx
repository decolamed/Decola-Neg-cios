/**
 * Leitor de código de barras — versão do CELULAR.
 *
 * A web tem o seu próprio arquivo (`LeitorDeCodigo.web.tsx`) porque a câmera é
 * outra coisa lá: aqui existe `CameraView` com leitura embutida; no navegador
 * é `getUserMedia` e um decodificador em JavaScript. Metro escolhe o arquivo
 * certo pela extensão — nenhuma tela precisa saber em qual plataforma está.
 *
 * O componente NÃO decide o que fazer com o código. Ele lê e entrega. Quem
 * chama resolve se aquilo vira um item no carrinho ou o campo "código" de um
 * cadastro — foi assim que o mesmo leitor passou a servir a venda e o
 * cadastro de produto, que era o que faltava.
 */
import { useCallback, useRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';

export type PropsDoLeitor = {
  aoLer: (codigo: string) => void;
  aoCancelar: () => void;
  /** Texto acima do botão. Muda entre vender e cadastrar. */
  instrucao?: string;
  /** Pausa a leitura enquanto quem chama processa o código anterior. */
  pausado?: boolean;
};

/** Os formatos que aparecem em produto de varejo brasileiro. */
export const FORMATOS = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'code39',
  'itf14',
  'qr',
] as const;

export function LeitorDeCodigo({
  aoLer,
  aoCancelar,
  instrucao = 'Aponte a câmera para o código de barras do produto.',
  pausado = false,
}: PropsDoLeitor) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const ultimo = useRef<{ codigo: string; quando: number } | null>(null);

  /**
   * A câmera dispara em rajada sobre o mesmo código. Sem este freio, uma
   * etiqueta na frente da lente vira dez leituras e dez itens no carrinho.
   */
  const filtrar = useCallback(
    ({ data }: { data: string }) => {
      const agora = Date.now();
      if (ultimo.current?.codigo === data && agora - ultimo.current.quando < 2000) return;
      ultimo.current = { codigo: data, quando: agora };
      aoLer(data);
    },
    [aoLer],
  );

  if (!permissao) return <TelaCarregando />;

  if (!permissao.granted) {
    return (
      <TelaMensagem
        mensagem="Precisamos da câmera para ler o código de barras dos produtos."
        aoTentarNovamente={pedirPermissao}
      />
    );
  }

  return (
    <View style={estilos.tela}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...FORMATOS] }}
        onBarcodeScanned={pausado ? undefined : filtrar}
      />

      <SafeAreaView style={estilos.sobreposicao}>
        <View style={estilos.alvo} />

        <View style={estilos.rodape}>
          <Text style={estilos.instrucao}>{instrucao}</Text>
          <Botao titulo="Cancelar" variante="secundario" aoPressionar={aoCancelar} />
        </View>
      </SafeAreaView>
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
