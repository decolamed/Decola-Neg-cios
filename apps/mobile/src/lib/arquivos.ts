/**
 * Ler e entregar arquivos — nas duas plataformas.
 *
 * POR QUE ISTO EXISTE. `expo-file-system` é um módulo NATIVO: no navegador ele
 * não existe e cada chamada estoura com "The method or property
 * expo-file-system.readAsStringAsync is not available on web". Era o erro que
 * aparecia na tela ao tentar subir uma foto de produto, uma logo ou um banner
 * — em inglês, no meio de uma tela em português, sem dizer o que fazer.
 *
 * Na web o navegador já sabe fazer as duas coisas, e melhor: `fetch` lê
 * qualquer URI que o seletor de imagens devolveu, e um link com `download`
 * entrega o arquivo direto para a pasta de downloads, sem passar por um
 * sistema de arquivos que ali não existe.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Conteúdo binário de um arquivo local, pronto para subir ao Storage.
 *
 * `ArrayBuffer` e não base64: é o que o cliente do Supabase aceita direto, e
 * evita uma conversão de ida e volta que, em foto de celular, custa memória à
 * toa.
 */
export async function lerBinario(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const resposta = await fetch(uri);
    if (!resposta.ok) throw new Error('Não foi possível ler o arquivo escolhido.');
    return await resposta.arrayBuffer();
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Entrega um arquivo gerado ao usuário.
 *
 * No celular, grava no cache e abre a folha de compartilhamento — que é como
 * se manda um relatório por WhatsApp ou e-mail. No navegador, dispara o
 * download: `Sharing` também não existe lá, e era por isso que "Exportar
 * planilha" não fazia nada.
 */
export async function entregarArquivo(params: {
  nomeArquivo: string;
  conteudo: string;
  /** `base64` para PDF; `texto` para CSV. */
  codificacao: 'base64' | 'texto';
  mimeType: string;
  /** Título da folha de compartilhamento no celular. */
  titulo?: string;
}): Promise<void> {
  if (Platform.OS === 'web') {
    const blob =
      params.codificacao === 'base64'
        ? new Blob([binarioDeBase64(params.conteudo)], { type: params.mimeType })
        : new Blob([params.conteudo], { type: `${params.mimeType};charset=utf-8` });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = params.nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Sem isto o blob fica na memória da aba até ela fechar.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const caminho = `${FileSystem.cacheDirectory}${params.nomeArquivo}`;
  await FileSystem.writeAsStringAsync(caminho, params.conteudo, {
    encoding:
      params.codificacao === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Este aparelho não permite compartilhar arquivos.');
  }

  await Sharing.shareAsync(caminho, {
    mimeType: params.mimeType,
    dialogTitle: params.titulo ?? 'Compartilhar',
  });
}

function binarioDeBase64(base64: string): Uint8Array {
  const texto = atob(base64);
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i);
  return bytes;
}
