/**
 * E-mail de acesso — primeiro acesso e redefinição de senha.
 *
 * POR QUE ESTA FUNÇÃO EXISTE, EM VEZ DO E-MAIL DO SUPABASE AUTH
 *
 * O Auth envia esses e-mails sozinho, mas com três amarras que só se soltam
 * no painel do Supabase, e que — medido nos logs — não estavam valendo:
 * remetente `noreply@mail.app.supabase.io`, corpo em inglês, e um teto baixo
 * de envios por hora. Enquanto isso dependesse de configuração externa, o
 * produto não tinha como garantir o próprio e-mail.
 *
 * Aqui o servidor faz as duas coisas por conta própria:
 *
 *   1. `generateLink` cria o token de recuperação SEM disparar e-mail. Do
 *      resultado interessa `hashed_token`.
 *   2. O link montado aponta para o NOSSO site, não para o endpoint do
 *      Supabase — o que também tira da frente a lista de Redirect URLs, já
 *      que não há redirecionamento do Auth envolvido. A página troca o token
 *      por sessão com `verifyOtp`.
 *
 * SEGREDO NENHUM VAZA NA RESPOSTA. Quem chama recebe sempre `{enviado:true}`,
 * exista a conta ou não: responder diferente transformaria o endpoint num
 * verificador de quais e-mails têm cadastro.
 *
 * DOIS DOMÍNIOS, PAPÉIS DIFERENTES. O remetente sai de `decola.pro`, domínio
 * comprado e verificado no Resend. Já o LINK dentro do e-mail aponta para o
 * site na Vercel — link de e-mail é clicado em minutos e expira sozinho, então
 * trocar o remetente um dia não deixa ninguém na mão; link de loja e de
 * cadastro o cliente salva e reusa, e esse não pode depender de renovação
 * anual.
 *
 * O ENDEREÇO DO SITE NÃO É MAIS SECRET. Era, e isso custou caro: um valor
 * antigo guardado no painel manda todo mundo para o lugar errado, e nada no
 * código denuncia — o link sai bonito e quebrado. Onde publicamos é fato do
 * repositório, não configuração de ambiente. Mudou o endereço? Muda esta
 * constante e republica, num lugar só, com histórico.
 *
 * SECRETS: RESEND_API_KEY, EMAIL_REMETENTE, SUPABASE_SERVICE_ROLE_KEY (do
 * projeto).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/** Onde o site público está publicado. Ver a nota acima sobre não ser secret. */
const URL_DO_SITE = 'https://site-kappa-five-66.vercel.app';

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

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type Tipo = 'primeiro_acesso' | 'recuperacao';

/**
 * Um corpo só, com as palavras trocadas conforme o motivo.
 *
 * Tabela e estilo inline porque Gmail e Outlook descartam `<style>` no
 * `<head>`; `max-width` com largura fluida é o que mantém legível no celular.
 * As cores são as de `packages/theme`, copiadas à mão — não há como importar
 * TypeScript aqui dentro.
 */
function montarEmail(tipo: Tipo, nome: string, link: string): { assunto: string; html: string } {
  const primeiro = tipo === 'primeiro_acesso';
  const nomeSeguro = escaparHtml(nome || 'tudo bem?');
  const linkSeguro = escaparHtml(link);

  const assunto = primeiro
    ? 'Seu acesso ao Decola Negócios'
    : 'Criar uma nova senha — Decola Negócios';

  const titulo = primeiro ? 'Bem-vindo ao Decola Negócios' : 'Criar uma nova senha';

  const explicacao = primeiro
    ? 'Sua conta foi criada. Para começar a usar, defina a senha que você vai usar para entrar.'
    : 'Recebemos um pedido para criar uma nova senha da sua conta. Se foi você, use o botão abaixo.';

  const rotuloBotao = primeiro ? 'Definir minha senha' : 'Criar nova senha';

  const rodape = primeiro
    ? 'Se você não esperava este e-mail, pode ignorá-lo com segurança.'
    : 'Se você não pediu isso, ignore esta mensagem — sua senha continua a mesma. ' +
      'Ninguém consegue alterá-la sem abrir o link acima.';

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#F5F6F7;font-family:Arial,Helvetica,sans-serif;color:#01395E">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;width:100%;background:#FFFFFF;border-radius:12px">
          <tr><td style="padding:32px">

            <h1 style="margin:0 0 4px;font-size:24px;color:#01395E">Decola Negócios</h1>
            <p style="margin:0 0 28px;font-size:12px;color:#F2B532;letter-spacing:.08em;text-transform:uppercase">
              Organize. Venda. Cresça.
            </p>

            <h2 style="margin:0 0 16px;font-size:19px;color:#01395E">${escaparHtml(titulo)}</h2>

            <p style="margin:0 0 12px;font-size:16px;line-height:1.5">Olá, ${nomeSeguro}</p>
            <p style="margin:0 0 28px;font-size:16px;line-height:1.5">${escaparHtml(explicacao)}</p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-radius:12px;background:#F2B532">
                <a href="${linkSeguro}"
                   style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;
                          color:#01395E;text-decoration:none">${escaparHtml(rotuloBotao)}</a>
              </td></tr>
            </table>

            <p style="margin:28px 0 0;font-size:13px;line-height:1.5;color:#5A6B78">
              O link vale por 1 hora e só pode ser usado uma vez. Se o botão não funcionar,
              copie e cole este endereço no navegador:
            </p>
            <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#5A6B78;word-break:break-all">
              ${linkSeguro}
            </p>

            <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E1E5E8;
                      font-size:13px;line-height:1.5;color:#5A6B78">${escaparHtml(rodape)}</p>

          </td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#5A6B78">
          Decola Negócios — gestão para pequenos e médios negócios
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { assunto, html };
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return responder({ error: 'Método não suportado.' }, 405);

  let corpo: { email?: string; tipo?: Tipo };
  try {
    corpo = await requisicao.json();
  } catch {
    return responder({ error: 'Requisição inválida.' }, 400);
  }

  const email = corpo.email?.trim().toLowerCase() ?? '';
  const tipo: Tipo = corpo.tipo === 'primeiro_acesso' ? 'primeiro_acesso' : 'recuperacao';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return responder({ error: 'Informe um e-mail válido.' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Freio antes de qualquer trabalho: sem ele, o endpoint vira ferramenta para
  // encher a caixa de entrada de terceiros.
  const { data: liberado, error: erroFreio } = await admin.rpc('registrar_envio_de_acesso', {
    p_email: email,
  });

  if (erroFreio) {
    console.error('enviar-acesso: freio falhou', erroFreio);
    return responder({ error: 'Não foi possível enviar agora. Tente de novo em instantes.' }, 500);
  }

  if (!liberado) {
    // Resposta honesta e específica: quem acabou de pedir sabe que pediu.
    return responder(
      { error: 'Já enviamos um e-mail há poucos instantes. Verifique sua caixa de entrada.' },
      429,
    );
  }

  const chave = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('EMAIL_REMETENTE');

  if (!chave || !remetente) {
    console.error('enviar-acesso: RESEND_API_KEY ou EMAIL_REMETENTE ausente');
    return responder({ error: 'O envio de e-mail ainda não está configurado no servidor.' }, 503);
  }

  const { data: gerado, error: erroLink } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
  });

  // Conta inexistente cai aqui. A resposta é a mesma do sucesso, de propósito.
  if (erroLink || !gerado?.properties?.hashed_token) {
    return responder({ enviado: true });
  }

  const link =
    `${URL_DO_SITE}/definir-senha` +
    `?token=${encodeURIComponent(gerado.properties.hashed_token)}` +
    `&tipo=${tipo === 'primeiro_acesso' ? 'primeiro' : 'nova'}`;

  const nome =
    (gerado.user?.user_metadata?.nome as string | undefined) ??
    (gerado.user?.user_metadata?.full_name as string | undefined) ??
    '';

  const { assunto, html } = montarEmail(tipo, nome, link);

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: remetente, to: [email], subject: assunto, html }),
  });

  if (!resposta.ok) {
    console.error('enviar-acesso: Resend recusou', await resposta.text());
    return responder({ error: 'Não foi possível enviar o e-mail. Tente novamente.' }, 502);
  }

  return responder({ enviado: true });
});
