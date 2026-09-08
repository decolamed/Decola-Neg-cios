/**
 * Confirmar e avisar — nas duas plataformas, com a cara do aplicativo.
 *
 * POR QUE ISTO EXISTE. `Alert.alert` do React Native, na web, é literalmente
 * uma função vazia:
 *
 *     class Alert { static alert() {} }
 *
 * Não lança erro, não escreve no console, não faz nada. O resultado era que
 * TODA confirmação morria em silêncio no navegador: sair da conta, cancelar
 * venda, confirmar recebimento de Pix, arquivar produto, promover funcionário,
 * remover foto. A pessoa tocava no botão e a tela ficava parada.
 *
 * POR QUE NÃO É MAIS `window.confirm`. O primeiro conserto usou o diálogo do
 * navegador, e ele funcionava — mas anunciava "decolanegocios.vercel.app diz",
 * empilhava título, mensagem e pergunta em três parágrafos soltos e oferecia
 * "OK/Cancelar" em vez do verbo da ação. Num aplicativo que a pessoa instalou
 * na tela inicial, aquilo parece um aviso do navegador invadindo a tela, não
 * uma pergunta do produto. Agora o diálogo é desenhado aqui, com a tipografia
 * e as cores da marca, e o botão diz o que vai acontecer.
 *
 * MESMA ASSINATURA do `Alert.alert`, de propósito: as quinze chamadas
 * existentes não precisam saber de nada disso.
 *
 * Este arquivo é só o CANAL. Quem desenha é `componentes/Dialogos.tsx`, montado
 * uma vez na raiz — separados porque uma camada de dados não deveria depender
 * de React, e porque assim `Dialogo.alert` pode ser chamado de qualquer lugar,
 * inclusive de fora de um componente.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

export type PedidoDeDialogo = {
  titulo: string;
  mensagem?: string;
  botoes: AlertButton[];
};

type Ouvinte = (pedido: PedidoDeDialogo) => void;

let ouvinte: Ouvinte | null = null;

/** Chamado uma vez pelo hospedeiro, na raiz do aplicativo. */
export function registrarHospedeiroDeDialogos(novo: Ouvinte | null): void {
  ouvinte = novo;
}

function alerta(titulo: string, mensagem?: string, botoes?: AlertButton[]): void {
  // No celular o diálogo do sistema é o certo: é o que a pessoa reconhece, e
  // ele já respeita o tema e a acessibilidade do aparelho.
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensagem, botoes);
    return;
  }

  const lista = botoes && botoes.length > 0 ? botoes : [{ text: 'OK' }];

  if (ouvinte) {
    ouvinte({ titulo, mensagem, botoes: lista });
    return;
  }

  /**
   * Reserva para o caso de o hospedeiro não estar montado — uma tela de erro
   * antes da raiz, por exemplo. Feia, mas funcionando: perder a confirmação em
   * silêncio foi exatamente o defeito que este arquivo existe para não
   * repetir.
   */
  const acao = lista.find((b) => b.style !== 'cancel');
  const cancelamento = lista.find((b) => b.style === 'cancel');

  if (lista.length < 2 || !acao) {
    window.alert(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
    acao?.onPress?.();
    return;
  }

  if (window.confirm(`${titulo}\n\n${mensagem ?? ''}`)) acao.onPress?.();
  else cancelamento?.onPress?.();
}

export const Dialogo = { alert: alerta };
