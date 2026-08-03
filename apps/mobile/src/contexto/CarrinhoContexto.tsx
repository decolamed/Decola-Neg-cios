/**
 * Carrinho da venda em andamento — Seções 7.3 e 7.4.
 *
 * Vive apenas em memória, de propósito: a venda só nasce no banco quando o
 * usuário confirma (Seção 7.4), e a V1 não tem tolerância offline (Seção 3.5).
 * Nada aqui é fonte de verdade — preço e total definitivos são calculados pelo
 * servidor no momento do registro.
 */
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { DescontoTipo } from '@/dados/vendas';
import type { ProdutoComStatus } from '@/dados/produtos';

export type ItemDoCarrinho = {
  produtoId: string;
  nome: string;
  codigo: string | null;
  precoUnitario: number;
  quantidade: number;
  /** Estoque conhecido no momento em que o item entrou — base da Seção 8.1. */
  estoqueDisponivel: number;
};

type EstadoDoCarrinho = {
  itens: ItemDoCarrinho[];
  descontoTipo: DescontoTipo | null;
  descontoValor: number;
  subtotal: number;
  desconto: number;
  total: number;
  quantidadeTotal: number;
  adicionar: (produto: ProdutoComStatus, quantidade?: number) => void;
  definirQuantidade: (produtoId: string, quantidade: number) => void;
  /** Atualiza o estoque conhecido após um ajuste de divergência (Seção 8.1). */
  atualizarEstoqueConhecido: (produtoId: string, estoque: number) => void;
  remover: (produtoId: string) => void;
  definirDesconto: (tipo: DescontoTipo | null, valor: number) => void;
  limpar: () => void;
  /** Quantidade já no carrinho para um produto. */
  quantidadeDe: (produtoId: string) => number;
};

const Contexto = createContext<EstadoDoCarrinho | null>(null);

export function ProvedorDeCarrinho({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemDoCarrinho[]>([]);
  const [descontoTipo, setDescontoTipo] = useState<DescontoTipo | null>(null);
  const [descontoValor, setDescontoValor] = useState(0);

  const adicionar = useCallback((produto: ProdutoComStatus, quantidade = 1) => {
    setItens((atuais) => {
      const existente = atuais.find((item) => item.produtoId === produto.id);
      if (existente) {
        return atuais.map((item) =>
          item.produtoId === produto.id
            ? {
                ...item,
                quantidade: item.quantidade + quantidade,
                // O produto pode ter sido recarregado com estoque novo.
                estoqueDisponivel: produto.estoque_atual,
                precoUnitario: produto.preco,
              }
            : item,
        );
      }

      return [
        ...atuais,
        {
          produtoId: produto.id,
          nome: produto.nome,
          codigo: produto.codigo,
          precoUnitario: produto.preco,
          quantidade,
          estoqueDisponivel: produto.estoque_atual,
        },
      ];
    });
  }, []);

  // Seção 7.3 — ao chegar a zero, o item sai do carrinho.
  const definirQuantidade = useCallback((produtoId: string, quantidade: number) => {
    setItens((atuais) =>
      quantidade <= 0
        ? atuais.filter((item) => item.produtoId !== produtoId)
        : atuais.map((item) => (item.produtoId === produtoId ? { ...item, quantidade } : item)),
    );
  }, []);

  const atualizarEstoqueConhecido = useCallback((produtoId: string, estoque: number) => {
    setItens((atuais) =>
      atuais.map((item) =>
        item.produtoId === produtoId ? { ...item, estoqueDisponivel: estoque } : item,
      ),
    );
  }, []);

  const remover = useCallback((produtoId: string) => {
    setItens((atuais) => atuais.filter((item) => item.produtoId !== produtoId));
  }, []);

  const definirDesconto = useCallback((tipo: DescontoTipo | null, valor: number) => {
    setDescontoTipo(tipo);
    setDescontoValor(valor);
  }, []);

  const limpar = useCallback(() => {
    setItens([]);
    setDescontoTipo(null);
    setDescontoValor(0);
  }, []);

  const valor = useMemo<EstadoDoCarrinho>(() => {
    const subtotal = itens.reduce((soma, item) => soma + item.precoUnitario * item.quantidade, 0);

    // Prévia do desconto para a interface. O valor que vale é o que o servidor
    // recalcula em `registrar_venda` (Seção 7.3).
    let desconto = 0;
    if (descontoTipo === 'percentual') {
      desconto = Math.round(subtotal * Math.min(descontoValor, 100)) / 100;
    } else if (descontoTipo === 'valor_fixo') {
      desconto = Math.min(descontoValor, subtotal);
    }
    desconto = Math.min(desconto, subtotal);

    return {
      itens,
      descontoTipo,
      descontoValor,
      subtotal,
      desconto,
      total: subtotal - desconto,
      quantidadeTotal: itens.reduce((soma, item) => soma + item.quantidade, 0),
      adicionar,
      definirQuantidade,
      atualizarEstoqueConhecido,
      remover,
      definirDesconto,
      limpar,
      quantidadeDe: (produtoId) =>
        itens.find((item) => item.produtoId === produtoId)?.quantidade ?? 0,
    };
  }, [
    itens,
    descontoTipo,
    descontoValor,
    adicionar,
    definirQuantidade,
    atualizarEstoqueConhecido,
    remover,
    definirDesconto,
    limpar,
  ]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCarrinho(): EstadoDoCarrinho {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useCarrinho precisa estar dentro de ProvedorDeCarrinho.');
  return contexto;
}
