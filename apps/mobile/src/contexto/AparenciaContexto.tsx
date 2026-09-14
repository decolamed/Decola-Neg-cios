/**
 * A preferência de tema, viva na árvore do app.
 *
 * Ela precisa de contexto por dois motivos, e nenhum deles é a cor das telas —
 * essa quem troca é o CSS, sozinho, quando o atributo do `<html>` muda (ver
 * `packages/theme/src/temas.ts`):
 *
 *   1. a tela de escolha precisa marcar qual opção está ativa;
 *   2. a barra de status do sistema tem de acompanhar — clara sobre fundo
 *      escuro e vice-versa —, e ela é um componente React.
 *
 * "Sistema" acompanha o aparelho AO VIVO: quem deixa o celular trocar de tema
 * ao anoitecer vê o app trocar junto, sem recarregar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  aparenciaGuardada,
  aplicarAparencia,
  instalarCoresDoTema,
  observarTemaDoSistema,
  temaEmVigor,
  type Aparencia,
} from '@decola/theme';

type Estado = {
  /** O que a pessoa escolheu: 'sistema', 'claro' ou 'escuro'. */
  aparencia: Aparencia;
  /** O que está valendo de fato — 'sistema' já resolvido. */
  emVigor: 'claro' | 'escuro';
  escolher: (nova: Aparencia) => void;
};

const Contexto = createContext<Estado | null>(null);

export function ProvedorDeAparencia({ children }: { children: ReactNode }) {
  // O CSS das variáveis entra antes da primeira pintura possível. Idempotente:
  // em desenvolvimento a raiz remonta, e uma segunda folha não é criada.
  const [aparencia, setAparencia] = useState<Aparencia>(() => {
    instalarCoresDoTema();
    const guardada = aparenciaGuardada();
    // Aplica sem regravar: só estamos repetindo o que já estava guardado.
    aplicarAparencia(guardada, false);
    return guardada;
  });

  const [emVigor, setEmVigor] = useState<'claro' | 'escuro'>(() => temaEmVigor(aparenciaGuardada()));

  // Em 'sistema', o aparelho manda — e pode mudar enquanto o app está aberto.
  useEffect(() => {
    if (aparencia !== 'sistema') return;
    return observarTemaDoSistema(() => {
      aplicarAparencia('sistema', false);
      setEmVigor(temaEmVigor('sistema'));
    });
  }, [aparencia]);

  const escolher = useCallback((nova: Aparencia) => {
    aplicarAparencia(nova);
    setAparencia(nova);
    setEmVigor(temaEmVigor(nova));
  }, []);

  const valor = useMemo(() => ({ aparencia, emVigor, escolher }), [aparencia, emVigor, escolher]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useAparencia(): Estado {
  const estado = useContext(Contexto);
  if (!estado) throw new Error('useAparencia precisa estar dentro de ProvedorDeAparencia.');
  return estado;
}

/**
 * A mesma coisa, para quem pode ser desenhado FORA da árvore.
 *
 * A marca aparece na tela de erro, que é o limite de erro do aplicativo — ela
 * roda justamente quando alguma coisa acima dela quebrou, e o provedor pode não
 * estar lá. Uma tela de erro que quebra ao tentar descobrir o tema é a pior
 * falha possível: some o único lugar que ia explicar o que houve.
 */
export function useAparenciaOpcional(): Estado | null {
  return useContext(Contexto);
}
