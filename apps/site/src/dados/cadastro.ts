/**
 * Contratação pela web — Seção 7.12, agora sem depender do aplicativo.
 *
 * Os passos e a ordem são exatamente os do app (`apps/mobile/app/cadastro.tsx`):
 * cria a conta no Auth, e só então chama a RPC que cria empresa, vínculo de
 * Gestor Principal e assinatura numa transação só. Quem decide se pode é o
 * banco — esta camada não valida limite de plano nem aceite de termos por
 * conta própria, porque a RPC revalida tudo de qualquer forma.
 */
import type { ResultadoCriacaoEmpresa } from '@decola/types';
import { CHAVE_PUBLICA, URL_FUNCOES, supabase } from '@/lib/supabase';

export const ERRO_EMAIL_EM_USO =
  'Este e-mail já tem uma conta. Entre pelo aplicativo ou use "Esqueci minha senha".';

const ERRO_GENERICO = 'Não foi possível concluir o cadastro. Tente novamente.';

export function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

/** Passo 2 da Seção 7.12 — a conta no Supabase Auth. */
export async function criarConta(nome: string, email: string, senha: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { nome: nome.trim() } },
  });

  if (error) {
    const jaExiste =
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('user already exists');
    throw new Error(jaExiste ? ERRO_EMAIL_EM_USO : ERRO_GENERICO);
  }

  // O Supabase esconde e-mail já cadastrado devolvendo usuário sem
  // identidades, em vez de erro. É o sinal de duplicidade da Seção 7.12.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error(ERRO_EMAIL_EM_USO);
  }

  // Sem sessão, os passos seguintes rodariam como anônimo e a RPC recusaria.
  // Dizer isso aqui evita um erro obscuro dois passos adiante.
  if (!data.session) {
    throw new Error(
      'Sua conta foi criada, mas é preciso confirmar o e-mail antes de continuar. ' +
        'Verifique sua caixa de entrada.',
    );
  }
}

/** Passos 3 a 5 — empresa, vínculo e assinatura, numa transação só. */
export async function criarEmpresaEAssinatura(params: {
  nomeEmpresa: string;
  planoId: string;
  nomeUsuario: string;
  aceitouTermos: boolean;
}): Promise<ResultadoCriacaoEmpresa> {
  const { data, error } = await supabase.rpc('criar_empresa_e_assinatura', {
    p_nome_empresa: params.nomeEmpresa.trim(),
    p_plano_id: params.planoId,
    p_nome_usuario: params.nomeUsuario.trim(),
    p_aceitou_termos: params.aceitouTermos,
  });

  if (error) throw new Error(error.message || ERRO_GENERICO);
  return data as unknown as ResultadoCriacaoEmpresa;
}

export type CheckoutIniciado = { url: string };

/**
 * Seções 6.4 e 7.12 — a cobrança nasce no backend e o site recebe só a URL do
 * checkout hospedado. A chave da API do Asaas vive no secret da Edge Function
 * e nunca chega ao navegador.
 */
export async function iniciarCheckout(): Promise<CheckoutIniciado> {
  const { data: sessao } = await supabase.auth.getSession();
  const token = sessao.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente para concluir o pagamento.');

  const resposta = await fetch(`${URL_FUNCOES}/asaas-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: CHAVE_PUBLICA,
    },
    body: JSON.stringify({}),
  });

  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new Error(corpo?.error ?? 'Não foi possível iniciar o pagamento. Tente novamente.');
  }

  return corpo as CheckoutIniciado;
}
