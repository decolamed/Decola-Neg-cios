/**
 * Botão — estados visuais da Seção 2.3, aplicados uniformemente.
 *
 * Default: cor sólida da paleta.
 * Pressed: escurecimento de ~10%.
 * Disabled: opacidade ~40% e sem resposta a toque.
 * Loading: substitui o conteúdo por um indicador MANTENDO as dimensões do
 *          componente, para não haver "pulo" de layout.
 *
 * Variantes (aparência apenas — nenhuma muda comportamento):
 *   primario ...... CTA de largura total: amarelo da marca, texto azul-marinho
 *   secundario .... ação de apoio sólida em azul-marinho
 *   contorno ...... ação de apoio sobre fundo claro, com borda
 *   texto ......... ação terciária, sem fundo
 *   destrutivo .... ação destrutiva, em vermelho sólido
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import tema from '@decola/theme';

type Variante = 'primario' | 'secundario' | 'contorno' | 'texto' | 'destrutivo';

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
  contorno: tema.cores.superficie,
  texto: 'transparent',
  destrutivo: tema.cores.destrutiva,
};

const COR_TEXTO: Record<Variante, string> = {
  primario: tema.cores.textoSobreAcao,
  secundario: tema.cores.textoInverso,
  contorno: tema.cores.primaria,
  texto: tema.cores.primaria,
  destrutivo: tema.cores.textoInverso,
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
        variante === 'primario' && estilos.comSombra,
        variante === 'destrutivo' && estilos.comSombra,
        variante === 'contorno' && estilos.comBorda,
        variante === 'texto' && estilos.semFundo,
        { backgroundColor: FUNDO[variante] },
        pressed && !inativo && variante !== 'texto'
          ? { backgroundColor: tema.escurecer(FUNDO[variante]) }
          : null,
        pressed && !inativo && variante === 'texto' ? { opacity: 0.6 } : null,
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
    height: tema.alturas.botao,
    borderRadius: tema.raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tema.espacamento.lg,
  },
  comSombra: tema.elevacao.card,
  comBorda: { borderWidth: 1, borderColor: tema.cores.borda },
  semFundo: {
    height: 'auto',
    paddingVertical: tema.espacamento.sm,
  },
  texto: {
    ...tema.tipografia.botao,
    textAlign: 'center',
  },
});
