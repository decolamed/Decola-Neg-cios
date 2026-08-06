/**
 * Tela Estoque Baixo — Seções 7.6 e 8.3.
 *
 * Lista produtos esgotados e abaixo do limite configurado, com nome,
 * categoria, quantidade atual, percentual restante, status e um botão rápido
 * de "Adicionar estoque" direto na lista.
 *
 * Ao repor, o produto sai da lista imediatamente se deixar a condição de
 * alerta, porque a reposição reinicia o ciclo (a referência passa a ser a nova
 * quantidade total).
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { BadgeStatus } from '@/componentes/BadgeStatus';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { LadrilhoDeIcone } from '@/componentes/Icone';
import { useSessao } from '@/contexto/SessaoContexto';
import { ajustarEstoque, listarProdutos, observarProdutos, type ProdutoComStatus } from '@/dados/produtos';

export default function EstoqueBaixo() {
  const { conta, temPermissao, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [produtos, setProdutos] = useState<ProdutoComStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [reposicaoAberta, setReposicaoAberta] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [erroQuantidade, setErroQuantidade] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      setProdutos(await listarProdutos({ apenasEmAlerta: true }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os alertas.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      void carregar();
      return observarProdutos(empresaId, () => void carregar());
    }, [empresaId, carregar]),
  );

  const repor = useCallback(
    async (produto: ProdutoComStatus) => {
      setErroQuantidade(null);
      setMensagem(null);

      const numero = Number(quantidade);
      if (!Number.isInteger(numero) || numero <= 0) {
        setErroQuantidade('Informe uma quantidade maior que zero.');
        return;
      }

      setProcessando(true);
      try {
        await ajustarEstoque({ produtoId: produto.id, quantidade: numero, tipo: 'reposicao' });
        setReposicaoAberta(null);
        setQuantidade('');
        await carregar();
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível repor o estoque.');
      } finally {
        setProcessando(false);
      }
    },
    [quantidade, carregar],
  );

  if (!conta || carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  const podeRepor = temPermissao('gerenciar_estoque') && podeEscrever;

  return (
    <SafeAreaView style={estilos.tela}>
      <FlatList
        data={produtos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.conteudo}
        ListHeaderComponent={
          <View>
            <Text style={estilos.titulo}>Estoque Baixo</Text>
            <Text style={estilos.descricao}>
              Produtos que atingiram {conta.empresa.alerta_estoque_percentual}% ou menos da
              quantidade de referência, e produtos esgotados.
            </Text>
            {mensagem ? <Aviso mensagem={mensagem} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={estilos.vazio}>Nenhum produto precisa de reposição no momento.</Text>
        }
        renderItem={({ item }) => (
          <View style={estilos.item}>
            <View style={estilos.itemTopo}>
              <LadrilhoDeIcone
                nome="alerta"
                cor={
                  item.status_estoque === 'esgotado' ? tema.cores.negativo : tema.cores.alerta
                }
                tamanho={38}
              />

              <View style={estilos.itemInfo}>
                <Text style={estilos.itemNome} numberOfLines={1}>
                  {item.nome}
                </Text>
                <Text style={estilos.itemDetalhe}>{item.categoria_nome ?? 'Sem categoria'}</Text>
                <View style={estilos.itemBadge}>
                  <BadgeStatus status={item.status_estoque} />
                </View>
              </View>

              <View style={estilos.itemValores}>
                <Text style={estilos.itemQuantidade}>{item.estoque_atual} un.</Text>
                {item.percentual_restante !== null ? (
                  <Text style={estilos.itemPercentual}>{item.percentual_restante}% restante</Text>
                ) : null}
              </View>
            </View>

            {podeRepor ? (
              reposicaoAberta === item.id ? (
                <View style={estilos.painel}>
                  <CampoTexto
                    rotulo="Quantidade a adicionar"
                    valor={quantidade}
                    aoMudar={(v) => setQuantidade(v.replace(/[^0-9]/g, ''))}
                    erro={erroQuantidade}
                    bloqueado={processando}
                  />
                  <Botao
                    titulo="Confirmar reposição"
                    variante="secundario"
                    carregando={processando}
                    aoPressionar={() => void repor(item)}
                  />
                  <Botao
                    titulo="Cancelar"
                    variante="texto"
                    aoPressionar={() => {
                      setReposicaoAberta(null);
                      setQuantidade('');
                      setErroQuantidade(null);
                    }}
                  />
                </View>
              ) : (
                <Botao
                  titulo="Adicionar estoque"
                  variante="secundario"
                  aoPressionar={() => {
                    setReposicaoAberta(item.id);
                    setQuantidade('');
                    setErroQuantidade(null);
                  }}
                  estilo={{ marginTop: tema.espacamento.sm }}
                />
              )
            ) : (
              <Botao
                titulo="Ver produto"
                variante="texto"
                aoPressionar={() => router.push(`/produtos/${item.id}`)}
              />
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  vazio: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.lg,
  },
  item: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: tema.espacamento.md },
  itemInfo: { flex: 1 },
  itemNome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemDetalhe: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  itemBadge: { flexDirection: 'row', marginTop: tema.espacamento.xs },
  itemValores: { alignItems: 'flex-end' },
  itemQuantidade: { ...tema.tipografia.corpoDestacado, color: tema.cores.negativo },
  itemPercentual: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  painel: { marginTop: tema.espacamento.md },
});
