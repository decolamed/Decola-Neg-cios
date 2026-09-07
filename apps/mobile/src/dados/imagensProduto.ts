/**
 * Fotos do produto — a matéria-prima da vitrine.
 *
 * `produtos.imagens` guarda CAMINHOS (`<empresa_id>/<produto_id>/<uuid>.jpg`),
 * nunca URLs: trocar o domínio do Storage não pode obrigar a reescrever linha
 * de produto. A URL é montada na hora de exibir, aqui e no site.
 *
 * A primeira pasta do caminho é o `empresa_id`, e é sobre ela que as políticas
 * do bucket (0038) comparam `app.empresa_atual()`. Montar o caminho errado não
 * é falha de estilo: é upload recusado pelo banco.
 *
 * Toda foto passa pelo redimensionamento antes de subir. Não é enfeite — foto
 * de celular hoje passa dos 5 MB que o bucket aceita, e a vitrine é aberta por
 * clientes no 4G. O que sobe é o que a loja precisa mostrar, não o arquivo
 * original da câmera.
 */
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

const BUCKET = 'produtos';

/** Teto de fotos por produto. Vitrine com dez fotos não vende mais; cansa. */
export const MAXIMO_DE_IMAGENS = 5;

/** Lado maior da foto publicada. Suficiente para tela cheia de celular. */
const LADO_MAXIMO = 1200;

const QUALIDADE = 0.8;

export function urlDaImagem(caminho: string): string {
  if (/^https?:\/\//.test(caminho)) return caminho;
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/**
 * Abre a galeria e devolve o caminho local da foto escolhida.
 *
 * `null` quando o usuário desiste — desistir não é erro e não deve virar
 * mensagem vermelha na tela.
 */
export async function escolherImagem(): Promise<string | null> {
  const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permissao.granted) {
    throw new Error(
      'Para adicionar fotos, autorize o acesso às imagens do aparelho nas configurações.',
    );
  }

  const resultado = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    allowsMultipleSelection: false,
  });

  if (resultado.canceled || resultado.assets.length === 0) return null;
  return resultado.assets[0].uri;
}

export async function tirarFoto(): Promise<string | null> {
  const permissao = await ImagePicker.requestCameraPermissionsAsync();
  if (!permissao.granted) {
    throw new Error('Para tirar fotos, autorize o acesso à câmera nas configurações.');
  }

  const resultado = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (resultado.canceled || resultado.assets.length === 0) return null;
  return resultado.assets[0].uri;
}

/**
 * Sobe a foto e devolve o CAMINHO gravado — quem chama é que decide se e
 * quando esse caminho entra em `produtos.imagens`.
 */
export async function enviarImagem(params: {
  empresaId: string;
  produtoId: string;
  uriLocal: string;
}): Promise<string> {
  await exigirConexao();

  const reduzida = await ImageManipulator.manipulateAsync(
    params.uriLocal,
    [{ resize: { width: LADO_MAXIMO } }],
    { compress: QUALIDADE, format: ImageManipulator.SaveFormat.JPEG },
  );

  const base64 = await FileSystem.readAsStringAsync(reduzida.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // `Blob` em React Native chega ao Storage vazio em vários aparelhos; o
  // ArrayBuffer é o caminho que funciona nas duas plataformas.
  const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const caminho = `${params.empresaId}/${params.produtoId}/${nome}`;

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, decode(base64), {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    const texto = error.message.toLowerCase();
    if (texto.includes('row-level security') || texto.includes('unauthorized')) {
      throw new Error('Você não tem permissão para enviar fotos de produto.');
    }
    if (texto.includes('exceeded') || texto.includes('too large')) {
      throw new Error('Esta imagem é grande demais. Tente outra foto.');
    }
    throw new Error(mensagemDeErro(error));
  }

  return caminho;
}

/**
 * Grava a lista de caminhos no produto. A ORDEM importa: a primeira é a capa
 * que aparece na vitrine.
 */
export async function salvarImagensDoProduto(
  produtoId: string,
  caminhos: string[],
): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('produtos')
    .update({ imagens: caminhos })
    .eq('id', produtoId);

  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * Apaga o arquivo do bucket.
 *
 * Falha aqui NÃO interrompe quem chama: o que decide o que a vitrine mostra é
 * a lista em `produtos.imagens`. Um arquivo órfão custa alguns KB; travar a
 * remoção porque o Storage recusou custa o gestor não conseguir tirar da loja
 * uma foto errada.
 */
export async function apagarImagem(caminho: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) console.warn('[imagens] arquivo não removido do Storage:', error.message);
}

export async function carregarImagensDoProduto(produtoId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('imagens')
    .eq('id', produtoId)
    .maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  const imagens = data?.imagens;
  return Array.isArray(imagens) ? (imagens as string[]) : [];
}
