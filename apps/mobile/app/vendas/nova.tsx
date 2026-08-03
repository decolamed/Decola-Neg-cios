/**
 * Tela Nova Venda — Seções 7.3, 8.1 e 8.2.
 *
 * Pesquisa por nome, código cadastrado ou código de barras, com sugestões
 * durante a digitação (só produtos `ativo`). Produto inexistente aciona
 * "Cadastrar e vender". Exceder o estoque aciona a Divergência de Estoque.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { PainelDeDesconto } from '@/componentes/PainelDeDesconto';
import { PainelDeDivergencia } from '@/componentes/PainelDeDivergencia';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import { useCarrinho, type ItemDoCarrinho } from '@/contexto/CarrinhoContexto';
import { useSessao } from '@/contexto/SessaoContexto';
import { listarProdutos, type ProdutoComStatus } from '@/dados/produtos';
import { AVISO_ESTOQUE_INSUFICIENTE, AVISO_PRODUTO_NAO_CADASTRADO } from '@/dados/vendas';
import { moeda } from '@/lib/formato';

export default function NovaVenda() {
  const { conta, temPermissao, podeEscrever } = useSessao();
  const carrinho = useCarrinho();

  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<ProdutoComStatus[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  /** Produto em divergência aguardando decisão do usuário (Seção 8.1). */
  const [divergencia, setDivergencia] = useState<{
    produtoId: string;
    nome: string;
    disponivel: number;
    solicitado: number;
  } | null>(null);

  const [mostrarDesconto, setMostrarDesconto] = useState(false);

  // Sugestões durante a digitação (Seção 7.3).
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length === 0) {
      setSugestoes([]);
      return;
    }

    let cancelado = false;
    setBuscando(true);

    const temporizador = setTimeout(async () => {
      try {
        const encontrados = await listarProdutos({ busca: termo, cicloVida: 'ativo' });
        if (!cancelado) setSugestoes(encontrados);
      } catch {
        if (!cancelado) setSugestoes([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 300);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [busca]);

  /**
   * Seção 8.1 — verifica o estoque ANTES de aumentar a quantidade. A regra
   * dispara sempre que o solicitado passa do disponível, não só quando o
   * estoque está zerado.
   */
  const tentarDefinirQuantidade = useCallback(
    (item: ItemDoCarrinho, novaQuantidade: number) => {
      setMensagem(null);

      if (novaQuantidade > item.estoqueDisponivel) {
        setDivergencia({
          produtoId: item.produtoId,
          nome: item.nome,
          disponivel: item.estoqueDisponivel,
          solicitado: novaQuantidade,
        });
        return;
      }

      carrinho.definirQuantidade(item.produtoId, novaQuantidade);
    },
    [carrinho],
  );

  const adicionarProduto = useCallback(
    (produto: ProdutoComStatus) => {
      setMensagem(null);
      const jaNoCarrinho = carrinho.quantidadeDe(produto.id);

      if (jaNoCarrinho + 1 > produto.estoque_atual) {
        setDivergencia({
          produtoId: produto.id,
          nome: produto.nome,
          disponivel: produto.estoque_atual,
          solicitado: jaNoCarrinho + 1,
        });
        return;
      }

      carrinho.adicionar(produto, 1);
      setBusca('');
      setSugestoes([]);
    },
    [carrinho],
  );

  const podeContinuar = carrinho.itens.length > 0 && podeEscrever;

  const rodape = useMemo(
    () => (
      <View style={estilos.rodape}>
        <View style={estilos.linhaTotal}>
          <Text style={estilos.rotuloTotal}>Subtotal</Text>
          <Text style={estilos.valorSubtotal}>{moeda(carrinho.subtotal)}</Text>
        </View>

        {carrinho.desconto > 0 ? (
          <View style={estilos.linhaTotal}>
            <Text style={estilos.rotuloTotal}>Desconto</Text>
            <Text style={estilos.valorDesconto}>- {moeda(carrinho.desconto)}</Text>
          </View>
        ) : null}

        <View style={estilos.linhaTotal}>
          <Text style={estilos.rotuloTotalDestaque}>Total</Text>
          <Text style={estilos.valorTotal}>{moeda(carrinho.total)}</Text>
        </View>

        <Botao
          titulo={carrinho.desconto > 0 ? 'Alterar desconto' : 'Adicionar desconto'}
          variante="texto"
          aoPressionar={() => setMostrarDesconto(true)}
          desabilitado={carrinho.itens.length === 0}
        />

        <Botao
          titulo="Continuar"
          aoPressionar={() => router.push('/vendas/finalizar')}
          desabilitado={!podeContinuar}
        />
      </View>
    ),
    [carrinho.subtotal, carrinho.desconto, carrinho.total, carrinho.itens.length, podeContinuar],
  );

  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar sua conta." />;

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={carrinho.itens}
          keyExtractor={(item) => item.produtoId}
          contentContainerStyle={estilos.conteudo}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View>
              <Text style={estilos.titulo}>Nova venda</Text>

              {!podeEscrever ? (
                <Aviso
                  tom="erro"
                  mensagem="Sua conta está em modo de consulta. Não é possível registrar vendas."
                />
              ) : null}

              {mensagem ? <Aviso mensagem={mensagem} /> : null}

              <View style={estilos.linhaBusca}>
                <View style={estilos.campoBusca}>
                  <CampoTexto
                    rotulo="Buscar produto"
                    valor={busca}
                    aoMudar={setBusca}
                    placeholder="Nome ou código"
                  />
                </View>
                <Botao
                  titulo="Escanear"
                  variante="secundario"
                  aoPressionar={() => router.push('/vendas/scanner')}
                  estilo={estilos.botaoScanner}
                />
              </View>

              {/* Sugestões durante a digitação */}
              {busca.trim().length > 0 ? (
                sugestoes.length > 0 ? (
                  <View style={estilos.sugestoes}>
                    {sugestoes.map((produto) => (
                      <Pressable
                        key={produto.id}
                        onPress={() => adicionarProduto(produto)}
                        style={({ pressed }) => [estilos.sugestao, pressed && { opacity: 0.85 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={estilos.sugestaoNome}>{produto.nome}</Text>
                          <Text style={estilos.sugestaoDetalhe}>
                            {produto.codigo ? `${produto.codigo} · ` : ''}
                            {produto.estoque_atual} em estoque
                          </Text>
                        </View>
                        <Text style={estilos.sugestaoPreco}>{moeda(produto.preco)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : buscando ? null : (
                  // Seção 8.2 — produto não encontrado.
                  <View style={estilos.naoCadastrado}>
                    <Text style={estilos.textoNaoCadastrado}>{AVISO_PRODUTO_NAO_CADASTRADO}</Text>
                    {temPermissao('cadastrar_produto') && podeEscrever ? (
                      <Botao
                        titulo="Cadastrar e vender"
                        variante="secundario"
                        aoPressionar={() =>
                          router.push({
                            pathname: '/vendas/cadastro-rapido',
                            params: { termo: busca.trim() },
                          })
                        }
                      />
                    ) : (
                      <Text style={estilos.semPermissao}>
                        Peça ao Gestor para cadastrar este produto.
                      </Text>
                    )}
                  </View>
                )
              ) : null}

              {carrinho.itens.length > 0 ? <Text style={estilos.secao}>Carrinho</Text> : null}
            </View>
          }
          ListEmptyComponent={
            busca.trim().length === 0 ? (
              <Text style={estilos.vazio}>
                Busque ou escaneie um produto para começar a venda.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ItemCarrinho
              item={item}
              aoAlterar={(quantidade) => tentarDefinirQuantidade(item, quantidade)}
              aoRemover={() => carrinho.remover(item.produtoId)}
            />
          )}
          ListFooterComponent={carrinho.itens.length > 0 ? rodape : null}
        />
      </KeyboardAvoidingView>

      {/* Seção 8.1 — Divergência de Estoque */}
      {divergencia ? (
        <PainelDeDivergencia
          produtoId={divergencia.produtoId}
          nome={divergencia.nome}
          disponivel={divergencia.disponivel}
          solicitado={divergencia.solicitado}
          podeAjustar={temPermissao('gerenciar_estoque') && podeEscrever}
          aoCancelar={() => setDivergencia(null)}
          aoAjustar={(novoEstoque) => {
            carrinho.atualizarEstoqueConhecido(divergencia.produtoId, novoEstoque);
            carrinho.definirQuantidade(
              divergencia.produtoId,
              Math.min(divergencia.solicitado, novoEstoque),
            );
            setDivergencia(null);
          }}
        />
      ) : null}

      {mostrarDesconto ? (
        <PainelDeDesconto
          subtotal={carrinho.subtotal}
          tipoAtual={carrinho.descontoTipo}
          valorAtual={carrinho.descontoValor}
          aoFechar={() => setMostrarDesconto(false)}
          aoAplicar={(tipo, valor) => {
            carrinho.definirDesconto(tipo, valor);
            setMostrarDesconto(false);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function ItemCarrinho({
  item,
  aoAlterar,
  aoRemover,
}: {
  item: ItemDoCarrinho;
  aoAlterar: (quantidade: number) => void;
  aoRemover: () => void;
}) {
  return (
    <View style={estilos.item}>
      <View style={estilos.itemTopo}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.itemNome}>{item.nome}</Text>
          {item.codigo ? <Text style={estilos.itemCodigo}>{item.codigo}</Text> : null}
          <Text style={estilos.itemPreco}>{moeda(item.precoUnitario)} cada</Text>
        </View>
        <Text style={estilos.itemSubtotal}>{moeda(item.precoUnitario * item.quantidade)}</Text>
      </View>

      <View style={estilos.controles}>
        <Pressable
          onPress={() => aoAlterar(item.quantidade - 1)}
          style={({ pressed }) => [estilos.botaoQuantidade, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Diminuir quantidade"
        >
          <Text style={estilos.simbolo}>−</Text>
        </Pressable>

        <CampoTexto
          rotulo=""
          valor={String(item.quantidade)}
          aoMudar={(texto) => {
            const numero = Number(texto.replace(/[^0-9]/g, ''));
            aoAlterar(Number.isFinite(numero) ? numero : 0);
          }}
        />

        <Pressable
          onPress={() => aoAlterar(item.quantidade + 1)}
          style={({ pressed }) => [estilos.botaoQuantidade, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Aumentar quantidade"
        >
          <Text style={estilos.simbolo}>+</Text>
        </Pressable>

        <Botao titulo="Remover" variante="texto" aoPressionar={aoRemover} />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  linhaBusca: { flexDirection: 'row', alignItems: 'flex-end', gap: tema.espacamento.sm },
  campoBusca: { flex: 1 },
  botaoScanner: { marginBottom: tema.espacamento.md, paddingHorizontal: tema.espacamento.md },
  sugestoes: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  sugestao: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tema.espacamento.md,
    borderBottomWidth: 1,
    borderBottomColor: tema.cores.borda,
  },
  sugestaoNome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  sugestaoDetalhe: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  sugestaoPreco: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  naoCadastrado: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  textoNaoCadastrado: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.sm,
  },
  semPermissao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  secao: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  vazio: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.lg,
  },
  item: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start' },
  itemNome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemCodigo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  itemPreco: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  itemSubtotal: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  controles: { flexDirection: 'row', alignItems: 'center', gap: tema.espacamento.sm },
  botaoQuantidade: {
    width: 40,
    height: 40,
    borderRadius: tema.raio.sm,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tema.espacamento.md,
  },
  simbolo: { ...tema.tipografia.h2, color: tema.cores.primaria },
  rodape: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginTop: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  linhaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tema.espacamento.xs,
  },
  rotuloTotal: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  rotuloTotalDestaque: { ...tema.tipografia.h2, color: tema.cores.texto },
  valorSubtotal: { ...tema.tipografia.corpo, color: tema.cores.texto },
  valorDesconto: { ...tema.tipografia.corpo, color: tema.cores.negativo },
  valorTotal: { ...tema.tipografia.h2, color: tema.cores.primaria },
});
