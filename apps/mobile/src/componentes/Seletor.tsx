/**
 * Seletor de opção única — usado por categoria, campos de seleção e filtros.
 * Renderizado como chips para não depender de biblioteca de picker nativa.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

export type Opcao = { valor: string; rotulo: string };

type Props = {
  rotulo?: string;
  opcoes: Opcao[];
  selecionado: string | null;
  aoSelecionar: (valor: string | null) => void;
  /** Exibe um chip "Todos" que limpa a seleção. */
  permiteLimpar?: boolean;
  rotuloLimpar?: string;
  bloqueado?: boolean;
  erro?: string | null;
  horizontal?: boolean;
};

export function Seletor({
  rotulo,
  opcoes,
  selecionado,
  aoSelecionar,
  permiteLimpar = false,
  rotuloLimpar = 'Todos',
  bloqueado = false,
  erro,
  horizontal = false,
}: Props) {
  const chips = (
    <View style={[estilos.lista, horizontal && estilos.listaHorizontal]}>
      {permiteLimpar ? (
        <Chip
          rotulo={rotuloLimpar}
          ativo={selecionado === null}
          bloqueado={bloqueado}
          aoPressionar={() => aoSelecionar(null)}
        />
      ) : null}

      {opcoes.map((opcao) => (
        <Chip
          key={opcao.valor}
          rotulo={opcao.rotulo}
          ativo={selecionado === opcao.valor}
          bloqueado={bloqueado}
          aoPressionar={() => aoSelecionar(selecionado === opcao.valor ? null : opcao.valor)}
        />
      ))}
    </View>
  );

  return (
    <View style={estilos.container}>
      {rotulo ? <Text style={estilos.rotulo}>{rotulo}</Text> : null}

      {horizontal ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {chips}
        </ScrollView>
      ) : (
        chips
      )}

      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

function Chip({
  rotulo,
  ativo,
  bloqueado,
  aoPressionar,
}: {
  rotulo: string;
  ativo: boolean;
  bloqueado: boolean;
  aoPressionar: () => void;
}) {
  return (
    <Pressable
      onPress={aoPressionar}
      disabled={bloqueado}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo, disabled: bloqueado }}
      style={({ pressed }) => [
        estilos.chip,
        ativo && estilos.chipAtivo,
        bloqueado && { opacity: tema.estados.disabledOpacidade },
        pressed && !bloqueado && { opacity: 0.85 },
      ]}
    >
      <Text style={[estilos.chipTexto, ativo && estilos.chipTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  container: { marginBottom: tema.espacamento.md },
  rotulo: {
    ...tema.tipografia.legenda,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.xs,
  },
  lista: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacamento.sm },
  listaHorizontal: { flexWrap: 'nowrap' },
  chip: {
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.md,
    paddingVertical: tema.espacamento.sm,
    backgroundColor: tema.cores.superficie,
  },
  chipAtivo: { backgroundColor: tema.cores.primaria, borderColor: tema.cores.primaria },
  chipTexto: { ...tema.tipografia.legenda, color: tema.cores.texto },
  chipTextoAtivo: { color: tema.cores.textoInverso },
  erro: { ...tema.tipografia.legenda, color: tema.cores.erro, marginTop: tema.espacamento.xs },
});
