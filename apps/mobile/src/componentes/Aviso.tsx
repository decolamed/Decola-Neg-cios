/**
 * Aviso inline — mensagens de erro, alerta e confirmação das telas.
 * Seções 7.10–7.13 exigem mensagem explícita em cada estado; este componente
 * garante que todas tenham a mesma aparência.
 */
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

type Tom = 'erro' | 'alerta' | 'sucesso' | 'informacao';

const CORES: Record<Tom, { fundo: string; texto: string }> = {
  erro: { fundo: '#FBE9E9', texto: tema.cores.erro },
  alerta: { fundo: '#FDF4E0', texto: '#8A6412' },
  sucesso: { fundo: '#E8F5FC', texto: tema.cores.primaria },
  informacao: { fundo: tema.cores.fundo, texto: tema.cores.texto },
};

export function Aviso({ mensagem, tom = 'erro' }: { mensagem: string; tom?: Tom }) {
  const cor = CORES[tom];
  return (
    <View style={[estilos.caixa, { backgroundColor: cor.fundo }]} accessibilityRole="alert">
      <Text style={[estilos.texto, { color: cor.texto }]}>{mensagem}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: {
    borderRadius: tema.raio.sm,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
  },
  texto: tema.tipografia.corpo,
});
