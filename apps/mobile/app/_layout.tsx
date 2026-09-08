import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Cabecalho } from '@/componentes/Cabecalho';
import { HospedeiroDeDialogos } from '@/componentes/Dialogos';
import { TelaCarregando } from '@/componentes/EstadoDaTela';
import { TelaQueFalhou } from '@/componentes/TelaQueFalhou';
import { ProvedorDeCarrinho } from '@/contexto/CarrinhoContexto';
import { ProvedorDeSessao } from '@/contexto/SessaoContexto';
import {
  conferirConsistenciaDasFontes,
  MAPA_DE_FONTES,
  TEM_FONTES_PARA_CARREGAR,
} from '@/lib/fontes';

/**
 * Telas SEM cabeçalho de voltar, e o motivo de cada grupo:
 *
 * - abertura e autenticação: não há para onde voltar, e uma seta ali sugere
 *   que a pessoa deixou algo para trás quando não deixou;
 * - as cinco telas do menu inferior: são o chão do aplicativo. Voltar a partir
 *   do Início não quer dizer nada, e a navegação entre elas é o próprio menu.
 *
 * Todo o resto ganha a seta automaticamente — inclusive telas que ainda nem
 * existem. É de propósito: esquecer de POR a seta numa tela nova é mais fácil
 * do que esquecer de tirá-la.
 */
const SEM_CABECALHO = [
  'index',
  'login',
  'cadastro',
  'recuperar-senha',
  'redefinir-senha',
  'pagamento',
  'convite/[id]',
  'dashboard',
  'mais',
  'vendas/index',
  'financeiro/index',
  'pedidos/index',
];

/**
 * O Expo Router usa como limite de erro o `ErrorBoundary` exportado de um
 * layout. Exportado AQUI, no layout raiz, ele vale para o aplicativo inteiro:
 * qualquer tela que quebre mostra o que houve, em vez de sumir e deixar a
 * pessoa olhando para um retângulo sem texto.
 */
export { TelaQueFalhou as ErrorBoundary };

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
                header: () => <Cabecalho />,
                contentStyle: { backgroundColor: tema.cores.fundo },
              }}
            >
              {SEM_CABECALHO.map((rota) => (
                <Stack.Screen key={rota} name={rota} options={{ headerShown: false }} />
              ))}
            </Stack>
          )}

          {/* Fora do Stack, por cima de tudo: a confirmação precisa aparecer
              inteira mesmo quando a tela por baixo está rolando ou navegando. */}
          <HospedeiroDeDialogos />
        </ProvedorDeCarrinho>
      </ProvedorDeSessao>
    </SafeAreaProvider>
  );
}
