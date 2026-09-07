/**
 * Repositório de autenticação — Seções 5.5, 7.11, 7.12.
 *
 * Camada de serviço isolada (Seção 3.1): nenhuma tela fala com o Supabase
 * diretamente. Todas as mensagens de erro voltam já no texto que a
 * especificação define, para que a tela apenas exiba.
 */
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';

/** Seção 7.11 — mensagem genérica de propósito: não revela se o e-mail existe. */
export const ERRO_CREDENCIAIS = 'E-mail ou senha incorretos.';
export const ERRO_ENTRAR_GENERICO = 'Não foi possível entrar. Tente novamente.';
export const ERRO_CADASTRO_GENERICO = 'Não foi possível criar sua conta. Tente novamente.';
export const ERRO_EMAIL_EM_USO = 'Este e-mail já possui uma conta. Faça login.';

/** Seção 7.10 — usuário autenticado que não pertence a nenhuma empresa ativa. */
export const AVISO_SEM_EMPRESA =
  'Você não está vinculado a nenhuma empresa ativa no momento. ' +
  'Entre em contato com o Gestor da sua empresa, ou crie uma nova conta.';

/**
 * Quem entrou é administrador da PLATAFORMA, e não cliente?
 *
 * A pergunta existe porque painel e aplicativo passaram a dividir a sessão do
 * navegador. Sem ela, o administrador que abre o aplicativo cai no caminho de
 * "conta sem empresa" — que encerra a sessão — e derruba o próprio painel de
 * onde acabou de vir.
 *
 * A RLS de `administradores_plataforma` só deixa cada administrador enxergar a
 * própria linha, então esta consulta é segura para qualquer conta: um cliente
 * simplesmente não recebe nada.
 */
export async function ehAdministradorDaPlataforma(): Promise<boolean> {
  const { data } = await supabase
    .from('administradores_plataforma')
    .select('id')
    .maybeSingle();

  return Boolean(data);
}

export class ErroAutenticacao extends Error {}

export function emailValido(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

export async function sessaoAtual(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);
  return data.session;
}

export function observarSessao(aoMudar: (sessao: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => aoMudar(sessao));
  return () => data.subscription.unsubscribe();
}

/**
 * Seção 7.11 — Entrar.
 * Validação: e-mail em formato válido, senha não vazia (Seção 5.5 — sem
 * exigência de complexidade).
 */
export async function entrarComSenha(email: string, senha: string): Promise<Session> {
  await exigirConexao('login');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });

  if (error) {
    // Credenciais inválidas E conta inexistente retornam a MESMA mensagem,
    // por segurança (Seção 7.11, tratamento de erros).
    const credenciais =
      error.status === 400 ||
      error.message.toLowerCase().includes('invalid login credentials') ||
      error.message.toLowerCase().includes('email not confirmed');

    throw new ErroAutenticacao(credenciais ? ERRO_CREDENCIAIS : ERRO_ENTRAR_GENERICO);
  }

  if (!data.session) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);
  return data.session;
}

/**
 * Seção 7.12 — criação da conta com e-mail e senha.
 *
 * A verificação de e-mail não é obrigatória antes do primeiro acesso
 * (Seção 5.5), então o Supabase deve retornar sessão imediatamente. Se o
 * projeto estiver com "Confirm email" ligado, não há sessão e o cadastro não
 * pode continuar — o erro abaixo deixa isso explícito em vez de falhar de
 * forma obscura na criação da empresa.
 */
export async function cadastrarComSenha(
  nome: string,
  email: string,
  senha: string,
): Promise<Session> {
  await exigirConexao('cadastro');

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password: senha,
    options: { data: { nome: nome.trim() } },
  });

  if (error) {
    const jaExiste =
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('user already exists');
    throw new ErroAutenticacao(jaExiste ? ERRO_EMAIL_EM_USO : ERRO_CADASTRO_GENERICO);
  }

  // O Supabase oculta e-mails já cadastrados devolvendo um usuário sem
  // identidades em vez de um erro. É o sinal de duplicidade da Seção 7.12.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new ErroAutenticacao(ERRO_EMAIL_EM_USO);
  }

  if (!data.session) {
    throw new ErroAutenticacao(
      'Sua conta foi criada, mas é necessário confirmar o e-mail antes de continuar. ' +
        'Verifique sua caixa de entrada e faça login.',
    );
  }

  return data.session;
}

/**
 * Seção 7.11 — Entrar com Google (único provedor social da V1; Apple ficou
 * fora, Seção 7.11).
 */
export async function entrarComGoogle(): Promise<Session> {
  await exigirConexao('login');

  const redirecionamento = Linking.createURL('/');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirecionamento, skipBrowserRedirect: true },
  });

  if (error || !data.url) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirecionamento);

  if (resultado.type !== 'success') {
    // Cancelamento pelo usuário não é erro — a tela apenas volta ao estado
    // anterior, sem mensagem.
    throw new ErroAutenticacao('');
  }

  const codigo = new URL(resultado.url).searchParams.get('code');
  if (!codigo) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);

  const troca = await supabase.auth.exchangeCodeForSession(codigo);
  if (troca.error || !troca.data.session) throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);

  return troca.data.session;
}

/** Seção 7.11 — Esqueci minha senha. O e-mail sai pelo Decola, não pelo Auth. */
export async function enviarLinkDeRecuperacao(email: string): Promise<void> {
  await exigirConexao('login');

  // Pela Edge Function, e não por `resetPasswordForEmail`: é o que garante o
  // remetente do Decola, o texto em português e um link que abre no site —
  // e não um e-mail do Supabase apontando para uma rota do Auth.
  const resposta = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/enviar-acesso`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ email: email.trim(), tipo: 'recuperacao' }),
    },
  );

  // 429 é o freio de repetição e tem mensagem própria — vale mostrar.
  if (resposta.status === 429) {
    const corpo = await resposta.json().catch(() => null);
    throw new ErroAutenticacao(corpo?.error ?? ERRO_ENTRAR_GENERICO);
  }

  // Nos demais casos a tela mostra a mesma confirmação, com conta ou sem —
  // não revelamos quais e-mails estão cadastrados (Seção 7.11).
  if (!resposta.ok && resposta.status !== 400) {
    throw new ErroAutenticacao(ERRO_ENTRAR_GENERICO);
  }
}

const LINK_INVALIDO =
  'Este link de redefinição expirou ou já foi usado. Peça um novo em "Esqueci minha senha".';

/**
 * Lê os parâmetros de um link de retorno, venham eles na query (`?a=b`) ou no
 * fragmento (`#a=b`).
 *
 * O fragmento importa: `useLocalSearchParams` do expo-router não o enxerga, e
 * é justamente ali que o fluxo implícito entrega os tokens.
 */
function parametrosDoLink(url: string): Record<string, string> {
  const parametros: Record<string, string> = {};

  const depoisDaInterrogacao = url.split('?')[1]?.split('#')[0];
  const depoisDaCerquilha = url.split('#')[1];

  for (const trecho of [depoisDaInterrogacao, depoisDaCerquilha]) {
    if (!trecho) continue;
    for (const par of trecho.split('&')) {
      const [chave, valor] = par.split('=');
      if (chave) parametros[decodeURIComponent(chave)] = decodeURIComponent(valor ?? '');
    }
  }

  return parametros;
}

/**
 * Abre a sessão a partir do link de redefinição recebido por e-mail.
 *
 * Recebe a URL inteira, e não só um código, porque o link pode chegar em duas
 * formas — e as duas são legítimas, vindas de origens diferentes:
 *
 *   ?code=…                    PKCE. Quem pediu foi este app, e o segredo da
 *                              troca está no AsyncStorage deste dispositivo.
 *
 *   #access_token=&refresh_token=   Implícito. Quem pediu foi o servidor: o
 *                              Painel Administrativo ("Enviar link de acesso")
 *                              ou a criação manual de empresa. Aí não existe
 *                              segredo local nenhum para trocar, e os tokens
 *                              vêm prontos.
 *
 * Tratar só a primeira deixava o responsável criado pelo painel sem caminho
 * nenhum para definir a senha pelo aplicativo.
 */
export async function abrirSessaoDeRecuperacao(url: string): Promise<void> {
  await exigirConexao('login');

  const parametros = parametrosDoLink(url);

  if (parametros.access_token && parametros.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: parametros.access_token,
      refresh_token: parametros.refresh_token,
    });
    if (error) throw new ErroAutenticacao(LINK_INVALIDO);
    return;
  }

  if (parametros.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(parametros.code);
    if (error) throw new ErroAutenticacao(LINK_INVALIDO);
    return;
  }

  // O Supabase devolve o motivo no próprio link quando recusa o token.
  if (parametros.error || parametros.error_description) {
    throw new ErroAutenticacao(LINK_INVALIDO);
  }

  throw new ErroAutenticacao(
    'Abra esta tela pelo link que enviamos por e-mail — é ele que autoriza a troca de senha.',
  );
}

/**
 * Define a senha de quem chegou pelo link de recuperação.
 *
 * Diferente de `alterarSenha`, aqui não há senha atual para conferir: quem
 * chegou até este ponto já provou identidade pelo e-mail. Por isso a função é
 * separada — para que a checagem da senha atual nunca seja pulada por engano
 * no fluxo normal de troca (Seção 7.14).
 */
export async function definirNovaSenha(novaSenha: string): Promise<void> {
  await exigirConexao();

  const { data: sessao } = await supabase.auth.getSession();
  if (!sessao.session) {
    throw new ErroAutenticacao(
      'Este link de redefinição expirou. Peça um novo em "Esqueci minha senha".',
    );
  }

  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    throw new ErroAutenticacao('Não foi possível definir sua senha. Tente novamente.');
  }
}

/**
 * Seção 7.14 — Alterar senha ("senha atual + nova"). A Seção 5.5 não exige
 * complexidade: só não pode ser vazia.
 *
 * O Supabase troca a senha sem pedir a atual, então conferimos a atual
 * reautenticando antes. Sem isso, um aparelho desbloqueado com a sessão aberta
 * trocaria a senha da conta sem nenhuma prova de identidade.
 */
export async function alterarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
  await exigirConexao();

  const { data: sessao } = await supabase.auth.getSession();
  const email = sessao.session?.user.email;
  if (!email) throw new ErroAutenticacao('Sessão expirada. Entre novamente.');

  const conferencia = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
  if (conferencia.error) throw new ErroAutenticacao('A senha atual está incorreta.');

  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    throw new ErroAutenticacao('Não foi possível alterar sua senha. Tente novamente.');
  }
}

export async function sair(): Promise<void> {
  await supabase.auth.signOut();
}
