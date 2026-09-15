/**
 * O catálogo de códigos de barras, do lado do aplicativo.
 *
 * Aqui é só a ponte. Quem procura é a Edge Function `buscar-codigo`, e ela
 * procura em três lugares nesta ordem: o catálogo interno da Decola, as bases
 * abertas (Open Food Facts e irmãs) e, por último, o UPCitemdb.
 *
 * POR QUE NO SERVIDOR, e não daqui. Três motivos, e o terceiro é o que decide:
 *
 *   1. as respostas das APIs ficam guardadas no catálogo interno, e o primeiro
 *      lojista que bipa um produto resolve a consulta para todos os outros;
 *   2. a foto é copiada para o nosso armazenamento — o celular não teria como,
 *      e uma URL de fora some sem avisar;
 *   3. o navegador recusaria as chamadas por CORS de qualquer forma.
 *
 * NADA É INVENTADO. Quando as três portas dizem "não sei", o resultado é
 * `null` e o nome chega vazio à tela, para o lojista digitar. Um nome plausível
 * preenchido sozinho é pior que campo vazio: parece conferido e ninguém revisa.
 */
import { supabase } from '@/lib/supabase';

export type ProdutoDoCatalogo = {
  codigo: string;
  nome: string;
  marca: string | null;
  categoria: string | null;
  /** URL pública da foto, quando existe. */
  imagem: string | null;
};

/**
 * O que o código de barras diz, ou `null`.
 *
 * NUNCA LANÇA. Uma consulta de conveniência que derruba a tela de cadastro
 * troca um cadastro bom por nenhum cadastro — se a busca falhar, o lojista
 * simplesmente digita o nome, que é o que ele já fazia antes disto existir.
 */
export async function consultarCatalogo(codigo: string): Promise<ProdutoDoCatalogo | null> {
  const limpo = codigo.replace(/\D/g, '');
  if (limpo.length < 8) return null;

  try {
    const { data, error } = await supabase.functions.invoke('buscar-codigo', {
      body: { codigo: limpo },
    });

    if (error) {
      console.warn('[catálogo] busca falhou:', error.message);
      return null;
    }

    const resposta = data as { encontrado?: boolean; produto?: ProdutoDoCatalogo } | null;
    if (!resposta?.encontrado || !resposta.produto?.nome) return null;

    return resposta.produto;
  } catch (e) {
    console.warn('[catálogo] busca falhou:', e);
    return null;
  }
}
