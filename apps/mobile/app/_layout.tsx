import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { ProvedorDeSessao } from '@/contexto/SessaoContexto';

export default function LayoutRaiz() {
  return (
    <SafeAreaProvider>
      <ProvedorDeSessao>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: tema.cores.fundo },
          }}
        />
      </ProvedorDeSessao>
    </SafeAreaProvider>
  );
}
