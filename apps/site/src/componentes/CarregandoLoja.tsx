/**
 * A tela enquanto a loja carrega.
 *
 * O QUE ESTAVA ERRADO. Era a palavra "Carregando a loja…" em cinza, no canto
 * superior esquerdo, com o rodapé da plataforma logo abaixo escrito "Loja
 * online feita com Decola Negócios". Nos dois segundos mais importantes da
 * visita — o primeiro contato do cliente com a loja do lojista — a única marca
 * na tela era a NOSSA.
 *
 * DÁ PARA USAR A IDENTIDADE DO LOJISTA AQUI? Em parte, e a parte importa.
 *
 * Na PRIMEIRA visita, não: as cores e a logo vêm exatamente da consulta que
 * estamos esperando. Não existe como pintar a tela com uma informação que ainda
 * não chegou, e fingir que existe (adivinhando pelo slug, carregando duas
 * vezes) custaria mais tempo de tela do que economizaria.
 *
 * Nas DEMAIS, sim. As cores da loja ficam guardadas neste navegador assim que
 * chegam, e a partir daí toda abertura — voltar depois, recarregar, navegar
 * entre as telas da loja — já começa com a cara dela. É onde a maioria das
 * aberturas está, porque quem volta numa loja volta várias vezes.
 *
 * NA PRIMEIRA VEZ A TELA É NEUTRA, e neutra de propósito: nada de logo da
 * Decola, nada de cor da Decola. Um giro discreto sobre um fundo claro não
 * afirma nada sobre de quem é a loja — que é exatamente o que se quer enquanto
 * a resposta não chega.
 */
import { useEffect, useState } from 'react';
import { CORES_PADRAO, corDeLojaValida } from '@decola/theme';

const CHAVE = 'decola-cara-da-loja';

/** O pouco que precisa estar guardado para a abertura já ter cor. */
export type CaraDaLoja = { nome: string; destaque: string; fundo: string };

type Guardado = Record<string, CaraDaLoja>;

function ler(): Guardado {
  try {
    const bruto = localStorage.getItem(CHAVE);
    const dados = bruto ? (JSON.parse(bruto) as Guardado) : {};
    return dados && typeof dados === 'object' ? dados : {};
  } catch {
    return {};
  }
}

/** Guarda a cara da loja para a PRÓXIMA abertura. Chamado quando ela carrega. */
export function lembrarCaraDaLoja(slug: string, cara: CaraDaLoja): void {
  try {
    const dados = ler();
    const chave = slug.toLowerCase();
    const atual = dados[chave];
    if (
      atual &&
      atual.nome === cara.nome &&
      atual.destaque === cara.destaque &&
      atual.fundo === cara.fundo
    ) {
      return; // Nada mudou: não reescreve o armazenamento a cada navegação.
    }
    // Poucas lojas bastam. Sem o corte, quem abre muitos links acumula para
    // sempre um armazenamento que ninguém limpa.
    const outras = Object.entries(dados).filter(([s]) => s !== chave).slice(0, 9);
    localStorage.setItem(CHAVE, JSON.stringify({ ...Object.fromEntries(outras), [chave]: cara }));
  } catch {
    /* armazenamento bloqueado: a abertura seguinte só será neutra. */
  }
}

export function caraDaLojaGuardada(slug: string | undefined): CaraDaLoja | null {
  if (!slug) return null;
  const guardada = ler()[slug.toLowerCase()];
  if (!guardada || !corDeLojaValida(guardada.destaque) || !corDeLojaValida(guardada.fundo)) return null;
  return guardada;
}

export function CarregandoLoja({ slug }: { slug?: string }) {
  const cara = caraDaLojaGuardada(slug);

  /**
   * O NOME SÓ APARECE DEPOIS DE UM INSTANTE.
   *
   * Numa conexão boa a loja chega em 200ms, e um nome que pisca e some é pior
   * do que tela nenhuma — parece defeito. Depois de meio segundo a espera já é
   * perceptível, e aí o nome da loja é o que diz à pessoa que ela está no lugar
   * certo. O giro aparece desde o início, com uma animação que começa
   * transparente pelo mesmo motivo.
   */
  const [demorou, setDemorou] = useState(false);
  useEffect(() => {
    const relogio = setTimeout(() => setDemorou(true), 500);
    return () => clearTimeout(relogio);
  }, []);

  const destaque = cara?.destaque ?? '#C9D4E2';
  const fundo = cara?.fundo ?? CORES_PADRAO.fundo;

  return (
    <div
      className="vitrine-carregando"
      style={{ background: fundo, color: destaque }}
      role="status"
      aria-live="polite"
    >
      {/* Um arco que gira, desenhado em SVG: não depende de fonte, não pisca no
          primeiro quadro e fica nítido em qualquer densidade de tela. */}
      <svg className="giro" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" opacity="0.18" />
        <path
          d="M24 4a20 20 0 0 1 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>

      <span className={demorou ? 'nome visivel' : 'nome'}>{cara?.nome ?? ''}</span>
      <span className="sr-apenas">Carregando a loja</span>
    </div>
  );
}
