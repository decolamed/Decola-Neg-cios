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
  /**
   * O nome COMPLETO, montado no servidor: nome comercial + marca + conteúdo.
   *
   * As bases guardam essas três coisas em campos separados, e a creatina da
   * Integral Médica chega como nome "Creatina". Numa loja com três creatinas
   * esse nome não distingue nada — e é ele que vai para a etiqueta e para a
   * vitrine.
   */
  nome: string;
  marca: string | null;
  categoria: string | null;
  /** Texto pronto para a vitrine: o que é, marca, conteúdo, ingredientes. */
  descricao: string | null;
  /** URL pública da foto, quando existe. */
  imagem: string | null;
};

/** Sem acento, sem pontuação, minúsculo — para comparar texto de gente. */
function achatar(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * O nome do catálogo é o MESMO produto que o lojista começou a escrever?
 *
 * A regra: toda palavra do que ele digitou aparece no nome do catálogo. Quem
 * escreveu "creatina" e recebeu "Creatina Integral Medica 300 g" escreveu o
 * mesmo produto, com menos palavras — e quer as palavras que faltam.
 *
 * QUANDO NÃO BATE, NÃO SUBSTITUI. Se ele digitou "Bolo de cenoura" e o código
 * é de outra coisa, trocar o texto dele por um nome de fora seria apagar
 * trabalho por conta própria. Nesse caso a tela oferece a troca num botão, e
 * quem decide é ele.
 *
 * Texto curto demais não decide nada: "ab" aparece dentro de qualquer coisa.
 */
export function ehOMesmoProduto(digitado: string, doCatalogo: string): boolean {
  const meu = achatar(digitado);
  if (meu.length < 3) return false;

  const palavras = achatar(doCatalogo).split(' ');
  return meu.split(' ').every((p) => palavras.includes(p));
}

/**
 * O que o código de barras diz, ou `null`.
 *
 * NUNCA LANÇA. Uma consulta de conveniência que derruba a tela de cadastro
 * troca um cadastro bom por nenhum cadastro — se a busca falhar, o lojista
 * simplesmente digita o nome, que é o que ele já fazia antes disto existir.
 */
export async function consultarCatalogo(
  codigo: string,
): Promise<ProdutoDoCatalogo | 'desligada' | null> {
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

    const resposta = data as
      | { encontrado?: boolean; motivo?: string; produto?: ProdutoDoCatalogo }
      | null;

    /**
     * A CHAVE GERAL ESTÁ DESLIGADA.
     *
     * Não é o mesmo que "não achei", e a tela precisa saber a diferença: dizer
     * "não encontramos este código em base nenhuma" quando ninguém chegou a
     * procurar é mentira, e manda o lojista conferir um código que está certo.
     */
    if (resposta?.motivo === 'busca_desligada') return 'desligada';

    if (!resposta?.encontrado || !resposta.produto?.nome) return null;

    return resposta.produto;
  } catch (e) {
    console.warn('[catálogo] busca falhou:', e);
    return null;
  }
}
