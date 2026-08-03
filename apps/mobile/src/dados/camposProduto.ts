/**
 * Repositório de campos personalizáveis de produto — Seções 4.5, 4.6.
 *
 * O catálogo (`campos_produto_disponiveis`) traz os campos padrão do sistema
 * (empresa_id nulo) e os criados pela própria empresa. A configuração
 * (`empresa_campos_produto`) diz quais estão ativos, quais são obrigatórios e
 * em que ordem aparecem.
 */
import type { Enums, Json } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type TipoCampo = Enums['tipo_campo'];

export type CampoDoCatalogo = {
  id: string;
  chave: string;
  nome_exibicao: string;
  tipo_campo: TipoCampo;
  opcoes: string[] | null;
  /** Nulo = campo padrão do sistema; preenchido = criado pela empresa. */
  empresa_id: string | null;
};

export type CampoConfigurado = CampoDoCatalogo & {
  ativo: boolean;
  obrigatorio: boolean;
  ordem: number;
};

type LinhaConfig = {
  campo_id: string;
  ativo: boolean;
  obrigatorio: boolean;
  ordem: number;
};

function normalizarOpcoes(opcoes: Json | null): string[] | null {
  if (!Array.isArray(opcoes)) return null;
  return opcoes.filter((o): o is string => typeof o === 'string');
}

/**
 * Catálogo completo com a configuração da empresa aplicada — é o que a tela de
 * Configurações → Cadastro de produtos exibe (Seção 4.6).
 */
export async function listarCamposConfiguraveis(empresaId: string): Promise<CampoConfigurado[]> {
  const [catalogo, config] = await Promise.all([
    supabase
      .from('campos_produto_disponiveis')
      .select('id, chave, nome_exibicao, tipo_campo, opcoes, empresa_id')
      .order('nome_exibicao', { ascending: true }),
    supabase
      .from('empresa_campos_produto')
      .select('campo_id, ativo, obrigatorio, ordem')
      .eq('empresa_id', empresaId),
  ]);

  if (catalogo.error) throw new Error(mensagemDeErro(catalogo.error));
  if (config.error) throw new Error(mensagemDeErro(config.error));

  const porCampo = new Map<string, LinhaConfig>(
    (config.data ?? []).map((linha) => [linha.campo_id, linha as LinhaConfig]),
  );

  return (catalogo.data ?? [])
    .map((campo) => {
      const atual = porCampo.get(campo.id);
      return {
        id: campo.id,
        chave: campo.chave,
        nome_exibicao: campo.nome_exibicao,
        tipo_campo: campo.tipo_campo as TipoCampo,
        opcoes: normalizarOpcoes(campo.opcoes),
        empresa_id: campo.empresa_id,
        ativo: atual?.ativo ?? false,
        obrigatorio: atual?.obrigatorio ?? false,
        ordem: atual?.ordem ?? 999,
      };
    })
    .sort((a, b) => a.ordem - b.ordem || a.nome_exibicao.localeCompare(b.nome_exibicao));
}

/**
 * Campos que o formulário de produto deve renderizar — só os ativos, na ordem
 * configurada. Um campo desativado some do cadastro para todos os usuários da
 * empresa imediatamente (Seção 4.6).
 */
export async function listarCamposAtivos(empresaId: string): Promise<CampoConfigurado[]> {
  const todos = await listarCamposConfiguraveis(empresaId);
  return todos.filter((campo) => campo.ativo);
}

/** Ativa/desativa um campo e define se é obrigatório (Seção 4.6). */
export async function configurarCampo(params: {
  empresaId: string;
  campoId: string;
  ativo: boolean;
  obrigatorio: boolean;
  ordem: number;
}): Promise<void> {
  await exigirConexao();

  const { error } = await supabase.from('empresa_campos_produto').upsert(
    {
      empresa_id: params.empresaId,
      campo_id: params.campoId,
      ativo: params.ativo,
      // Um campo desativado não pode continuar marcado como obrigatório.
      obrigatorio: params.ativo ? params.obrigatorio : false,
      ordem: params.ordem,
    },
    { onConflict: 'empresa_id,campo_id' },
  );

  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * Seção 4.6 — criação de campo personalizado simples.
 * A chave técnica é gerada no servidor; o app envia só o rótulo e o tipo.
 */
export async function criarCampoPersonalizado(params: {
  nomeExibicao: string;
  tipo: TipoCampo;
  opcoes?: string[];
}): Promise<string> {
  await exigirConexao();

  const { data, error } = await supabase.rpc('criar_campo_personalizado', {
    p_nome_exibicao: params.nomeExibicao,
    p_tipo: params.tipo,
    p_opcoes: params.tipo === 'selecao' ? ((params.opcoes ?? []) as unknown as Json) : null,
  });

  if (error) throw new Error(mensagemDeErro(error));
  return data as unknown as string;
}
