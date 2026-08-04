/**
 * Preferências de notificação — Seção 7.14, botão "Notificações".
 *
 * "liga/desliga por categoria (estoque baixo, avisos de assinatura, avisos
 * administrativos)". A preferência é do USUÁRIO, não da empresa: a política
 * `preferencias_proprias` (0007) só deixa cada um ver e alterar a própria
 * linha, e a chave primária é o `usuario_id`.
 *
 * O que a preferência controla é a ENTREGA por push (Seção 7.14: "o push é
 * complementar/best-effort, o registro no banco é a fonte confiável"). O
 * registro persistido continua sendo criado de qualquer forma — desligar o
 * aviso não apaga o alerta do sino do Dashboard.
 */
import type { Enums, PreferenciaNotificacao } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type CategoriaNotificacao = Enums['notificacao_categoria'];

/** As três categorias nomeadas literalmente na Seção 7.14. */
export const CATEGORIAS_NOTIFICACAO: {
  chave: CategoriaNotificacao;
  rotulo: string;
  descricao: string;
}[] = [
  {
    chave: 'estoque',
    rotulo: 'Estoque baixo',
    descricao: 'Avisa quando um produto atinge o percentual configurado (Seção 8.3).',
  },
  {
    chave: 'assinatura',
    rotulo: 'Avisos de assinatura',
    descricao: 'Fim do teste gratuito, pagamento pendente e mudanças de plano.',
  },
  {
    chave: 'administrativo',
    rotulo: 'Avisos administrativos',
    descricao: 'Solicitações de cancelamento de venda e mudanças na sua conta.',
  },
];

export const PREFERENCIAS_PADRAO: Record<CategoriaNotificacao, boolean> = {
  estoque: true,
  assinatura: true,
  administrativo: true,
};

/**
 * A linha só é criada quando o usuário mexe em alguma preferência; até lá
 * vale o padrão do schema (tudo ligado), e é isso que devolvemos.
 */
export async function carregarPreferencias(
  usuarioId: string,
): Promise<Record<CategoriaNotificacao, boolean>> {
  const { data, error } = await supabase
    .from('preferencias_notificacao')
    .select('*')
    .eq('usuario_id', usuarioId)
    .maybeSingle();

  if (error) throw new Error(mensagemDeErro(error));
  if (!data) return { ...PREFERENCIAS_PADRAO };

  const linha = data as PreferenciaNotificacao;
  return {
    estoque: linha.estoque,
    assinatura: linha.assinatura,
    administrativo: linha.administrativo,
  };
}

export async function salvarPreferencias(
  usuarioId: string,
  preferencias: Record<CategoriaNotificacao, boolean>,
): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('preferencias_notificacao')
    .upsert({ usuario_id: usuarioId, ...preferencias }, { onConflict: 'usuario_id' });

  if (error) throw new Error(mensagemDeErro(error));
}
