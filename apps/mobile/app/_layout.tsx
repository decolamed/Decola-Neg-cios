import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { TelaCarregando } from '@/componentes/EstadoDaTela';
import { ProvedorDeCarrinho } from '@/contexto/CarrinhoContexto';
import { ProvedorDeSessao } from '@/contexto/SessaoContexto';
import {
  conferirConsistenciaDasFontes,
  MAPA_DE_FONTES,
  TEM_FONTES_PARA_CARREGAR,
} from '@/lib/fontes';

export default function LayoutRaiz() {
  // Com o mapa vazio (fontes ainda não fornecidas) `carregadas` já vem true e
  // o app sobe direto com a fonte do sistema — ver src/lib/fontes.ts.
  const [carregadas, erroDeFonte] = useFonts(MAPA_DE_FONTES);

  useEffect(() => {
    conferirConsistenciaDasFontes();
    if (erroDeFonte) {
      console.warn('[fontes] Falha ao carregar as fontes da marca:', erroDeFonte);
    }
  }, [erroDeFonte]);

  // A espera evita o "salto" de tipografia: a marca aparece já na primeira
  // tela. Se o carregamento falhar, o app segue com a fonte do sistema em vez
  // de ficar preso na abertura.
  const aguardandoFontes = TEM_FONTES_PARA_CARREGAR && !carregadas && !erroDeFonte;

  return (
    <SafeAreaProvider>
      <ProvedorDeSessao>
        <ProvedorDeCarrinho>
          <StatusBar style="dark" />
          {aguardandoFontes ? (
            <TelaCarregando comMarca />
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tema.cores.fundo },
              }}
            />
          )}
        </ProvedorDeCarrinho>
      </ProvedorDeSessao>
    </SafeAreaProvider>
  );
}
