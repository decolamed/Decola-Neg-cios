/**
 * Quem já viu o tutorial de boas-vindas.
 *
 * FICA NO APARELHO, e não no banco. É uma decisão, e vale dizer por quê: o
 * tutorial ensina a USAR ESTE APARELHO — onde ficam as abas, como instalar o
 * ícone na tela inicial. Quem entra pela primeira vez no computador da loja
 * depois de já ter visto no celular tem o mesmo tanto a aprender que tinha
 * antes, e guardar "já viu" no servidor esconderia o tutorial justamente de
 * quem precisa dele.
 *
 * POR USUÁRIO, mesmo assim: no balcão compartilhado, o funcionário novo não
 * deve herdar o "já viu" do gestor que usou o aparelho antes dele.
 *
 * FALHAR É NÃO TER VISTO. Se o armazenamento estiver bloqueado (aba anônima,
 * cookies desligados), a resposta é "ainda não viu" — mostrar o tutorial de
 * novo incomoda; escondê-lo de quem nunca viu deixa a pessoa perdida.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const chave = (usuarioId: string) => `decola.tutorial.visto.${usuarioId}`;

const ehWeb = Platform.OS === 'web' && typeof window !== 'undefined';

async function ler(nome: string): Promise<string | null> {
  try {
    return ehWeb ? window.localStorage.getItem(nome) : await AsyncStorage.getItem(nome);
  } catch {
    return null;
  }
}

async function gravar(nome: string, valor: string): Promise<void> {
  try {
    if (ehWeb) window.localStorage.setItem(nome, valor);
    else await AsyncStorage.setItem(nome, valor);
  } catch {
    // Sem armazenamento, o tutorial reaparece na próxima abertura. É o pior
    // desfecho possível aqui, e ele é suportável.
  }
}

export async function jaViuOTutorial(usuarioId: string): Promise<boolean> {
  return (await ler(chave(usuarioId))) !== null;
}

export async function marcarTutorialVisto(usuarioId: string): Promise<void> {
  await gravar(chave(usuarioId), new Date().toISOString());
}
