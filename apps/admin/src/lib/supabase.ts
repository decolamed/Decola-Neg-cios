/**
 * Cliente Supabase do painel — ponto único de acesso ao backend.
 *
 * Mesma base de Auth do app cliente (Seção 4.15): o que distingue um
 * administrador é a linha em `administradores_plataforma`, reconhecida pelas
 * políticas de RLS. Não existe um segundo sistema de login.
 *
 * `storageKey` próprio: o painel e o app não compartilham sessão nem quando
 * abertos no mesmo navegador.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@decola/types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não configuradas. ' +
      'Copie apps/admin/.env.example para .env e preencha.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storageKey: 'decola-painel-admin',
    autoRefreshToken: true,
    persistSession: true,
  },
});

export const URL_FUNCOES = `${url}/functions/v1`;
export const CHAVE_PUBLICA = anonKey;
