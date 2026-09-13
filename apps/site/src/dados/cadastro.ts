/**
 * Contratação pela web — um pedido só, feito pelo servidor.
 *
 * O QUE ESTAVA ERRADO. O cadastro fazia três passos do NAVEGADOR: cria a conta
 * no Auth, chama a RPC que cria a empresa, abre a cobrança. Os dois últimos
 * dependiam da SESSÃO que o `signUp` devolve — e o projeto está com "Confirm
 * email" ligado, então `signUp` não devolve sessão nenhuma: devolve um usuário
 * e manda um e-mail de confirmação.
 *
 * O cadastro morria ali, calado. Medido nos logs: três `/auth/v1/signup`
 * seguidos, todos com sucesso, e zero chamadas à RPC da empresa. O cliente
 * ficava preso dos dois lados — tentar de novo dizia "este e-mail já tem uma
 * conta" (o usuário ficou lá) e entrar não funcionava (a senha da contratação
 * é descartável de propósito, porque a de verdade vem por e-mail depois do
 * pagamento).
 *
 * AGORA É UM PEDIDO SÓ. A Edge Function `contratar` faz tudo com a chave de
 * serviço: cria a conta já confirmada, cria a empresa e abre a cobrança. Não
 * há sessão para depender, nem confirmação de e-mail no caminho, nem meio
 * cadastro possível — ou os três passos acontecem, ou nenhum.
 */
import { CHAVE_PUBLICA, URL_FUNCOES } from '@/lib/supabase';

const ERRO_GENERICO = 'Não foi possível concluir o cadastro. Tente novamente.';

export function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

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
