/**
 * Abrir um endereço fora do app.
 *
 * POR QUE NÃO É SÓ `Linking.openURL`. No navegador, `Linking.openURL` troca a
 * página atual — o lojista tocaria em "Ver minha loja" e PERDERIA o app, tendo
 * de voltar pelo botão do navegador. Como o produto é servido também como site,
 * esse é o caso comum, não a exceção.
 *
 * Na web abrimos uma aba nova; no aparelho, o navegador embutido, que devolve o
 * controle ao fechar. Nos dois casos a pessoa continua de onde estava.
 *
 * `noopener` não é detalhe: sem ele a página aberta recebe `window.opener` e
 * pode navegar a nossa aba para onde quiser.
 */
import { Platform, Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export async function abrirNoNavegador(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    const aba = window.open(url, '_blank', 'noopener,noreferrer');
    // Bloqueador de pop-up: em vez de não fazer nada, navega na própria aba —
    // é pior do que abrir ao lado, e melhor do que um toque que não responde.
    if (!aba) window.location.href = url;
    return;
  }

  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    // Navegador embutido indisponível: o do sistema resolve.
    await Linking.openURL(url).catch(() => undefined);
  }
}
