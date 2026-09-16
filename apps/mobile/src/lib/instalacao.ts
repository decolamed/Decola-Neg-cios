/**
 * Instalar o Decola Negócios no aparelho.
 *
 * O produto é servido como site (PWA). "Instalar" aqui não baixa nada de loja
 * nenhuma: cria o ícone na tela inicial e faz o app abrir sem a barra do
 * navegador — que é o que faz a pessoa parar de precisar lembrar do endereço.
 *
 * O NAVEGADOR NÃO DEIXA PEDIR NA HORA QUE A GENTE QUISER. O Chrome dispara
 * `beforeinstallprompt` quando ELE decide que a instalação faz sentido, e essa
 * é a única oportunidade de guardar o convite para usar depois. Se ele não
 * dispara, não há API nenhuma que force — e é por isso que este módulo GUARDA
 * o evento em vez de tentar chamá-lo na hora do clique.
 *
 * TRÊS SITUAÇÕES, e a tela precisa saber distinguir:
 *
 *   'pronto' ...... o convite está guardado; o botão instala de verdade.
 *   'instalado' ... já está na tela inicial (ou aberto como app).
 *   'manual' ...... o navegador não oferece o convite. É o caso do iPhone, onde
 *                   Safari só instala pelo menu "Compartilhar → Adicionar à
 *                   Tela de Início". Aqui a única ajuda honesta é ensinar o
 *                   caminho, e não mostrar um botão que não faz nada.
 */
import { Platform } from 'react-native';

export type EstadoDaInstalacao = 'pronto' | 'instalado' | 'manual';

type ConviteDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const ehWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/** O convite que o navegador ofereceu, guardado para o momento do clique. */
let convite: ConviteDeInstalacao | null = null;

const ouvintes = new Set<(estado: EstadoDaInstalacao) => void>();

/** Aberto como aplicativo (ícone da tela inicial), e não como aba do navegador. */
function abertoComoApp(): boolean {
  if (!ehWeb) return false;
  const comoApp = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  // O Safari do iPhone não implementa `display-mode`; ele tem esta propriedade.
  const noIOS = (window.navigator as { standalone?: boolean }).standalone === true;
  return comoApp || noIOS;
}

export function estadoDaInstalacao(): EstadoDaInstalacao {
  if (abertoComoApp()) return 'instalado';
  return convite ? 'pronto' : 'manual';
}

function avisar() {
  const estado = estadoDaInstalacao();
  for (const ouvinte of ouvintes) ouvinte(estado);
}

/**
 * Começa a escutar o navegador. Chamado uma vez, na abertura do aplicativo.
 *
 * PRECISA SER CEDO. O `beforeinstallprompt` dispara logo depois do
 * carregamento; escutar só quando a tela de tutorial abre significaria perder o
 * convite em quase todos os casos — e o botão de instalar ficaria morto sem
 * nenhum erro para explicar.
 */
export function observarInstalacao(): void {
  if (!ehWeb) return;

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sem isto o Chrome mostra a própria faixa de instalação, por cima da
    // nossa etapa do tutorial, pedindo a mesma coisa duas vezes.
    evento.preventDefault();
    convite = evento as ConviteDeInstalacao;
    avisar();
  });

  window.addEventListener('appinstalled', () => {
    // O convite não pode ser reusado depois de aceito.
    convite = null;
    avisar();
  });
}

/** Avisa a tela quando o estado muda. Devolve a função de parar de escutar. */
export function assinarInstalacao(ouvinte: (estado: EstadoDaInstalacao) => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/**
 * Pede a instalação ao navegador.
 *
 * Devolve `true` quando a pessoa aceitou. `false` cobre dois casos que a tela
 * trata igual — ela desistiu, ou não havia convite guardado —, porque em
 * nenhum dos dois há o que comemorar e em nenhum dos dois houve erro.
 *
 * O CONVITE VALE UMA VEZ SÓ. Depois de usado o navegador não o devolve, e
 * insistir com o mesmo objeto não faz nada. Por isso ele é descartado aqui.
 */
export async function instalar(): Promise<boolean> {
  if (!convite) return false;
  const pedido = convite;
  convite = null;
  try {
    await pedido.prompt();
    const { outcome } = await pedido.userChoice;
    avisar();
    return outcome === 'accepted';
  } catch {
    avisar();
    return false;
  }
}

/** O caminho da instalação manual, quando o navegador não oferece o convite. */
export function comoInstalarAMao(): string {
  if (!ehWeb) return '';
  const agente = window.navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agente)) {
    return 'No iPhone: toque em Compartilhar (o quadrado com a seta) na barra do Safari e escolha "Adicionar à Tela de Início".';
  }
  if (/Android/i.test(agente)) {
    return 'No Android: abra o menu do navegador (⋮) e escolha "Instalar aplicativo" ou "Adicionar à tela inicial".';
  }
  return 'No computador: procure o ícone de instalar na barra de endereço do navegador, ou o item "Instalar" no menu.';
}
