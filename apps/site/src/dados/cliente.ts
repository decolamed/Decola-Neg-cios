/**
 * O cliente identificado pelo telefone, dentro de UMA loja.
 *
 * O QUE MUDOU, E O QUE ISSO CUSTA — dito aqui porque é a decisão mais
 * importante deste arquivo.
 *
 * Antes, ver os pedidos por telefone exigia um código por SMS: o Supabase Auth
 * confirmava o número e a consulta lia o telefone de dentro do token. Era
 * seguro e estava DESLIGADO, porque SMS é serviço pago por mensagem — na
 * prática, a tela só sabia dizer "o envio por SMS ainda não está ligado nesta
 * loja", que é o erro que o lojista via.
 *
 * Agora a identificação é só o número digitado, por decisão de produto. O preço
 * é real e não adianta disfarçar: QUEM SOUBER O TELEFONE DE OUTRA PESSOA VÊ OS
 * PEDIDOS DELA naquela loja, endereço de entrega incluído. Não há verificação.
 *
 * O QUE CONTINUA PROTEGIDO é a separação entre lojas. A consulta exige o slug e
 * é presa a ele no banco (`vitrine_pedidos_do_telefone`), então um número
 * conhecido numa loja não abre as outras. Cada lojista expõe o que é dele.
 *
 * O CAMINHO SEM DIGITAR NADA CONTINUA SENDO O PRINCIPAL: os pedidos feitos
 * neste aparelho aparecem sozinhos, guardados no próprio navegador. Digitar o
 * telefone é o degrau de quem trocou de celular ou limpou o navegador.
 */
import { supabase } from '@/lib/supabase';
import { itensDoCarrinho, salvarCarrinho, type ItemCarrinho } from '@/dados/carrinho';

const CHAVE = 'decola-cliente';

/* ==================================================== o número em si ==== */

/**
 * O telefone reduzido a dígitos com o código do país — a MESMA forma que o
 * banco usa em `app.telefone_comparavel`.
 *
 * Tem de ser a mesma, senão o que foi digitado no checkout ("(81) 99999-9999")
 * nunca casa com o que foi digitado aqui ("81999999999") e a busca devolve
 * vazio sem ninguém entender por quê. `null` quando não é um telefone
 * brasileiro plausível.
 */
export function telefoneNormalizado(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, '');
  if (digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith('55')) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return null;
}

/** "(81) 99999-9999", a partir do número guardado. */
export function telefoneFormatado(normalizado: string): string {
  const semPais = normalizado.startsWith('55') ? normalizado.slice(2) : normalizado;
  if (semPais.length === 11) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 3)} ${semPais.slice(3, 7)}-${semPais.slice(7)}`;
  }
  if (semPais.length === 10) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  }
  return normalizado;
}

/* ============================================ quem está identificado ==== */

type Guardado = Record<string, string>;

function ler(): Guardado {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const dados = bruto ? (JSON.parse(bruto) as Guardado) : {};
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

const EVENTO = 'decola:cliente';

/**
 * POR LOJA, e não uma identidade só.
 *
 * A chave inclui o slug de propósito: a separação entre lojas não é só uma
 * regra do banco, é como a coisa é guardada aqui também. Quem se identifica na
 * padaria não fica identificado na loja de celulares — nem nesta aba.
 */
export function clienteDaLoja(slug: string): string | null {
  return ler()[slug.toLowerCase()] ?? null;
}

export function observarCliente(aoMudar: () => void): () => void {
  document.addEventListener(EVENTO, aoMudar);
  return () => document.removeEventListener(EVENTO, aoMudar);
}

function guardar(slug: string, telefone: string | null): void {
  try {
    const dados = ler();
    if (telefone) dados[slug.toLowerCase()] = telefone;
    else delete dados[slug.toLowerCase()];
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    /* aba anônima: a identificação vale só enquanto a página estiver aberta. */
  }
  if (typeof document !== 'undefined') document.dispatchEvent(new Event(EVENTO));
}

export function esquecerCliente(slug: string): void {
  guardar(slug, null);
}

/* ================================================== pedidos e carrinho == */

export type PedidoDoCliente = {
  numero: number;
  token: string;
  status: string;
  modalidade: 'retirada' | 'entrega';
  pagamento: 'pix_online' | 'na_retirada' | 'a_combinar';
  subtotal: number;
  criado_em: string;
  loja_nome: string;
  loja_slug: string;
  itens: number;
};

export async function pedidosDoTelefone(
  slug: string,
  telefone: string,
): Promise<PedidoDoCliente[]> {
  const { data, error } = await supabase.rpc('vitrine_pedidos_do_telefone', {
    p_loja_slug: slug,
    p_telefone: telefone,
  });

  if (error) {
    // 22023 é a recusa proposital do banco quando falta loja ou telefone — e
    // não deveria chegar aqui, porque o número já foi conferido antes.
    if (error.code === '22023') throw new Error('Informe um celular com DDD.');
    throw new Error('Não foi possível buscar seus pedidos agora. Tente de novo.');
  }

  return (data as unknown as PedidoDoCliente[]) ?? [];
}

/** Manda o carrinho deste aparelho para a conta do telefone, naquela loja. */
export async function enviarCarrinho(
  slug: string,
  telefone: string,
  itens: ItemCarrinho[],
): Promise<void> {
  const { error } = await supabase.rpc('vitrine_carrinho_gravar', {
    p_loja_slug: slug,
    p_telefone: telefone,
    p_itens: itens.map((i) => ({ produto_id: i.produtoId, quantidade: i.quantidade })),
  });
  // Guardar o carrinho é conveniência, não parte da compra: uma falha aqui não
  // pode virar erro na tela de quem está escolhendo produto.
  if (error) console.warn('[cliente] carrinho não sincronizado:', error.message);
}

async function lerCarrinhoGuardado(slug: string, telefone: string): Promise<ItemCarrinho[]> {
  const { data, error } = await supabase.rpc('vitrine_carrinho_ler', {
    p_loja_slug: slug,
    p_telefone: telefone,
  });
  if (error) return [];

  const bruto = (data ?? []) as unknown as { produto_id?: string; quantidade?: number }[];
  return bruto
    .filter((i) => typeof i.produto_id === 'string' && Number(i.quantidade) > 0)
    .map((i) => ({ produtoId: i.produto_id as string, quantidade: Number(i.quantidade) }));
}

/**
 * Identifica o cliente e traz de volta o que é dele nesta loja.
 *
 * O CARRINHO É JUNTADO, NÃO SUBSTITUÍDO. Quem tinha três itens neste aparelho e
 * dois guardados na conta fica com os cinco. Trocar um pelo outro faria alguém
 * perder produtos que acabou de escolher — e a pessoa não teria como saber que
 * isso ia acontecer ao digitar o telefone. Onde o mesmo produto aparece dos
 * dois lados, vale a maior quantidade, que é a intenção mais recente e mais
 * fácil de desfazer (é só diminuir).
 *
 * Telefone que ainda não existe naquela loja NÃO É ERRO: é uma pessoa nova. A
 * identificação vale do mesmo jeito, e o que ela comprar a partir de agora
 * passa a ficar guardado.
 */
export async function identificarCliente(
  slug: string,
  digitado: string,
): Promise<{ telefone: string; pedidos: PedidoDoCliente[] }> {
  const telefone = telefoneNormalizado(digitado);
  if (!telefone) {
    throw new Error('Informe um celular com DDD, como (81) 99999-9999.');
  }

  const [pedidos, guardado] = await Promise.all([
    pedidosDoTelefone(slug, telefone),
    lerCarrinhoGuardado(slug, telefone),
  ]);

  const local = itensDoCarrinho(slug);
  if (guardado.length > 0 || local.length > 0) {
    const juntos = new Map<string, number>();
    for (const item of guardado) juntos.set(item.produtoId, item.quantidade);
    for (const item of local) {
      juntos.set(item.produtoId, Math.max(juntos.get(item.produtoId) ?? 0, item.quantidade));
    }
    const final = [...juntos].map(([produtoId, quantidade]) => ({ produtoId, quantidade }));
    salvarCarrinho(slug, final);
    await enviarCarrinho(slug, telefone, final);
  }

  guardar(slug, telefone);
  return { telefone, pedidos };
}
