/**
 * Horário de funcionamento da loja: ler, dizer se está aberta e resumir.
 *
 * O FORMATO vem do banco e é sete posições, na ordem do `Date.getDay()`:
 * 0 é domingo, 6 é sábado. Cada posição é `null` (fechado naquele dia) ou
 * `{abre, fecha}` em "HH:MM". O `CHECK` da migração 0059 é quem garante isso —
 * aqui a gente ainda confere, porque um jsonb malformado que escape por
 * qualquer caminho não pode derrubar a vitrine de um lojista para os clientes
 * dele.
 *
 * TRÊS ESTADOS, e não dois. "Aberta", "fechada" e NÃO CONFIGURADO. O terceiro é
 * o que a maioria das lojas vai ser no primeiro dia, e tratá-lo como "fechada"
 * seria pendurar um aviso de loja fechada em quem nunca pediu isso. Quando não
 * há horário, a vitrine simplesmente não fala do assunto.
 *
 * O RELÓGIO É O DE QUEM OLHA. Não guardamos fuso da loja: para o cliente, que
 * quase sempre está na mesma região, o relógio dele é o da loja. A alternativa
 * era mais um campo obrigatório na configuração inicial para resolver o caso do
 * cliente viajando, que quase não existe.
 */

export type IntervaloDoDia = { abre: string; fecha: string };
export type HorarioDaSemana = (IntervaloDoDia | null)[];

const NOMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** "HH:MM" → minutos desde a meia-noite. */
function emMinutos(hora: string): number {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * O jsonb da view vira um horário, ou nada.
 *
 * Nada, e não um horário vazio: um array de sete `null` significa "fechada a
 * semana inteira", que é uma afirmação legítima e diferente de "não sei".
 */
export function lerHorario(bruto: unknown): HorarioDaSemana | null {
  if (!Array.isArray(bruto) || bruto.length !== 7) return null;

  const dias = bruto.map((dia) => {
    if (dia === null || typeof dia !== 'object') return null;
    const { abre, fecha } = dia as Record<string, unknown>;
    if (typeof abre !== 'string' || typeof fecha !== 'string') return null;
    if (!HORA.test(abre) || !HORA.test(fecha)) return null;
    return { abre, fecha };
  });

  return dias;
}

export type EstadoDaLoja = {
  aberta: boolean;
  /** "Abre segunda às 08:00" — só quando está fechada e há previsão. */
  proximaAbertura: string | null;
  /** "Fecha às 18:00" — só quando está aberta. */
  fechaAs: string | null;
};

/**
 * A loja está aberta neste instante?
 *
 * A MADRUGADA É O CASO QUE ENGANA. Um bar que abre 18:00 e fecha 02:00 tem
 * `fecha` MENOR que `abre`, e a comparação ingênua (`abre <= agora < fecha`)
 * diz que ele nunca abre. Quando isso acontece o dia atravessa a meia-noite:
 * vale de `abre` até o fim do dia, e a sobra do dia ANTERIOR vale do começo do
 * dia até `fecha`. As duas metades estão abaixo, e a segunda é a que some se
 * ninguém escrever este comentário.
 */
export function estadoDaLoja(horario: HorarioDaSemana, agora = new Date()): EstadoDaLoja {
  const dia = agora.getDay();
  const minutos = agora.getHours() * 60 + agora.getMinutes();

  const hoje = horario[dia];
  if (hoje) {
    const abre = emMinutos(hoje.abre);
    const fecha = emMinutos(hoje.fecha);
    const dentro = abre <= fecha ? minutos >= abre && minutos < fecha : minutos >= abre;
    if (dentro) return { aberta: true, proximaAbertura: null, fechaAs: hoje.fecha };
  }

  // A sobra de ontem, quando ontem atravessou a meia-noite.
  const ontem = horario[(dia + 6) % 7];
  if (ontem) {
    const abre = emMinutos(ontem.abre);
    const fecha = emMinutos(ontem.fecha);
    if (fecha < abre && minutos < fecha) {
      return { aberta: true, proximaAbertura: null, fechaAs: ontem.fecha };
    }
  }

  return { aberta: false, proximaAbertura: proximaAbertura(horario, dia, minutos), fechaAs: null };
}

/** "Abre hoje às 14:00" / "Abre segunda às 08:00" / null se nunca abre. */
function proximaAbertura(
  horario: HorarioDaSemana,
  diaAtual: number,
  minutos: number,
): string | null {
  for (let adiante = 0; adiante < 7; adiante += 1) {
    const dia = (diaAtual + adiante) % 7;
    const faixa = horario[dia];
    if (!faixa) continue;
    // Hoje só conta se a abertura ainda não passou.
    if (adiante === 0 && emMinutos(faixa.abre) <= minutos) continue;

    if (adiante === 0) return `Abre hoje às ${faixa.abre}`;
    if (adiante === 1) return `Abre amanhã às ${faixa.abre}`;
    return `Abre ${NOMES[dia].toLowerCase()} às ${faixa.abre}`;
  }
  return null;
}

/**
 * A semana em poucas linhas, agrupando dias seguidos com o mesmo horário.
 *
 * Sete linhas idênticas ("Segunda 08:00 às 18:00", "Terça 08:00 às 18:00"…) são
 * sete vezes mais texto para dizer "de segunda a sexta". O agrupamento começa na
 * SEGUNDA, e não no domingo, porque é assim que se lê uma semana comercial —
 * domingo vai para o fim.
 */
export function resumoDaSemana(horario: HorarioDaSemana): { dias: string; faixa: string }[] {
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const linhas: { dias: string; faixa: string }[] = [];

  let inicio = 0;
  while (inicio < ordem.length) {
    const atual = horario[ordem[inicio]];
    const texto = atual ? `${atual.abre} às ${atual.fecha}` : 'Fechado';

    let fim = inicio;
    while (fim + 1 < ordem.length) {
      const proximo = horario[ordem[fim + 1]];
      const textoProximo = proximo ? `${proximo.abre} às ${proximo.fecha}` : 'Fechado';
      if (textoProximo !== texto) break;
      fim += 1;
    }

    const primeiro = CURTOS[ordem[inicio]];
    const ultimo = CURTOS[ordem[fim]];
    linhas.push({
      dias: inicio === fim ? primeiro : `${primeiro} a ${ultimo}`,
      faixa: texto,
    });

    inicio = fim + 1;
  }

  return linhas;
}

/**
 * O aviso que o cliente vê quando compra com a loja fechada.
 *
 * Fica aqui, e não escrito nas telas, porque ele aparece em dois momentos — na
 * hora de fechar o pedido e na tela do pedido pronto — e são justamente os dois
 * momentos em que a pessoa já pagou ou está prestes a pagar. Dizer coisas
 * diferentes nos dois lugares é o que faz alguém achar que deu errado.
 */
export const AVISO_LOJA_FECHADA =
  'A loja está fechada no momento. Seu pedido foi recebido e a loja será avisada assim que o ' +
  'atendimento for iniciado.';
