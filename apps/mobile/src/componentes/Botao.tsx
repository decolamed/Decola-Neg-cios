/**
 * Botão — estados visuais da Seção 2.3, aplicados uniformemente.
 *
 * Default: cor sólida da paleta.
 * Pressed: escurecimento de ~10%.
 * Disabled: opacidade ~40% e sem resposta a toque.
 * Loading: substitui o conteúdo por um indicador MANTENDO as dimensões do
 *          componente, para não haver "pulo" de layout.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import tema from '@decola/theme';

type Variante = 'primario' | 'secundario' | 'texto';

type Props = {
  titulo: string;
  aoPressionar: () => void;
  variante?: Variante;
  carregando?: boolean;
  desabilitado?: boolean;
  estilo?: ViewStyle;
};

const FUNDO: Record<Variante, string> = {
  primario: tema.cores.acaoPrimaria,
  secundario: tema.cores.primaria,
  texto: 'transparent',
};

const COR_TEXTO: Record<Variante, string> = {
  primario: tema.cores.textoInverso,
  secundario: tema.cores.textoInverso,
  texto: tema.cores.primaria,
};

export function Botao({
  titulo,
  aoPressionar,
  variante = 'primario',
  carregando = false,
  desabilitado = false,
  estilo,
}: Props) {
  // Durante o carregamento o botão também não responde a toque — evita
  // submissão dupla do formulário.
  const inativo = desabilitado || carregando;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      onPress={aoPressionar}
      disabled={inativo}
      style={({ pressed }) => [
        estilos.base,
        variante === 'texto' && estilos.semFundo,
        { backgroundColor: FUNDO[variante] },
        pressed && !inativo && { backgroundColor: tema.escurecer(FUNDO[variante]) },
        desabilitado && { opacity: tema.estados.disabledOpacidade },
        estilo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator color={COR_TEXTO[variante]} />
      ) : (
        <Text style={[estilos.texto, { color: COR_TEXTO[variante] }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    // Altura fixa: com o indicador de carregamento no lugar do texto, o
    // componente mantém exatamente as mesmas dimensões (Seção 2.3).
    height: 48,
    borderRadius: tema.raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tema.espacamento.md,
  },
  semFundo: {
    height: 'auto',
    paddingVertical: tema.espacamento.sm,
  },
  texto: {
    ...tema.tipografia.botao,
    textAlign: 'center',
  },
});
