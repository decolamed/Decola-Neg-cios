/**
 * Períodos de consulta — Seção 10.2.
 * "Períodos disponíveis: dia, semana, mês, ou período personalizado."
 *
 * Compartilhado entre Financeiro e Relatórios (Seção 7.7).
 */

export type TipoDePeriodo = 'dia' | 'semana' | 'mes' | 'personalizado';

export type Periodo = { desde: Date; ate: Date; tipo: TipoDePeriodo };

export const ROTULOS_DE_PERIODO: Record<TipoDePeriodo, string> = {
  dia: 'Hoje',
  semana: 'Semana',
  mes: 'Mês',
  personalizado: 'Personalizado',
};

function inicioDoDia(data: Date): Date {
  const copia = new Date(data);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

/** O fim é exclusivo (início do dia seguinte), para não perder vendas do último dia. */
function fimExclusivo(data: Date): Date {
  const copia = inicioDoDia(data);
  copia.setDate(copia.getDate() + 1);
  return copia;
}

export function periodoDe(tipo: Exclude<TipoDePeriodo, 'personalizado'>, referencia = new Date()): Periodo {
  const ate = fimExclusivo(referencia);
  const desde = inicioDoDia(referencia);

  if (tipo === 'semana') {
    // Semana corrente começando no domingo, como no calendário brasileiro.
    desde.setDate(desde.getDate() - desde.getDay());
  } else if (tipo === 'mes') {
    desde.setDate(1);
  }

  return { desde, ate, tipo };
}

export function periodoPersonalizado(desde: Date, ate: Date): Periodo {
  return { desde: inicioDoDia(desde), ate: fimExclusivo(ate), tipo: 'personalizado' };
}

export function descreverPeriodo(periodo: Periodo): string {
  const fim = new Date(periodo.ate);
  fim.setDate(fim.getDate() - 1);

  const formatar = (data: Date) =>
    data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

  return periodo.desde.toDateString() === fim.toDateString()
    ? formatar(periodo.desde)
    : `${formatar(periodo.desde)} a ${formatar(fim)}`;
}

/** Converte "AAAA-MM-DD" digitado pelo usuário; devolve null se inválido. */
export function dataDeTexto(texto: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!partes) return null;

  const data = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  return Number.isNaN(data.getTime()) ? null : data;
}
