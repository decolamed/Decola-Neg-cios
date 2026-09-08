/**
 * Compartilhar um texto — e nunca falhar em silêncio.
 *
 * O QUE ESTAVA ERRADO. As telas chamavam `Share.share` do react-native. No
 * celular isso abre a folha do sistema. No NAVEGADOR, o react-native-web
 * repassa para `navigator.share`, que **não existe** no Chrome de computador
 * nem em vários navegadores de celular — e o que acontece lá é uma exceção
 * (`Share is not supported in this browser`) engolida por um `void`. Do lado
 * de quem usa: tocou no botão, não aconteceu nada.
 *
 * O botão em questão é o que manda o link da loja para o cliente. Ele falhar
 * calado é o pior caso possível: o lojista acha que enviou.
 *
 * A ESCADA. Folha de compartilhamento → área de transferência → devolver o
 * texto para a tela mostrar. Sempre sobra alguma coisa, e quem chama SABE qual
 * delas aconteceu para poder dizer à pessoa.
 */
import { Platform, Share } from 'react-native';
import { copiar } from '@/lib/areaDeTransferencia';

export type ResultadoDeCompartilhar = 'compartilhado' | 'copiado' | 'nada';

export async function compartilharTexto(texto: string, titulo?: string): Promise<ResultadoDeCompartilhar> {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message: texto });
      return 'compartilhado';
    } catch {
      return (await copiar(texto)) ? 'copiado' : 'nada';
    }
  }

  // `navigator.share` existe sobretudo em celular. Desistir da folha é escolha
  // da pessoa (AbortError) e não vira tentativa de copiar por cima.
  const nativo = (globalThis as { navigator?: { share?: (d: { text: string; title?: string }) => Promise<void> } })
    .navigator?.share;

  if (typeof nativo === 'function') {
    try {
      await nativo.call(globalThis.navigator, { text: texto, title: titulo });
      return 'compartilhado';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'compartilhado';
    }
  }

  return (await copiar(texto)) ? 'copiado' : 'nada';
}
