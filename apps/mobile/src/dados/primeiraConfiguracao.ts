/**
 * O que falta para a loja funcionar — perguntado aos dados, não a uma bandeira.
 *
 * O ROTEIRO DE BOAS-VINDAS não guarda "etapa 2 concluída". Ele olha para os
 * dados e pergunta: tem chave Pix? tem horário? tem endereço de loja? tem
 * WhatsApp? Uma coluna `pix_configurado` seria uma anotação SOBRE a resposta, e
 * anotação envelhece: o lojista apaga a chave em Configurações e o sistema
 * continua achando que está tudo pronto. Perguntando ao dado, não tem como
 * discordar da realidade.
 *
 * A CONSEQUÊNCIA BOA disso é que quem configurou pelo caminho normal — direto
 * em Configurações, sem passar pelo roteiro — já aparece com a etapa cumprida.
 * Era o pedido: "depois que o usuário já tiver concluído essas configurações
 * uma vez, essas etapas não devem continuar aparecendo".
 *
 * O QUE ENTROU NA LISTA. Só o que a loja precisa para FUNCIONAR, e não tudo que
 * existe em Configurações. Cada etapa a mais é uma chance a mais de a pessoa
 * desistir no meio — e categorias, campos de produto e alertas de estoque são
 * coisas que ela descobre sozinha quando precisar.
 */
import type { Empresa } from '@decola/types';

export type ChaveDaEtapa = 'pix' | 'horario' | 'endereco_da_loja' | 'whatsapp';

export type EtapaInicial = {
  chave: ChaveDaEtapa;
  titulo: string;
  /** Por que isso importa — em uma frase, do ponto de vista do lojista. */
  porque: string;
  destino: string;
  concluida: boolean;
};

export function etapasDaPrimeiraConfiguracao(empresa: Empresa): EtapaInicial[] {
  return [
    {
      chave: 'endereco_da_loja',
      titulo: 'Endereço da sua loja online',
      porque: 'É o link que você manda para o cliente. Sem ele a loja não existe na internet.',
      destino: '/configuracoes/loja',
      concluida: Boolean(empresa.loja_slug),
    },
    {
      chave: 'whatsapp',
      titulo: 'WhatsApp de contato',
      porque: 'É por onde o cliente fala com você e combina entrega e pagamento.',
      destino: '/configuracoes/loja',
      concluida: Boolean(empresa.whatsapp),
    },
    {
      chave: 'pix',
      titulo: 'Chave Pix',
      porque: 'Sem ela o QR Code do Pix não pode ser gerado — nem na venda, nem na loja.',
      destino: '/configuracoes/empresa',
      concluida: Boolean(empresa.chave_pix),
    },
    {
      chave: 'horario',
      titulo: 'Horário de funcionamento',
      porque: 'Quem comprar fora do horário fica sabendo que o pedido será atendido depois.',
      destino: '/configuracoes/horario',
      concluida: Array.isArray(empresa.horario_funcionamento),
    },
  ];
}

/**
 * O roteiro deve aparecer sozinho agora?
 *
 * Três condições, e todas necessárias: tem coisa faltando, a pessoa não pediu
 * para parar de ver, e ela é Gestor — um Funcionário não tem permissão para
 * mexer em nada disso, e mostrar a ele uma lista de pendências que ele não pode
 * resolver é só deixá-lo preocupado à toa.
 */
export function deveAbrirORoteiro(empresa: Empresa, ehGestor: boolean): boolean {
  if (!ehGestor) return false;
  if (empresa.configuracao_inicial_dispensada_em) return false;
  return etapasDaPrimeiraConfiguracao(empresa).some((etapa) => !etapa.concluida);
}
