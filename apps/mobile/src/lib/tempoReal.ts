/**
 * Assinaturas de tempo real — o único lugar que cria canal no aplicativo.
 *
 * O DEFEITO QUE ISTO CONSERTA. Cada módulo criava o seu canal com um nome
 * fixo, do tipo `avisos:<empresa>`. Parece inofensivo, mas o
 * `supabase.channel(nome)` NÃO cria um canal novo quando já existe um com
 * aquele nome — ele DEVOLVE O EXISTENTE:
 *
 *     const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
 *     if (!exists) { ...cria... } else { return exists; }
 *
 * E registrar `.on('postgres_changes', …)` num canal que já passou por
 * `.subscribe()` estoura:
 *
 *     cannot add `postgres_changes` callbacks for realtime:avisos:<id>
 *     after `subscribe()`.
 *
 * Isso acontecia sempre que DUAS telas vivas pediam o mesmo assunto — e no
 * Expo Router a tela de trás continua montada quando outra entra por cima.
 * Eram três pares expostos:
 *
 *   `avisos:`     Início (o sino) + Central de notificações
 *   `produtos:`   Produtos + Estoque baixo
 *   `vendas:`     Vendas + Solicitações de cancelamento
 *
 * Tocar no sino a partir do Início caía exatamente nesse caso: a tela
 * quebrava inteira, e antes do limite de erro isso aparecia como uma tela
 * amarela parada, sem explicação.
 *
 * COMO FICA. Cada assinatura ganha um canal com sufixo próprio, então duas
 * telas nunca disputam o mesmo nome. Todos os `.on()` são registrados ANTES do
 * `.subscribe()`, que é a única ordem que a biblioteca aceita. E existe um só
 * caminho para criar canal: `scripts/conferir-canais.mjs` quebra a compilação
 * se alguém voltar a chamar `supabase.channel` fora daqui.
 */
import { supabase } from '@/lib/supabase';

/**
 * Contador de instâncias. Precisa ser único apenas dentro desta aba/aplicativo
 * — é o que separa duas telas vivas ao mesmo tempo.
 */
let sequencia = 0;

export type Assunto = {
  tabela: string;
  /** Filtro do PostgREST. Padrão: a empresa toda. */
  filtro?: string;
};

/**
 * Assina mudanças em uma ou mais tabelas e devolve a função de cancelar.
 *
 * `nome` é só para leitura humana no painel do Supabase; a unicidade vem do
 * sufixo, não dele.
 */
export function observarTabelas(params: {
  nome: string;
  empresaId: string;
  assuntos: Assunto[];
  aoMudar: () => void;
}): () => void {
  sequencia += 1;

  const canal = supabase.channel(`${params.nome}:${params.empresaId}:${sequencia}`);

  // TODOS os `.on()` antes do `.subscribe()`: a biblioteca recusa o contrário.
  for (const assunto of params.assuntos) {
    canal.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: assunto.tabela,
        filter: assunto.filtro ?? `empresa_id=eq.${params.empresaId}`,
      },
      params.aoMudar,
    );
  }

  canal.subscribe();

  return () => {
    void supabase.removeChannel(canal);
  };
}
