/**
 * Criação da conta do funcionário convidado — Seção 5.2, item 4.
 *
 * POR QUE ESTA FUNÇÃO EXISTE.
 *
 * O aceite do convite era o ÚNICO lugar do produto que chamava
 * `supabase.auth.signUp()` do navegador. Todo o resto — a ativação manual
 * (`admin-criar-empresa`) e a conta que nasce de um pagamento — cria o usuário
 * no servidor, com `email_confirm: true`, porque a Seção 5.5 diz que a
 * verificação de e-mail não é obrigatória para usar o app.
 *
 * Essa divergência de um lugar só custou o fluxo inteiro:
 *
 *   1. `signUp` disparava o e-mail de confirmação DO SUPABASE, em inglês e por
 *      um remetente que não é o nosso — um segundo e-mail para confirmar o
 *      MESMO endereço que acabou de receber o convite.
 *   2. Sem sessão, a tela não tinha como chamar `aceitar_convite`, e o aviso
 *      "sua conta foi criada, confirme o e-mail" saía como ERRO, em vermelho.
 *   3. O link daquele e-mail vinha com `emailRedirectTo` para a página do
 *      convite, mas esse endereço precisa estar na lista de Redirect URLs do
 *      Supabase. Não estava — e o Auth silenciosamente manda para a Site URL,
 *      que é a raiz do site, que é a PÁGINA DE PLANOS. O funcionário acabava
 *      numa tela de comprar assinatura.
 *   4. Como o aceite nunca acontecia, o login seguinte dizia "você não está
 *      vinculado a nenhuma empresa" — de novo em vermelho, sobre uma conta que
 *      existia e funcionava.
 *
 * Aqui não há nenhum sistema de autenticação novo: é o mesmo
 * `admin.auth.admin.createUser({ email_confirm: true })` de
 * `admin-criar-empresa`, e o vínculo continua sendo fechado pela RPC
 * `aceitar_convite`, no banco, sob a identidade de quem aceitou.
 *
 * O QUE ESTA FUNÇÃO NÃO FAZ, e é o que a mantém segura:
 *
 *   - NÃO aceita e-mail de quem chama. O endereço é lido do convite, no banco.
 *     Quem chama só escolhe nome e senha. Não dá para usar este endereço para
 *     criar conta num e-mail qualquer.
 *   - NÃO toca em conta que já existe. Se o e-mail do convite já tem conta, a
 *     resposta diz isso e a pessoa entra com a senha dela. Trocar a senha de
 *     uma conta existente a partir de um link seria tomada de conta.
 *   - NÃO fecha o vínculo. Quem faz isso é a RPC, com a sessão da pessoa, e é
 *     ela quem confere se o e-mail da sessão bate com o do convite.
 *
 * O QUE ISSO ASSUME, dito às claras: o UUID do convite é a credencial. Ele só
 * viaja dentro do e-mail enviado àquele endereço, vale 7 dias e serve a um
 * endereço só. É a mesma premissa que o produto já adotava ao tratar o link
 * como suficiente para entrar na equipe.
 *
 * SECRETS: SUPABASE_SERVICE_ROLE_KEY (padrão do projeto).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function erro(mensagem: string, status: number): Response {
  return responder({ error: mensagem }, status);
}

/** O mesmo mínimo que o Supabase Auth exige. Dito aqui para a mensagem ser nossa. */
const MINIMO_DA_SENHA = 6;

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return erro('Método não suportado.', 405);

  let corpo: { vinculo_id?: string; nome?: string; senha?: string };
  try {
    corpo = await requisicao.json();
  } catch {
    return erro('Requisição inválida.', 400);
  }

  const vinculoId = corpo.vinculo_id?.trim() ?? '';
  const nome = corpo.nome?.trim() ?? '';
  const senha = corpo.senha ?? '';

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vinculoId)) {
    return erro('Este link de convite não é válido.', 400);
  }
  if (!nome) return erro('Informe seu nome completo.', 400);
  if (senha.length < MINIMO_DA_SENHA) {
    return erro(`A senha precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  /**
   * O convite, por uma RPC — e não por um `select` na tabela.
   *
   * A migração 0030 tirou do `service_role` o acesso direto às tabelas de
   * plataforma, de propósito: a chave de serviço ignora RLS, e `select` em
   * `empresa_usuarios` seria a equipe inteira de todas as empresas nas mãos
   * desta função para responder uma pergunta sobre uma linha. O primeiro teste
   * desta função bateu exatamente nisso — e a resposta certa foi a 0064, uma
   * função que responde a pergunta, não uma permissão que devolve a tabela.
   */
  const { data: linhas, error: erroConvite } = await admin.rpc('convite_para_cadastro', {
    p_vinculo_id: vinculoId,
  });

  if (erroConvite) {
    console.error('aceitar-convite: leitura do convite falhou', erroConvite);
    return erro('Não foi possível verificar o convite agora. Tente novamente.', 500);
  }

  const vinculo = (linhas as
    | {
        email_convite: string;
        nome_convite: string;
        status: string;
        convite_expira_em: string;
        empresa_nome: string;
      }[]
    | null)?.[0];

  if (!vinculo) return erro('Convite não encontrado. Peça ao Gestor para reenviá-lo.', 404);

  if (vinculo.status !== 'convidado') {
    return erro('Este convite já foi aceito. Entre com seu e-mail e senha.', 409);
  }
  if (new Date(vinculo.convite_expira_em).getTime() < Date.now()) {
    return erro('Este convite expirou. Peça ao Gestor para reenviá-lo.', 410);
  }

  // O e-mail vem DO CONVITE. Nunca de quem chamou.
  const email = vinculo.email_convite.trim().toLowerCase();
  const empresa = vinculo.empresa_nome;

  /**
   * Já existe conta com este e-mail?
   *
   * `public.usuarios` é espelho de `auth.users` (gatilho `auth_usuario_criado`)
   * e é uma consulta direta, em vez de varrer a lista da Admin API.
   */
  const { data: jaTem, error: erroBusca } = await admin
    .from('usuarios')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (erroBusca) {
    console.error('aceitar-convite: consulta de usuário falhou', erroBusca);
    return erro('Não foi possível verificar este e-mail agora. Tente novamente.', 500);
  }

  if (jaTem) {
    // Não é erro: é o caminho de quem já usava o Decola. A senha dele continua
    // sendo dele — este endereço não a substitui.
    return responder({ conta_ja_existe: true, email, empresa });
  }

  const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    // Seção 5.5 — a verificação de e-mail não é obrigatória para usar o app, e
    // o convite já chegou NESTE endereço. Um segundo e-mail para confirmar o
    // mesmo endereço não prova nada que o primeiro não tenha provado.
    email_confirm: true,
    user_metadata: { nome },
  });

  if (erroCriacao || !criado?.user) {
    /**
     * Corrida: a conta nasceu entre a consulta e a criação (dois cliques, duas
     * abas). Não é falha — é o mesmo desfecho de `conta_ja_existe`.
     */
    const mensagem = erroCriacao?.message?.toLowerCase() ?? '';
    if (mensagem.includes('already') || mensagem.includes('registered')) {
      return responder({ conta_ja_existe: true, email, empresa });
    }
    console.error('aceitar-convite: createUser falhou', erroCriacao);
    return erro(erroCriacao?.message ?? 'Não foi possível criar a conta.', 400);
  }

  return responder({ conta_criada: true, email, empresa });
});
