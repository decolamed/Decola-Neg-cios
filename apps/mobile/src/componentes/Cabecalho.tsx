/**
 * Cabeçalho com botão de voltar.
 *
 * POR QUE ISTO EXISTE. O Stack subia com `headerShown: false` e cada tela
 * resolvia a volta por conta própria — quase sempre com um "Voltar" de texto no
 * FIM da rolagem, ou seja, invisível em qualquer tela que role. Na prática só
 * restava o botão de retorno do próprio celular, que é do sistema, não do
 * aplicativo. Quem instala o app como atalho na tela inicial (PWA) muitas vezes
 * nem tem esse botão à mão.
 *
 * Fica só a seta e a palavra "Voltar", sem repetir o título: cada tela já
 * escreve o próprio título no corpo, e ver o mesmo texto duas vezes empilhado
 * não informa nada.
 *
 * A SAÍDA DE EMERGÊNCIA. `router.back()` sem histórico não faz nada — e é
 * exatamente assim que se fica preso numa tela sem saída, ou se cai numa tela
 * em branco depois de abrir o aplicativo direto num link. Por isso a volta tem
 * destino de reserva: não dá para voltar, vai para o Início.
 */
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Icone } from '@/componentes/Icone';

/** Para onde ir quando não há para onde voltar. */
export const DESTINO_DE_RESERVA = '/dashboard';

/**
 * Voltar sem deixar ninguém preso.
 *
 * `router.back()` sozinho NÃO FAZ NADA quando não há histórico — e isso não é
 * raro: acontece toda vez que a tela é aberta direto pelo endereço, toda vez
 * que a pessoa recarrega a página, e toda vez que o aplicativo instalado
 * restaura a última tela ao abrir. O botão fica lá, a pessoa toca, e não
 * acontece coisa alguma.
 *
 * `destino` permite dizer para onde faz sentido cair em cada tela: quem estava
 * vendo uma venda volta para a lista de vendas, não para o Início.
 */
export function voltar(destino: string = DESTINO_DE_RESERVA) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(destino as never);
}

export function Cabecalho() {
  const margens = useSafeAreaInsets();

  return (
    <View style={[estilos.barra, { paddingTop: margens.top + tema.espacamento.xs }]}>
      <Pressable
        // Envolvido de propósito: `onPress` entrega o evento do toque como
        // primeiro argumento, e `voltar` o leria como destino.
        onPress={() => voltar()}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        // Alvo folgado: no celular a seta sozinha tem menos que os 44dp que
        // um dedo precisa para acertar sem tentar duas vezes.
        hitSlop={12}
        style={({ pressed }) => [estilos.botao, pressed && { opacity: 0.6 }]}
      >
        <Icone nome="voltar" cor={tema.cores.primaria} tamanho={22} />
        <Text style={estilos.rotulo}>Voltar</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: tema.cores.bordaSuave,
    paddingHorizontal: tema.espacamento.sm,
    paddingBottom: tema.espacamento.xs,
    // Na web o cabeçalho acompanha a rolagem; no celular ele já fica fixo
    // porque o conteúdo rola dentro da tela, abaixo dele.
    ...(Platform.OS === 'web' ? { position: 'sticky' as never, top: 0, zIndex: 10 } : null),
  },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.xs,
    paddingVertical: tema.espacamento.sm,
    paddingHorizontal: tema.espacamento.sm,
    minHeight: 44,
  },
  rotulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
});
