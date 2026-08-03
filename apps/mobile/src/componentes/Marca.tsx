/**
 * Marca — logo e tagline (Seções 1.1 e 7.10).
 *
 * O logo definitivo entra no refino visual; até lá, a marca é tipográfica,
 * usando os tokens do tema. Sem nenhum elemento interativo, conforme a
 * Seção 7.10.
 */
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

export function Marca({ comTagline = true, escura = false }: { comTagline?: boolean; escura?: boolean }) {
  return (
    <View style={estilos.container}>
      <Text style={[estilos.nome, escura && { color: tema.cores.primaria }]}>Decola Negócios</Text>
      {comTagline ? (
        <Text style={[estilos.tagline, escura && { color: tema.cores.apoio }]}>
          Organize. Venda. Cresça.
        </Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { alignItems: 'center' },
  nome: {
    ...tema.tipografia.h1,
    color: tema.cores.textoInverso,
  },
  tagline: {
    ...tema.tipografia.corpo,
    color: tema.cores.destaque,
    marginTop: tema.espacamento.xs,
  },
});
