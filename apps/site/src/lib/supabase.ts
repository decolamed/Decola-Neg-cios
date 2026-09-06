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

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
