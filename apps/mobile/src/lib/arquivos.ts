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
 * Como o arquivo chegou às mãos da pessoa — quem chama usa isto para dizer a
 * ela o que procurar. "Foi baixado" e "escolha para onde enviar" mandam
 * olhar para lugares diferentes.
 */
export type FormaDeEntrega = 'compartilhado' | 'baixado' | 'aberto';

/**
 * Entrega um arquivo gerado ao usuário.
 *
 * NO CELULAR: grava no cache e abre a folha de compartilhamento — que é como
 * se manda um relatório por WhatsApp ou e-mail.
 *
 * NO NAVEGADOR, e aqui está o problema que o lojista descreveu como "carrega
 * e não abre nada": o caminho clássico é um link com `download`, e no
 * aplicativo INSTALADO na tela inicial esse link baixa o arquivo em silêncio,
 * sem barra de downloads, sem aba, sem nada. O arquivo estava lá; a pessoa não
 * tinha como saber.
 *
 * Então a ordem passou a ser:
 *   1. a folha de compartilhamento do próprio sistema (`navigator.share` com
 *      arquivo), que o Chrome no Android oferece e que é VISÍVEL — a pessoa
 *      escolhe WhatsApp, Drive, salvar;
 *   2. o link com `download`, para os navegadores de mesa, onde a barra de
 *      downloads aparece e resolve;
 *   3. abrir numa aba, último recurso, porque ver o arquivo é melhor do que
 *      não ver nada.
 */
export async function entregarArquivo(params: {
  nomeArquivo: string;
  conteudo: string;
  /** `base64` para PDF; `texto` para CSV. */
  codificacao: 'base64' | 'texto';
  mimeType: string;
  /** Título da folha de compartilhamento. */
  titulo?: string;
}): Promise<FormaDeEntrega> {
  if (Platform.OS === 'web') return entregarNoNavegador(params);

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
  return 'compartilhado';
}

async function entregarNoNavegador(params: {
  nomeArquivo: string;
  conteudo: string;
  codificacao: 'base64' | 'texto';
  mimeType: string;
  titulo?: string;
}): Promise<FormaDeEntrega> {
  const blob =
    params.codificacao === 'base64'
      ? new Blob([binarioDeBase64(params.conteudo)], { type: params.mimeType })
      : new Blob([params.conteudo], { type: `${params.mimeType};charset=utf-8` });

  // 1. Folha de compartilhamento.
  try {
    const arquivo = new File([blob], params.nomeArquivo, { type: params.mimeType });
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: params.titulo });
      return 'compartilhado';
    }
  } catch (e) {
    // Desistir da folha é escolha da pessoa, não erro: não cai para o
    // download nem mostra mensagem vermelha.
    if (e instanceof Error && e.name === 'AbortError') return 'compartilhado';
    // Qualquer outra recusa (gesto expirado, formato não aceito) segue adiante.
  }

  const url = URL.createObjectURL(blob);

  // 2. Link com download.
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = params.nomeArquivo;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Sem isto o blob fica na memória da aba até ela fechar.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'baixado';
  } catch {
    // 3. Abrir numa aba.
    const aba = window.open(url, '_blank');
    if (!aba) {
      URL.revokeObjectURL(url);
      throw new Error(
        'O navegador bloqueou a abertura do arquivo. Libere as janelas para este site e tente ' +
          'de novo.',
      );
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return 'aberto';
  }
}

function binarioDeBase64(base64: string): Uint8Array {
  const texto = atob(base64);
  const bytes = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) bytes[i] = texto.charCodeAt(i);
  return bytes;
}
