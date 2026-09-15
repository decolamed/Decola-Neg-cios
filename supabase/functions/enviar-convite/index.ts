/**
 * Envio do convite de colaborador — Seção 5.2, item 3.
 *
 * "O sistema envia o convite para o e-mail informado."
 *
 * O vínculo já foi criado pela RPC `convidar_funcionario`, que validou papel,
 * limite do plano e a regra de uma empresa por usuário. Aqui só montamos e
 * despachamos a mensagem.
 *
 * Autorização: a função lê o convite com o JWT do chamador, então a RLS de
 * `empresa_usuarios` garante que ele só enxerga convites da própria empresa —
 * ninguém dispara e-mail em nome de outra empresa. A verificação de que é
 * Gestor já aconteceu na criação do vínculo.
 *
 * CONFIGURAÇÃO NECESSÁRIA (secrets do projeto):
 *   RESEND_API_KEY ....... credencial do provedor de e-mail
 *   EMAIL_REMETENTE ...... remetente verificado, ex: "Decola <nao-responda@seu-dominio>"
 *
 * O LINK DO CONVITE NÃO É MAIS CONFIGURÁVEL, e isto foi um conserto.
 *
 * Ele saía de um secret `URL_CONVITE_BASE` que ninguém tinha cadastrado, e a
 * reserva era `decolanegocios://convite/<id>` — o esquema de um aplicativo
 * NATIVO. O Decola Negócios abre no navegador; esse esquema não está registrado
 * em lugar nenhum. O resultado chegava assim ao funcionário: o botão "Aceitar
 * convite" não fazia nada, e o endereço alternativo, colado no navegador,
 * também não. Os dois caminhos que o e-mail oferece estavam mortos, e o e-mail
 * era entregue normalmente — ninguém tinha como desconfiar.
 *
 * Agora o endereço vem de `_shared/enderecos.ts`, como o do e-mail de acesso e
 * o do retorno do pagamento. É fato do repositório, versionado: não tem como
 * ficar desatualizado calado num painel que ninguém abre.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { URL_DO_SITE } from '../_shared/enderecos.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function erro(mensagem: string, status: number): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * O endereço que o funcionário vai abrir.
 *
 * `URL_CONVITE_BASE` continua sendo respeitada — um domínio próprio no futuro
 * se resolve com ela —, MAS SÓ SE FOR http(s). Foi um valor que não era um
 * endereço de navegador que criou o problema; aceitar qualquer coisa de novo
 * seria deixar a mesma porta aberta. Qualquer outra coisa é ignorada e o e-mail
 * sai com o endereço do site, que é o que funciona.
 */
function enderecoDoConvite(vinculoId: string): string {
  const configurada = Deno.env.get('URL_CONVITE_BASE')?.trim();
  const base =
    configurada && /^https?:\/\//i.test(configurada)
      ? configurada.replace(/\/+$/, '')
      : `${URL_DO_SITE}/convite`;

  if (configurada && !/^https?:\/\//i.test(configurada)) {
    console.error(
      `URL_CONVITE_BASE ignorada por não ser http(s): "${configurada}". ` +
        `Usando ${URL_DO_SITE}/convite.`,
    );
  }

  return `${base}/${vinculoId}`;
}

function montarEmail(nome: string, empresa: string, link: string): string {
  const nomeSeguro = escaparHtml(nome);
  const empresaSeguro = escaparHtml(empresa);
  // O link é o endereço do site mais um UUID do banco — hoje não tem como
  // carregar caractere perigoso. Escapado mesmo assim, porque `URL_CONVITE_BASE`
  // ainda pode sobrescrever a base e ela vem de fora.
  const linkSeguro = escaparHtml(link);

  // O botão usa amarelo sobre azul-marinho: o par acaoPrimaria/textoSobreAcao
  // do tema. Antes era o vermelho, que no tema significa ação destrutiva —
  // cor errada para um convite. (Este comentário fica FORA do template
  // literal: crase dentro dele fecharia a string.)

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#F5F6F7;font-family:Arial,Helvetica,sans-serif;color:#01395E">
    <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:24px;color:#01395E">Decola Negócios</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#F2B532">Organize. Venda. Cresça.</p>

      <p style="font-size:16px;line-height:1.5">Olá, ${nomeSeguro}!</p>
      <p style="font-size:16px;line-height:1.5">
        Você foi convidado para fazer parte da equipe de <strong>${empresaSeguro}</strong> no
        Decola Negócios.
      </p>

      <p style="margin:32px 0">
        <a href="${linkSeguro}"
           style="display:inline-block;background:#F2B532;color:#01395E;text-decoration:none;
                  padding:14px 28px;border-radius:12px;font-weight:bold;font-size:14px">
          Aceitar convite
        </a>
      </p>

      <p style="font-size:13px;line-height:1.5;color:#5A6B78">
        Se o botão não funcionar, copie e cole este endereço no navegador:<br />
        <span style="font-size:12px;word-break:break-all">${linkSeguro}</span>
      </p>

      <p style="font-size:13px;line-height:1.5;color:#5A6B78">
        O convite vale por 7 dias. Se você ainda não tem conta, crie uma usando este mesmo e-mail
        e o vínculo com a empresa acontece automaticamente.
      </p>
      <p style="font-size:13px;line-height:1.5;color:#5A6B78">
        Se não esperava este convite, é só ignorar esta mensagem.
      </p>
    </div>
  </body>
</html>`;
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = requisicao.headers.get('Authorization');
  if (!autorizacao) return erro('Autenticação necessária.', 401);

  let corpo: { vinculo_id?: string };
  try {
    corpo = await requisicao.json();
  } catch {
    return erro('Requisição inválida.', 400);
  }

  if (!corpo.vinculo_id) return erro('Informe o convite a enviar.', 400);

  // Cliente com o JWT do chamador: a RLS limita a leitura à própria empresa.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } } },
  );

  const { data: vinculo, error } = await supabase
    .from('empresa_usuarios')
    .select('id, nome_convite, email_convite, status, empresas(nome)')
    .eq('id', corpo.vinculo_id)
    .maybeSingle();

  if (error) return erro(error.message, 400);
  if (!vinculo) return erro('Convite não encontrado.', 404);
  if (vinculo.status !== 'convidado') return erro('Este convite já foi aceito.', 400);

  const chave = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('EMAIL_REMETENTE');

  if (!chave || !remetente) {
    // Falha explícita: o convite existe no banco e o Gestor pode reenviar
    // depois que o provedor estiver configurado.
    return erro(
      'O envio de e-mail ainda não está configurado no servidor. ' +
        'O convite foi criado e pode ser reenviado depois.',
      503,
    );
  }

  const link = enderecoDoConvite(vinculo.id);
  const empresa = (vinculo.empresas as { nome: string } | null)?.nome ?? 'sua empresa';

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remetente,
      to: [vinculo.email_convite],
      subject: `Convite para participar de ${empresa} no Decola Negócios`,
      html: montarEmail(vinculo.nome_convite, empresa, link),
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    console.error('Falha ao enviar convite:', detalhe);
    return erro('Não foi possível enviar o e-mail de convite. Tente reenviar.', 502);
  }

  return new Response(JSON.stringify({ enviado: true }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
