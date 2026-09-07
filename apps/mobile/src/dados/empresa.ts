/**
 * Repositório de empresa e vínculo — Seções 5.1, 5.3, 6.6, 7.10, 7.12.
 */
import type {
  Assinatura,
  Empresa,
  EmpresaUsuario,
  MapaPermissoes,
  ResultadoCriacaoEmpresa,
  Usuario,
} from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

/**
 * Estado completo da conta do usuário logado.
 *
 * `empresa` e `assinatura` são legíveis mesmo com a conta suspensa ou em modo
 * limitado (decisão da Fase 1): é assim que o app consegue explicar ao usuário
 * POR QUE está bloqueado, em vez de mostrar uma tela vazia.
 */
export type ContextoDaConta = {
  vinculo: EmpresaUsuario;
  /** Conta do próprio usuário (Seção 7.14 — nome exibido no Perfil). */
  usuario: Usuario | null;
  empresa: Empresa;
  assinatura: Assinatura | null;
  permissoes: MapaPermissoes;
  ehGestor: boolean;
};

/**
 * Seção 7.10 — a Splash e o Login usam este resultado para decidir o destino.
 * `null` significa "sem empresa ativa vinculada", que leva ao Login com a
 * mensagem explicativa e encerramento da sessão.
 */
export async function carregarContextoDaConta(): Promise<ContextoDaConta | null> {
  /**
   * O FILTRO POR `usuario_id` NÃO É REDUNDANTE.
   *
   * A consulta antes dizia só `status = 'ativo'` e confiava na RLS para
   * devolver apenas o vínculo de quem perguntou. Isso vale para um lojista —
   * mas NÃO para o administrador da plataforma, que por desenho enxerga os
   * vínculos de todas as empresas (é disso que o painel do SaaS vive).
   *
   * O resultado era que o administrador abria o aplicativo e recebia o vínculo
   * de OUTRA PESSOA: virava "gestor" da primeira empresa da lista, entrava no
   * painel do cliente e travava na abertura, porque o banco recusava tudo o
   * que a tela pedia em seguida.
   *
   * "Qual é a minha empresa" é uma pergunta que precisa dizer de quem — a RLS
   * responde "o que você pode ver", que é outra coisa.
   */
  const { data: sessao } = await supabase.auth.getUser();
  const usuarioId = sessao.user?.id;
  if (!usuarioId) return null;

  const { data: linhaVinculo, error: erroVinculo } = await supabase
    .from('empresa_usuarios')
    .select('*, usuarios(*)')
    .eq('usuario_id', usuarioId)
    .eq('status', 'ativo')
    .maybeSingle();

  if (erroVinculo) throw new Error(mensagemDeErro(erroVinculo));
  if (!linhaVinculo) return null;

  const { usuarios, ...vinculo } = linhaVinculo as unknown as EmpresaUsuario & {
    usuarios: Usuario | null;
  };

  const [respostaEmpresa, respostaAssinatura] = await Promise.all([
    supabase.from('empresas').select('*').eq('id', vinculo.empresa_id).maybeSingle(),
    supabase
      .from('assinaturas')
      .select('*')
      .eq('empresa_id', vinculo.empresa_id)
      .neq('status', 'cancelada')
      .maybeSingle(),
  ]);

  if (respostaEmpresa.error) throw new Error(mensagemDeErro(respostaEmpresa.error));
  if (!respostaEmpresa.data) return null;

  const ehGestor = vinculo.papel === 'gestor' || vinculo.papel === 'gestor_principal';

  return {
    vinculo,
    usuario: usuarios,
    empresa: respostaEmpresa.data,
    assinatura: respostaAssinatura.data ?? null,
    // O Gestor possui todas as permissões por definição do papel (Seção 5.3);
    // o jsonb é espelho para a interface. Quem decide de fato é o banco.
    permissoes: (vinculo.permissoes ?? {}) as MapaPermissoes,
    ehGestor,
  };
}

/**
 * Destino após autenticar — Seções 7.10 e 7.12.
 *
 * A tabela da Seção 7.10 só considera o vínculo, e manda ir ao Dashboard.
 * Mas a Seção 7.12 diz que `pendente_pagamento` fica "sem acesso ao conteúdo
 * do app até a confirmação do pagamento": quem fechou o app antes de pagar
 * precisa voltar para o pagamento, não para um Dashboard que não pode usar.
 *
 * Os demais estados bloqueados (`modo_limitado`, empresa suspensa) SEGUEM
 * para o Dashboard de propósito: neles a consulta continua liberada
 * (Seção 6.6) e é lá que o app explica o bloqueio.
 */
export function destinoDaConta(conta: ContextoDaConta): '/dashboard' | '/pagamento' {
  return conta.assinatura?.status === 'pendente_pagamento' ? '/pagamento' : '/dashboard';
}

/**
 * Seção 7.12, botão "Criar conta" — passos 3 a 5.
 *
 * Uma única chamada: a RPC cria empresa, vínculo de Gestor Principal e
 * assinatura na mesma transação, revalidando tudo no servidor (aceite dos
 * termos, plano ativo, regra de uma empresa por usuário).
 */
export async function criarEmpresaEAssinatura(params: {
  nomeEmpresa: string;
  planoId: string;
  nomeUsuario: string;
  aceitouTermos: boolean;
}): Promise<ResultadoCriacaoEmpresa> {
  await exigirConexao('cadastro');

  const { data, error } = await supabase.rpc('criar_empresa_e_assinatura', {
    p_nome_empresa: params.nomeEmpresa,
    p_plano_id: params.planoId,
    p_nome_usuario: params.nomeUsuario,
    p_aceitou_termos: params.aceitouTermos,
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as ResultadoCriacaoEmpresa;
}

/**
 * Seções 3.3 e 5.4 — o vínculo e a assinatura são observados em tempo real:
 * uma mudança de permissão revoga acesso sem exigir novo login, e a virada da
 * assinatura para `ativa` após o pagamento navega sozinha (Seção 7.12).
 */
export function observarContextoDaConta(empresaId: string, aoMudar: () => void) {
  const canal = supabase
    .channel(`conta:${empresaId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'empresa_usuarios', filter: `empresa_id=eq.${empresaId}` },
      aoMudar,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'assinaturas', filter: `empresa_id=eq.${empresaId}` },
      aoMudar,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'empresas', filter: `id=eq.${empresaId}` },
      aoMudar,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(canal);
  };
}
