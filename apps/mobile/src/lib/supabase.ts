/**
 * Cliente Supabase — ponto único de acesso ao backend.
 * Especificação: Seções 3.1 (camada de dados isolada), 3.4, 9.1.
 *
 * A Seção 3.1 exige que a camada de acesso a dados fique isolada, para que uma
 * eventual migração de parte do backend não obrigue a reescrever o app. Por
 * isso nenhuma tela importa este módulo diretamente: elas passam pelos
 * repositórios em `src/dados/`.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@decola/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY não configuradas. ' +
      'Copie apps/mobile/.env.example para .env e preencha.',
  );
}

/**
 * A anon key é pública por design — quem protege os dados é a RLS (Seção 9.1),
 * não o segredo da chave. A chave da API do Asaas, essa sim secreta, nunca
 * chega até aqui (Seção 6.4).
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // React Native não tem URL de callback com fragmento como o navegador.
    detectSessionInUrl: false,
    /**
     * PKCE, e não o `implicit` que vem por padrão.
     *
     * No fluxo implícito o Supabase devolve os tokens no fragmento da URL
     * (`#access_token=…`), e o app usa `exchangeCodeForSession`, que espera um
     * `?code=`. Com o padrão, o login com Google e o link de redefinição de
     * senha falhavam sempre — o `code` simplesmente não existia na volta.
     *
     * PKCE também é o certo para aplicativo: o segredo da troca fica no
     * dispositivo (AsyncStorage) e não trafega na URL, que é visível ao
     * sistema operacional e a qualquer app registrado no mesmo esquema.
     */
    flowType: 'pkce',
  },
});
