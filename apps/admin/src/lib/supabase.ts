/**
 * Cliente Supabase do painel — ponto único de acesso ao backend.
 *
 * Mesma base de Auth do app cliente (Seção 4.15): o que distingue um
 * administrador é a linha em `administradores_plataforma`, reconhecida pelas
 * políticas de RLS. Não existe um segundo sistema de login.
 *
 * `storageKey` próprio: o painel e o app não compartilham sessão nem quando
 * abertos no mesmo navegador.
 *
 * Configuração ausente NÃO derruba o módulo: um `throw` aqui em cima virava
 * tela branca com erro só no console, que é o pior jeito de comunicar
 * "faltou variável de ambiente". `CONFIGURADO` deixa a casca mostrar uma tela
 * explicando o que fazer.
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@decola/types';

/**
 * Mesma decisão do site (ver `apps/site/src/lib/supabase.ts`): a conexão de
 * produção fica no código porque a anon key é pública por definição — ela já é
 * servida no bundle deste painel para qualquer um que abra o endereço — e quem
 * protege os dados é a RLS, somada ao registro em `administradores_plataforma`
 * que toda consulta daqui exige.
 *
 * O painel hoje tem as variáveis definidas na Vercel e funciona. Isto é rede:
 * uma publicação futura sem elas deixaria de derrubar a ferramenta.
 */
const URL_PRODUCAO = 'https://nakqafnchwydfogcozvc.supabase.co';
const CHAVE_PRODUCAO =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ha3' +
  'FhZm5jaHd5ZGZvZ2NvenZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjkyNjQsImV4cCI6' +
  'MjEwMTI0NTI2NH0.Zv95UlIYZWPW_LA18nmqbKQb-KG272wqjfTrfqMSbFw';

const url = import.meta.env.VITE_SUPABASE_URL || URL_PRODUCAO;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || CHAVE_PRODUCAO;

export const CONFIGURADO = Boolean(url && anonKey);

export const supabase = createClient<Database>(
  url || 'https://configuracao-ausente.invalid',
  anonKey || 'configuracao-ausente',
  {
    auth: {
      storageKey: 'decola-painel-admin',
      autoRefreshToken: true,
      persistSession: true,
    },
  },
);

export const URL_FUNCOES = `${url ?? ''}/functions/v1`;
export const CHAVE_PUBLICA = anonKey ?? '';
