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

  /**
   * A sessão vigente, fora do estado de renderização.
   *
   * `carregarConta` precisa saber se HÁ sessão, mas não deve ser recriada toda
   * vez que o objeto da sessão muda — e ele muda sozinho a cada renovação de
   * token, que o Supabase faz de tempos em tempos e sempre que a aba volta ao
   * foco. Guardando em `ref`, o efeito do tempo real deixa de depender do
   * objeto e para de se reinscrever à toa.
   */
  const sessaoRef = useRef<Session | null>(null);

  /**
   * Uma carga de conta por vez — mas nenhuma pedida é esquecida.
   *
   * Sem isto, cada gatilho (abertura, evento de sessão, mudança no banco)
   * disparava a sua própria sequência de três consultas. Nos registros do
   * servidor isso aparecia como `empresa_usuarios`, `empresas` e `assinaturas`
   * buscados QUATRO vezes seguidas por uma única abertura — três delas puro
   * desperdício, e uma corrida em que a resposta mais lenta podia sobrescrever
   * a mais recente.
   *
   * Simplesmente IGNORAR a segunda chamada seria trocar um defeito por outro:
   * a Seção 5.4 exige que uma permissão revogada suma do aparelho do
   * funcionário, e essa revogação chega justamente como um pedido de recarga
   * no meio de outra. Por isso um pedido que chega durante uma carga não é
   * descartado — ele fica marcado e roda uma vez ao final, valendo por todos
   * os que chegaram nesse intervalo.
   */
  const cargaEmCurso = useRef<Promise<void> | null>(null);
  const recargaPedida = useRef(false);

  const carregarConta = useCallback(async (sessaoAtiva: Session | null) => {
    sessaoRef.current = sessaoAtiva;

    if (!sessaoAtiva) {
      setConta(null);
      return;
    }

    if (cargaEmCurso.current) {
      recargaPedida.current = true;
      return cargaEmCurso.current;
    }

    const carga = (async () => {
      try {
        do {
          recargaPedida.current = false;
          setConta(await carregarContextoDaConta());
          setErro(null);
        } while (recargaPedida.current && sessaoRef.current);
      } catch (e) {
        setConta(null);
        setErro(textoDoErro(e, 'Não foi possível carregar sua conta.'));
      } finally {
        recargaPedida.current = false;
        cargaEmCurso.current = null;
      }
    })();

    cargaEmCurso.current = carga;
    return carga;
  }, []);

  /**
   * Marca que a abertura está lendo a sessão guardada.
   *
   * O `INITIAL_SESSION` do Supabase chega no meio dessa leitura e traz
   * exatamente a mesma sessão. Enquanto esta bandeira estiver de pé, ele é
   * ignorado — a abertura já vai carregar a conta. Só é abaixada no fim, e
   * mesmo se a abertura falhar, para que o próximo aviso volte a valer.
   */
  const aberturaEmCurso = useRef(false);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    aberturaEmCurso.current = true;
    try {
      const atual = await sessaoAtual();
      setSessao(atual);
      await carregarConta(atual);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível iniciar o app.'));
    } finally {
      aberturaEmCurso.current = false;
      setCarregando(false);
    }
  }, [carregarConta]);

  useEffect(() => {
    void recarregar();

    return observarSessao((nova, evento) => {
      setSessao(nova);

      /**
       * Dois avisos do Supabase NÃO significam que a conta mudou:
       *
       * `INITIAL_SESSION` apenas repete a sessão que já estava guardada no
       * aparelho — a mesma que o `recarregar()` logo acima já foi buscar. Era
       * a origem da SEGUNDA leitura completa de vínculo, empresa e assinatura
       * em toda abertura do aplicativo.
       *
       * `TOKEN_REFRESHED` troca o token da mesma pessoa. O Supabase o emite
       * sozinho, de tempos em tempos e a cada volta ao foco; num aplicativo
       * que fica aberto o dia todo no balcão, recarregar em cada um deles é
       * recarregar o dia todo.
       *
       * Entrar, sair e trocar de conta continuam recarregando, que é quando a
       * conta realmente mudou.
       */
      const cobertoPelaAbertura =
        evento === 'INITIAL_SESSION' && nova !== null && aberturaEmCurso.current;

      const mesmoUsuario =
        evento === 'TOKEN_REFRESHED' && nova !== null && nova.user?.id === sessaoRef.current?.user?.id;

      sessaoRef.current = nova;
      if (cobertoPelaAbertura || mesmoUsuario) return;

      void carregarConta(nova);
    });
  }, [recarregar, carregarConta]);

  // Assina o canal da empresa enquanto houver conta, e cancela ao sair —
  // Seção 3.3 exige cancelar a inscrição quando ela deixa de ser necessária.
  //
  // Depende SÓ do id da empresa: uma string, que não muda quando o token é
  // renovado. Antes o objeto da sessão estava nas dependências e cada renovação
  // derrubava e recriava o canal.
  useEffect(() => {
    cancelarRealtime.current?.();
    cancelarRealtime.current = null;

    if (conta?.empresa.id) {
      cancelarRealtime.current = observarContextoDaConta(conta.empresa.id, () => {
        void carregarConta(sessaoRef.current);
      });
    }

    return () => {
      cancelarRealtime.current?.();
      cancelarRealtime.current = null;
    };
  }, [conta?.empresa.id, carregarConta]);

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
