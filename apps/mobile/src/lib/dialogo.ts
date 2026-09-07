/**
 * Confirmar e avisar — nas duas plataformas.
 *
 * POR QUE ISTO EXISTE. `Alert.alert` do React Native, na web, é literalmente
 * uma função vazia:
 *
 *     class Alert { static alert() {} }
 *
 * Não lança erro, não escreve no console, não faz nada. O resultado é que TODA
 * confirmação do aplicativo morria em silêncio no navegador: sair da conta,
 * cancelar venda, confirmar recebimento de Pix, arquivar produto, promover
 * funcionário, remover foto. A pessoa tocava no botão e a tela ficava parada.
 * Foi assim que o "botão sair da conta não funciona" chegou até aqui — e não
 * era um botão quebrado, eram quinze.
 *
 * MESMA ASSINATURA do `Alert.alert`, de propósito. Trocar quinze chamadas para
 * um formato novo seria quinze oportunidades de errar num conserto que precisa
 * ser confiável; assim a mudança em cada tela é uma linha de import.
 *
 * O que a web não oferece: rótulos personalizados nos botões. `window.confirm`
 * mostra "OK" e "Cancelar" e pronto. Por isso o rótulo do botão de confirmação
 * é acrescentado ao TEXTO da pergunta — sem isso, "OK" sozinho não diria se
 * vai arquivar, cancelar a venda ou promover alguém.
 */
import { Alert, Platform, type AlertButton } from 'react-native';

function alerta(titulo: string, mensagem?: string, botoes?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensagem, botoes);
    return;
  }

  const lista = botoes ?? [];
  const acao = lista.find((b) => b.style !== 'cancel');
  const cancelamento = lista.find((b) => b.style === 'cancel');

  // Sem escolha a fazer: é aviso, não pergunta.
  if (lista.length < 2 || !acao) {
    window.alert(mensagem ? `${titulo}\n\n${mensagem}` : titulo);
    acao?.onPress?.();
    return;
  }

  const pergunta = [mensagem, acao.text ? `${acao.text}?` : null]
    .filter(Boolean)
    .join('\n\n');

  if (window.confirm(`${titulo}\n\n${pergunta}`)) {
    acao.onPress?.();
  } else {
    cancelamento?.onPress?.();
  }
}

export const Dialogo = { alert: alerta };
