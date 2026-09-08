/**
 * Copiar texto — nas duas plataformas, e sem mentir quando não dá.
 *
 * O `Clipboard` do react-native está depreciado e não existe na web; o
 * `navigator.clipboard` existe na web mas exige contexto seguro e pode ser
 * bloqueado pelo navegador. Como o texto que copiamos é um código Pix, dizer
 * "copiado" quando nada foi copiado é pior do que não oferecer o botão: a
 * pessoa cola no banco o que estava na área de transferência antes.
 *
 * Por isso a função devolve se conseguiu, e quem chama mostra o texto na tela
 * de qualquer jeito, selecionável, como saída de emergência.
 */
import { Clipboard, Platform } from 'react-native';

export async function copiar(texto: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      return false;
    }
  }

  try {
    Clipboard.setString(texto);
    return true;
  } catch {
    return false;
  }
}
