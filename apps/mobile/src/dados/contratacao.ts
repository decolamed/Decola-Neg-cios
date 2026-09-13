/**
 * Contratação pelo aplicativo — um pedido só, feito pelo servidor.
 *
 * POR QUE ESTE ARQUIVO EXISTE. O cadastro do aplicativo fazia, do próprio
 * aparelho: `signUp` → RPC que cria a empresa → pagamento. Os dois últimos
 * passos dependiam da SESSÃO que o `signUp` devolve, e o projeto está com
 * "Confirm email" ligado no Supabase Auth: `signUp` não devolve sessão nenhuma
 * — devolve um usuário e manda um e-mail de confirmação.
 *
 * O cadastro morria ali, calado. O aparelho mostrava "confirme seu e-mail", a
 * pessoa confirmava, tentava entrar, e ouvia "você não está vinculado a
 * nenhuma empresa ativa" — porque a empresa nunca chegou a existir. Sem
 * empresa não há assinatura, sem assinatura não há cobrança, e por isso nunca
 * apareceu boleto, Pix nem cartão: não havia o que cobrar.
 *
 * Medido nos logs do dia 08/09: quatro `/auth/v1/signup` seguidos, todos com
 * sucesso, e ZERO chamadas à RPC da empresa. Quatro contas ficaram nesse
 * estado.
 *
 * O SITE JÁ TINHA SIDO CONSERTADO, o aplicativo não. Era o mesmo defeito em
 * dois lugares, e consertar um só deixou o outro parecendo um problema de
 * pagamento. Agora os dois entram pela MESMA porta: a Edge Function
 * `contratar`, que faz os três passos com a chave de serviço — cria a conta já
 * confirmada, cria a empresa e abre a cobrança. Ou os três acontecem, ou
 * nenhum; não existe mais meio cadastro.
 *
 * A SENHA NÃO É ESCOLHIDA AQUI. Ela vem por e-mail depois que o pagamento é
 * confirmado, igual ao site. Pedir senha antes de existir conta utilizável foi
 * justamente o que criou a armadilha: a pessoa escolhia uma senha, guardava, e
 * ela não servia para nada.
 */
import { CHAVE_PUBLICA, URL_FUNCOES } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';

const ERRO_GENERICO = 'Não foi possível concluir o cadastro. Tente novamente.';

/**
 * Dois desfechos possíveis, e a tela precisa distinguir os dois.
 *
 * O segundo existe porque o webhook do Asaas já falhou com dinheiro real no
 * meio: o cliente pagou, o Asaas não avisou, e ao voltar o produto ia pedir
 * pagamento DE NOVO. Agora o servidor consulta a cobrança antes de abrir outra
 * — e quando ela já está paga, a resposta não é um link de pagamento, é a
 * notícia de que a conta está liberada.
 */
export type ContratacaoFeita =
  | {
      /** Checkout hospedado do Asaas, onde o cliente escolhe como pagar. */
      url_checkout: string;
      valor: number;
      vencimento: string;
      ja_pago?: false;
    }
  | { ja_pago: true; mensagem: string };

export async function contratar(dados: {
  nome: string;
  email: string;
  nomeEmpresa: string;
  planoSlug: string;
  aceitouTermos: boolean;
  /**
   * CPF ou CNPJ do responsável. O Asaas recusa emitir cobrança sem ele — e a
   * recusa chegava à tela como "Para criar esta cobrança é necessário preencher
   * o CPF ou CNPJ do cliente", depois de a conta já ter sido criada.
   */
  cpfCnpj: string;
}): Promise<ContratacaoFeita> {
  await exigirConexao('cadastro');

  let resposta: Response;

  try {
    resposta = await fetch(`${URL_FUNCOES}/contratar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CHAVE_PUBLICA,
        Authorization: `Bearer ${CHAVE_PUBLICA}`,
      },
      body: JSON.stringify(dados),
    });
  } catch {
    throw new Error(
      'Não conseguimos falar com o servidor. Verifique sua internet e tente de novo.',
    );
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | { url_checkout?: string; valor?: number; vencimento?: string; ja_pago?: boolean;
        mensagem?: string; error?: string }
    | null;

  // A função devolve mensagens já escritas para o cliente — inclusive as que
  // explicam que a conta foi criada mas o pagamento não abriu. Repassar é
  // melhor do que trocar por um texto genérico que esconde o que aconteceu.
  if (!resposta.ok) throw new Error(corpo?.error ?? ERRO_GENERICO);

  // Já pago: o servidor consultou a cobrança no Asaas, achou-a paga e liberou a
  // conta. Não há checkout para abrir — há uma notícia para dar.
  if (corpo?.ja_pago) {
    return { ja_pago: true, mensagem: corpo.mensagem ?? 'Sua conta já está liberada.' };
  }

  if (!corpo?.url_checkout) throw new Error(ERRO_GENERICO);

  return {
    url_checkout: corpo.url_checkout,
    valor: Number(corpo.valor ?? 0),
    vencimento: corpo.vencimento ?? '',
  };
}
