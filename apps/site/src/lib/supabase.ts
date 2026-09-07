/**
 * Cliente Supabase do site público.
 *
 * Mesma base de Auth do app e do painel (Seção 4.15) — quem contrata pelo site
 * sai com a conta que vai usar no aplicativo, sem cadastro em dobro.
 *
 * `storageKey` próprio: site, painel e app não compartilham sessão nem quando
 * abertos no mesmo navegador. Sem isso, entrar no painel como administrador
 * derrubaria uma contratação em andamento na outra aba.
 *
 * Configuração ausente NÃO derruba o módulo. Um `throw` aqui vira tela branca
 * com o erro escondido no console — que é o pior jeito possível de comunicar
 * "faltou variável de ambiente" numa página que o cliente final acessa.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@decola/types';

/**
 * A conexão de produção vive AQUI, no código, e não só em variável de ambiente.
 *
 * Não é atalho, é a escolha certa para estes dois valores específicos:
 *
 *   - A anon key é PÚBLICA por definição. Ela é embutida no bundle e servida ao
 *     navegador de todo visitante — já dá para lê-la abrindo o site. Guardá-la
 *     em variável de ambiente nunca a tornou secreta; só a tornou fácil de
 *     esquecer.
 *   - Quem protege os dados é a RLS, não o sigilo desta chave. Com ela na mão e
 *     sem sessão, o alcance é exatamente duas views (`vitrine_lojas` e
 *     `vitrine_produtos`), que só mostram loja publicada e produto marcado como
 *     visível. Nenhuma tabela do schema responde ao papel anônimo.
 *
 * O que se ganha: variável esquecida na publicação não derruba mais o site
 * inteiro. Era o defeito real — o site subiu, respondeu 200 e não fazia nada,
 * porque as variáveis entram em tempo de BUILD e ninguém as tinha definido.
 *
 * As variáveis continuam tendo prioridade, para apontar a outro projeto
 * (homologação) sem mexer no código.
 */
const URL_PRODUCAO = 'https://nakqafnchwydfogcozvc.supabase.co';
const CHAVE_PRODUCAO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ha3' +
  'FhZm5jaHd5ZGZvZ2NvenZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjkyNjQsImV4cCI6' +
  'MjEwMTI0NTI2NH0.Zv95UlIYZWPW_LA18nmqbKQb-KG272wqjfTrfqMSbFw';

const url = import.meta.env.VITE_SUPABASE_URL || URL_PRODUCAO;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || CHAVE_PRODUCAO;

/**
 * A página foi aberta por um link de e-mail?
 *
 * Precisa ser lido AQUI, antes de `createClient`: com `detectSessionInUrl`, o
 * cliente consome os parâmetros e limpa a barra de endereço assim que nasce —
 * depois disso não há mais como saber como a pessoa chegou.
 *
 * Sem essa marca, quem já tivesse uma sessão no navegador (por ter acabado de
 * se cadastrar, por exemplo) veria o formulário de nova senha mesmo com um
 * link expirado. Trocaria a senha, sim, mas o link quebrado passaria por
 * válido — e um link de recuperação que "funciona" sem valer é exatamente o
 * tipo de coisa que ninguém descobre até precisar.
 */
export const VEIO_DE_LINK_DE_EMAIL =
  typeof window !== 'undefined' &&
  /(access_token|code|token_hash|error)=/.test(window.location.hash + window.location.search);

/**
 * Com a produção embutida acima, isto só é falso se alguém definir a variável
 * com valor vazio de propósito. A tela "Em configuração" continua existindo
 * como rede de segurança — mas deixou de ser o caminho normal.
 */
export const CONFIGURADO = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url || 'https://configuracao-ausente.invalid',
  anonKey || 'configuracao-ausente',
  {
    auth: {
      storageKey: 'decola-site',
      autoRefreshToken: true,
      persistSession: true,
      // No navegador o link de recuperação volta com o código na URL; deixar o
      // cliente detectá-lo sozinho é o que faz a tela de nova senha funcionar.
      detectSessionInUrl: true,
    },
  },
);

export const URL_FUNCOES = `${url ?? ''}/functions/v1`;
export const CHAVE_PUBLICA = anonKey ?? '';
