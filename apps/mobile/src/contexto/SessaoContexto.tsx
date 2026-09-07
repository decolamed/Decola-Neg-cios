/**
 * Estado de sessão e da conta, compartilhado por todo o app.
 *
 * Mantém em memória o vínculo, a empresa e a assinatura, e os recarrega em
 * tempo real (Seções 3.3 e 5.4): uma permissão revogada por um Gestor some do
 * dispositivo do funcionário sem novo login, e a assinatura que vira `ativa`
 * após o pagamento libera o app sozinha (Seção 7.12).
 *
 * O que este contexto guarda serve para a INTERFACE decidir o que mostrar.
 * A autorização real é sempre do banco (RLS + RPC) — se os dois divergirem,
 * quem vale é o banco.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Session } from '@supabase/supabase-js';
import type { ChavePermissao } from '@decola/types';
import { observarSessao, sair as encerrarSessao, sessaoAtual } from '@/dados/autenticacao';
import {
  carregarContextoDaConta,
  observarContextoDaConta,
  type ContextoDaConta,
} from '@/dados/empresa';
import { textoDoErro } from '@/lib/erros';

type EstadoSessao = {
  carregando: boolean;
  sessao: Session | null;
  conta: ContextoDaConta | null;
  erro: string | null;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
  /** Espelho da permissão para a interface — o banco é quem decide de fato. */
  temPermissao: (chave: ChavePermissao) => boolean;
  /** Seção 6.6 — em modo limitado a consulta continua, a escrita não. */
  podeEscrever: boolean;
};

const Contexto = createContext<EstadoSessao | null>(null);

const STATUS_QUE_PERMITEM_ESCRITA = ['trial', 'ativa', 'carencia'] as const;

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Session | null>(null);
  const [conta, setConta] = useState<ContextoDaConta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cancelarRealtime = useRef<(() => void) | null>(null);

  const carregarConta = useCallback(async (sessaoAtiva: Session | null) => {
    if (!sessaoAtiva) {
      setConta(null);
      return;
    }
    try {
      setConta(await carregarContextoDaConta());
      setErro(null);
    } catch (e) {
      setConta(null);
      setErro(textoDoErro(e, 'Não foi possível carregar sua conta.'));
    }
  }, []);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      const atual = await sessaoAtual();
      setSessao(atual);
      await carregarConta(atual);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível iniciar o app.'));
    } finally {
      setCarregando(false);
    }
  }, [carregarConta]);

  useEffect(() => {
    void recarregar();
    return observarSessao((nova) => {
      setSessao(nova);
      void carregarConta(nova);
    });
  }, [recarregar, carregarConta]);

  // Assina o canal da empresa enquanto houver conta, e cancela ao sair —
  // Seção 3.3 exige cancelar a inscrição quando ela deixa de ser necessária.
  useEffect(() => {
    cancelarRealtime.current?.();
    cancelarRealtime.current = null;

    if (conta?.empresa.id) {
      cancelarRealtime.current = observarContextoDaConta(conta.empresa.id, () => {
        void carregarConta(sessao);
      });
    }

    return () => {
      cancelarRealtime.current?.();
      cancelarRealtime.current = null;
    };
  }, [conta?.empresa.id, sessao, carregarConta]);

  const sair = useCallback(async () => {
    await encerrarSessao();
    setSessao(null);
    setConta(null);
  }, []);

  const valor = useMemo<EstadoSessao>(() => {
    const statusAssinatura = conta?.assinatura?.status;

    return {
      carregando,
      sessao,
      conta,
      erro,
      recarregar,
      sair,
      temPermissao: (chave) => {
        if (!conta) return false;
        if (conta.ehGestor) return true;
        if (chave === 'gerenciar_assinatura') return false;
        return conta.permissoes[chave] === true;
      },
      podeEscrever:
        conta?.empresa.status === 'ativa' &&
        statusAssinatura !== undefined &&
        (STATUS_QUE_PERMITEM_ESCRITA as readonly string[]).includes(statusAssinatura),
    };
  }, [carregando, sessao, conta, erro, recarregar, sair]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): EstadoSessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de ProvedorDeSessao.');
  return contexto;
}
