/**
 * Checkbox — usado no aceite obrigatório dos Termos de Uso (Seção 7.12).
 * O conteúdo é livre para permitir os links dos textos completos.
 */
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

type Props = {
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  bloqueado?: boolean;
  children: ReactNode;
};

export function Checkbox({ marcado, aoMudar, bloqueado = false, children }: Props) {
  return (
    <Pressable
      onPress={() => aoMudar(!marcado)}
      disabled={bloqueado}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcado, disabled: bloqueado }}
      style={({ pressed }) => [
        estilos.linha,
        bloqueado && { opacity: tema.estados.disabledOpacidade },
        pressed && !bloqueado && { opacity: 0.8 },
      ]}
    >
      <View style={[estilos.caixa, marcado && estilos.caixaMarcada]}>
        {marcado ? <Text style={estilos.marca}>✓</Text> : null}
      </View>
      <View style={estilos.conteudo}>{children}</View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: tema.espacamento.md,
  },
  caixa: {
    width: 22,
    height: 22,
    borderRadius: tema.raio.sm,
    borderWidth: 1.5,
    borderColor: tema.cores.borda,
    backgroundColor: tema.cores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: tema.espacamento.sm,
  },
  caixaMarcada: {
    backgroundColor: tema.cores.primaria,
    borderColor: tema.cores.primaria,
  },
  marca: {
    color: tema.cores.textoInverso,
    fontSize: 14,
    lineHeight: 16,
  },
  conteudo: { flex: 1 },
});
