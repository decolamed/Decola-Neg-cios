/**
 * Configurações da empresa — Seções 4.1, 7.9, 8.3.
 */
import type { HorarioSemanal } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

/** Seção 8.3 — opções oferecidas na interface para o alerta de estoque. */
export const PERCENTUAIS_DE_ALERTA = [50, 25, 10] as const;

/**
 * Seção 8.3 — configuração ÚNICA e geral da empresa, aplicada a todos os
 * produtos. Substitui o "estoque mínimo" absoluto por produto, que não existe
 * mais no sistema.
 *
 * `empresas.status` não é alterável por aqui: a coluna nem sequer está no
 * GRANT do cliente (Seção 6.9).
 */
export async function definirPercentualDeAlerta(
  empresaId: string,
  percentual: number,
): Promise<void> {
  await exigirConexao();

  if (!(percentual > 0 && percentual <= 100)) {
    throw new Error('O percentual de alerta deve estar entre 1 e 100.');
  }

  const { error } = await supabase
    .from('empresas')
    .update({ alerta_estoque_percentual: percentual })
    .eq('id', empresaId);

  if (error) throw new Error(mensagemDeErro(error));
}

export type DadosCadastraisDaEmpresa = {
  nome: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  chave_pix: string | null;
};

export async function salvarDadosDaEmpresa(
  empresaId: string,
  dados: DadosCadastraisDaEmpresa,
): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('empresas')
    .update({
      nome: dados.nome.trim(),
      cnpj: dados.cnpj?.trim() || null,
      endereco: dados.endereco?.trim() || null,
      telefone: dados.telefone?.trim() || null,
      chave_pix: dados.chave_pix?.trim() || null,
    })
    .eq('id', empresaId);

  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * Grava o horário de funcionamento (0059).
 *
 * `null` apaga: a loja volta a não informar horário, que é diferente de estar
 * fechada a semana toda — para isso existem sete posições nulas.
 *
 * A VALIDAÇÃO DE VERDADE ESTÁ NO BANCO, num `CHECK` que confere as sete
 * posições e o formato "HH:MM". A conferência daqui é por cortesia com quem
 * digitou; a que impede dado torto de chegar na vitrine de um lojista é a de
 * lá, como manda a regra do projeto.
 */
export async function salvarHorarioDeFuncionamento(
  empresaId: string,
  horario: HorarioSemanal | null,
): Promise<void> {
  await exigirConexao();

  if (horario !== null) {
    if (horario.length !== 7) throw new Error('O horário precisa ter os sete dias da semana.');
    const hora = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    for (const dia of horario) {
      if (dia === null) continue;
      if (!hora.test(dia.abre) || !hora.test(dia.fecha)) {
        throw new Error('Confira os horários. Use o formato 08:00.');
      }
    }
  }

  const { error } = await supabase
    .from('empresas')
    .update({ horario_funcionamento: horario })
    .eq('id', empresaId);

  if (error) throw new Error(mensagemDeErro(error));
}

/**
 * "Configurar depois": silencia o roteiro de primeiro acesso.
 *
 * Grava só a data da dispensa. O que FALTA configurar continua sendo derivado
 * dos dados — ver `@/dados/primeiraConfiguracao` — porque uma anotação sobre o
 * que está pronto pode discordar da realidade, e o dado não pode.
 */
export async function dispensarConfiguracaoInicial(empresaId: string): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('empresas')
    .update({ configuracao_inicial_dispensada_em: new Date().toISOString() })
    .eq('id', empresaId);

  if (error) throw new Error(mensagemDeErro(error));
}
