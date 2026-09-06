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
