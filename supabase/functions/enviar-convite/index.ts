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
 *   URL_CONVITE_BASE ..... base do link de aceite. Sem ela, cai no esquema do
 *                          app (decolanegocios://convite/<id>), que funciona no
 *                          dispositivo mas é bloqueado por vários webmails —
 *                          o ideal é apontar para uma página web que redirecione.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

function montarEmail(nome: string, empresa: string, link: string): string {
  const nomeSeguro = escaparHtml(nome);
  const empresaSeguro = escaparHtml(empresa);
  // O link vem de um secret nosso mais um UUID do banco, então hoje não tem
  // como carregar caractere perigoso. Escapar mesmo assim: o dia em que a
  // base virar algo configurável, este ponto não precisa ser lembrado.
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

  const base = Deno.env.get('URL_CONVITE_BASE') ?? 'decolanegocios://convite';
  const link = `${base.replace(/\/$/, '')}/${vinculo.id}`;
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
