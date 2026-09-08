/**
 * Scanner de código de barras — Seção 7.3.
 *
 * "Abre a câmera para leitura de código de barras. Identificado o produto,
 * adiciona automaticamente à venda; não identificado, aciona o mesmo fluxo de
 * 'Produto não cadastrado' (Seção 8.2)."
 */
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import { LeitorDeCodigo } from '@/componentes/LeitorDeCodigo';
import { useCarrinho } from '@/contexto/CarrinhoContexto';
import { useSessao } from '@/contexto/SessaoContexto';
import { buscarProdutoPorCodigo } from '@/dados/produtos';
import { AVISO_PRODUTO_NAO_CADASTRADO } from '@/dados/vendas';
import { textoDoErro } from '@/lib/erros';

export default function Scanner() {
  const { temPermissao, podeEscrever } = useSessao();
  const carrinho = useCarrinho();

  const [processando, setProcessando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const aoLer = useCallback(
    async ({ data }: { data: string }) => {
      // A câmera dispara em rajada: ignora leituras enquanto uma está em curso.
      if (processando || naoEncontrado) return;

      setProcessando(true);
      setErro(null);

      try {
        const produto = await buscarProdutoPorCodigo(data);

        if (!produto) {
          setNaoEncontrado(data);
          return;
        }

        const jaNoCarrinho = carrinho.quantidadeDe(produto.id);
        if (jaNoCarrinho + 1 > produto.estoque_disponivel) {
          // A divergência (Seção 8.1) é resolvida na tela de venda, que tem o
          // painel com as duas saídas. Aqui só devolvemos o usuário para lá.
          setErro(
            `${produto.nome} tem apenas ${produto.estoque_disponivel} unidade(s) disponível(is)` +
              (produto.estoque_reservado > 0
                ? ` (${produto.estoque_reservado} reservado(s) para pedidos da loja). `
                : '. ') +
              'Ajuste a quantidade na tela da venda.',
          );
          return;
        }

        carrinho.adicionar(produto, 1);
        router.back();
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível consultar o produto.'));
      } finally {
        setProcessando(false);
      }
    },
    [processando, naoEncontrado, carrinho],
  );

  // Seção 8.2 — produto não cadastrado.
  if (naoEncontrado) {
    return (
      <SafeAreaView style={estilos.telaMensagem}>
        <Text style={estilos.titulo}>{AVISO_PRODUTO_NAO_CADASTRADO}</Text>
        <Text style={estilos.codigo}>Código lido: {naoEncontrado}</Text>

        {temPermissao('cadastrar_produto') && podeEscrever ? (
          <Botao
            titulo="Cadastrar e vender"
            aoPressionar={() =>
              router.replace({
                pathname: '/vendas/cadastro-rapido',
                params: { codigo: naoEncontrado },
              })
            }
          />
        ) : (
          <Text style={estilos.aviso}>Peça ao Gestor para cadastrar este produto.</Text>
        )}

        <Botao
          titulo="Escanear outro"
          variante="secundario"
          aoPressionar={() => setNaoEncontrado(null)}
        />
        <Botao titulo="Voltar" variante="texto" aoPressionar={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <LeitorDeCodigo
      aoLer={(codigo) => void aoLer({ data: codigo })}
      aoCancelar={() => router.back()}
      pausado={processando}
      instrucao={erro ?? 'Aponte a câmera para o código de barras do produto.'}
    />
  );
}

// A câmera e a sobreposição saíram daqui para `LeitorDeCodigo`, que sabe fazer
// isso nas duas plataformas. O que sobra nesta tela é a decisão do que fazer
// com o código lido — e é só disso que estes estilos tratam.
const estilos = StyleSheet.create({
  telaMensagem: {
    flex: 1,
    backgroundColor: tema.cores.fundo,
    justifyContent: 'center',
    padding: tema.espacamento.lg,
    gap: tema.espacamento.sm,
  },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  codigo: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.lg,
  },
  aviso: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginBottom: tema.espacamento.md },
});
