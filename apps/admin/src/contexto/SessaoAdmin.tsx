/**
 * Sessão do painel — Seções 7.15 (Acesso) e 11.1.
 *
 * Guarda duas coisas diferentes de propósito: `autenticado` (tem sessão no
 * Supabase Auth) e `administrador` (existe em `administradores_plataforma`).
 * Um Gestor de empresa satisfaz a primeira e nunca a segunda — é aí que o
 * painel se separa do app cliente.
 *
 * Isto serve à INTERFACE. A autorização real é do banco: mesmo que este estado
 * fosse forjado, nenhuma RPC administrativa responderia.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AdministradorPlataforma } from '@decola/types';
import { administradorAtual, observarSessao, sair as encerrar } from '@/dados/sessao';
import { supabase } from '@/lib/supabase';

type Estado = {
  carregando: boolean;
  autenticado: boolean;
  administrador: AdministradorPlataforma | null;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
};

const Contexto = createContext<Estado | null>(null);

export function ProvedorDeSessaoAdmin({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [autenticado, setAutenticado] = useState(false);
  const [administrador, setAdministrador] = useState<AdministradorPlataforma | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await supabase.auth.getSession();
      setAutenticado(Boolean(data.session));
      setAdministrador(data.session ? await administradorAtual() : null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
    return observarSessao(() => {
      void recarregar();
    });
  }, [recarregar]);

  const sair = useCallback(async () => {
    await encerrar();
    setAutenticado(false);
    setAdministrador(null);
  }, []);

  const valor = useMemo<Estado>(
    () => ({ carregando, autenticado, administrador, recarregar, sair }),
    [carregando, autenticado, administrador, recarregar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessaoAdmin(): Estado {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessaoAdmin precisa estar dentro de ProvedorDeSessaoAdmin.');
  return contexto;
}
