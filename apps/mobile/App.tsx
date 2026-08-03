/**
 * Ponto de entrada do app cliente.
 *
 * A navegação e as 15 telas da Seção 7 entram na Fase 2 (autenticação e
 * onboarding) em diante. Este arquivo existe para o projeto Expo subir e para
 * confirmar que o tema e o cliente Supabase estão ligados corretamente.
 */
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

export default function App() {
  return (
    <View style={estilos.container}>
      <StatusBar style="light" />
      <Text style={estilos.titulo}>Decola Negócios</Text>
      <Text style={estilos.tagline}>Organize. Venda. Cresça.</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tema.cores.primaria,
    padding: tema.espacamento.lg,
  },
  titulo: {
    ...tema.tipografia.h1,
    color: tema.cores.textoInverso,
  },
  tagline: {
    ...tema.tipografia.corpo,
    color: tema.cores.destaque,
    marginTop: tema.espacamento.sm,
  },
});
