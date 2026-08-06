/**
 * Aviso inline — mensagens de erro, alerta e confirmação das telas.
 * Seções 7.10–7.13 exigem mensagem explícita em cada estado; este componente
 * garante que todas tenham a mesma aparência.
 */
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

type Tom = 'erro' | 'alerta' | 'sucesso' | 'informacao';

const CORES: Record<Tom, { fundo: string; texto: string; barra: string }> = {
  erro: { fundo: tema.tons.negativo, texto: tema.cores.erro, barra: tema.cores.erro },
  alerta: { fundo: tema.tons.destaque, texto: tema.cores.textoAlerta, barra: tema.cores.alerta },
  sucesso: { fundo: tema.tons.secundaria, texto: tema.cores.primaria, barra: tema.cores.secundaria },
  informacao: { fundo: tema.cores.fundo, texto: tema.cores.texto, barra: tema.cores.borda },
};

export function Aviso({ mensagem, tom = 'erro' }: { mensagem: string; tom?: Tom }) {
  const cor = CORES[tom];
  return (
    <View
      style={[estilos.caixa, { backgroundColor: cor.fundo, borderLeftColor: cor.barra }]}
      accessibilityRole="alert"
    >
      <Text style={[estilos.texto, { color: cor.texto }]}>{mensagem}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: {
    borderRadius: tema.raio.md,
    borderLeftWidth: 3,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
  },
  texto: tema.tipografia.corpo,
});
