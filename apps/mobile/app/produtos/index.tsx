/**
 * Tela Estoque — Seção 7.5.
 *
 * Pesquisa por nome/código, filtros por categoria e pelos campos
 * personalizados ativados pela empresa, e acesso ao cadastro completo.
 *
 * O botão "Adicionar produto" exige `cadastrar_produto` — escondê-lo é só
 * cortesia de interface; quem barra de fato é a RLS (Seção 9.1).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { BadgeArquivado, BadgeStatus } from '@/componentes/BadgeStatus';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Seletor } from '@/componentes/Seletor';
import { useSessao } from '@/contexto/SessaoContexto';
import { listarCamposAtivos, type CampoConfigurado } from '@/dados/camposProduto';
import { listarCategorias, type Categoria } from '@/dados/categorias';
import { listarProdutos, observarProdutos, type ProdutoComStatus } from '@/dados/produtos';
import { moeda } from '@/lib/formato';

export default function TelaEstoque() {
  const { conta, temPermissao, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [produtos, setProdutos] = useState<ProdutoComStatus[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [campos, setCampos] = useState<CampoConfigurado[]>([]);

  const [busca, setBusca] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [filtrosDeAtributo, setFiltrosDeAtributo] = useState<Record<string, string>>({});
  const [verArquivados, setVerArquivados] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!empresaId) return;
      if (!silencioso) setCarregando(true);
      try {
        const [lista, cats, camposAtivos] = await Promise.all([
          listarProdutos({
            busca,
            categoriaId,
            atributos: filtrosDeAtributo,
            cicloVida: verArquivados ? 'arquivado' : 'ativo',
          }),
          listarCategorias(empresaId),
          listarCamposAtivos(empresaId),
        ]);
        setProdutos(lista);
        setCategorias(cats);
        setCampos(camposAtivos);
        setErro(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar o estoque.');
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [empresaId, busca, categoriaId, filtrosDeAtributo, verArquivados],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Seção 3.3 — inscrição no canal da empresa enquanto a tela está em foco,
  // cancelada ao sair.
  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      void carregar(true);
      return observarProdutos(empresaId, () => void carregar(true));
    }, [empresaId, carregar]),
  );

  // Filtros por campo personalizado: só os de seleção viram filtro de chip —
  // são os únicos com um conjunto conhecido de valores (Seção 7.5).
  const camposFiltraveis = useMemo(
    () => campos.filter((campo) => campo.tipo_campo === 'selecao' && campo.opcoes?.length),
    [campos],
  );

  if (!conta) return <TelaCarregando />;
  if (carregando) return <TelaCarregando />;

  if (erro) {
    return <TelaMensagem mensagem={erro} aoTentarNovamente={() => void carregar()} />;
  }

  const podeCadastrar = temPermissao('cadastrar_produto') && podeEscrever;

  return (
    <SafeAreaView style={estilos.tela}>
      <FlatList
        data={produtos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              void carregar(true);
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={estilos.titulo}>Estoque</Text>

            <CampoTexto
              rotulo="Pesquisar"
              valor={busca}
              aoMudar={setBusca}
              placeholder="Nome ou código do produto"
            />

            {categorias.length > 0 ? (
              <Seletor
                rotulo="Categoria"
                opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
                selecionado={categoriaId}
                aoSelecionar={setCategoriaId}
                permiteLimpar
                horizontal
              />
            ) : null}

            {camposFiltraveis.map((campo) => (
              <Seletor
                key={campo.id}
                rotulo={campo.nome_exibicao}
                opcoes={(campo.opcoes ?? []).map((o) => ({ valor: o, rotulo: o }))}
                selecionado={filtrosDeAtributo[campo.chave] ?? null}
                aoSelecionar={(valor) =>
                  setFiltrosDeAtributo((atual) => {
                    const proximos = { ...atual };
                    if (valor === null) delete proximos[campo.chave];
                    else proximos[campo.chave] = valor;
                    return proximos;
                  })
                }
                permiteLimpar
                horizontal
              />
            ))}

            <Seletor
              opcoes={[
                { valor: 'ativos', rotulo: 'Ativos' },
                { valor: 'arquivados', rotulo: 'Arquivados' },
              ]}
              selecionado={verArquivados ? 'arquivados' : 'ativos'}
              aoSelecionar={(valor) => setVerArquivados(valor === 'arquivados')}
              horizontal
            />

            {podeCadastrar ? (
              <Botao
                titulo="Adicionar produto"
                aoPressionar={() => router.push('/produtos/novo')}
                estilo={{ marginBottom: tema.espacamento.md }}
              />
            ) : null}

            {!podeEscrever ? (
              <Aviso
                tom="alerta"
                mensagem="Sua conta está em modo de consulta. Não é possível cadastrar ou alterar produtos."
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={estilos.vazio}>
            {busca || categoriaId || Object.keys(filtrosDeAtributo).length > 0
              ? 'Nenhum produto encontrado com esses filtros.'
              : verArquivados
                ? 'Nenhum produto arquivado.'
                : 'Nenhum produto cadastrado ainda.'}
          </Text>
        }
        renderItem={({ item }) => (
          <ItemDeProduto produto={item} aoTocar={() => router.push(`/produtos/${item.id}`)} />
        )}
      />
    </SafeAreaView>
  );
}

function ItemDeProduto({
  produto,
  aoTocar,
}: {
  produto: ProdutoComStatus;
  aoTocar: () => void;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      style={({ pressed }) => [estilos.item, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
    >
      <View style={estilos.itemInfo}>
        <Text style={estilos.itemNome} numberOfLines={1}>
          {produto.nome}
        </Text>

        <Text style={estilos.itemDetalhe} numberOfLines={1}>
          {[produto.categoria_nome, produto.codigo].filter(Boolean).join(' · ') || 'Sem categoria'}
        </Text>

        <View style={estilos.itemBadges}>
          {produto.ciclo_vida === 'arquivado' ? (
            <BadgeArquivado />
          ) : (
            <BadgeStatus status={produto.status_estoque} />
          )}
        </View>
      </View>

      <View style={estilos.itemValores}>
        <Text style={estilos.itemPreco}>{moeda(produto.preco)}</Text>
        <Text style={estilos.itemEstoque}>{produto.estoque_atual} un.</Text>
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  vazio: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemInfo: { flex: 1, marginRight: tema.espacamento.sm },
  itemNome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemDetalhe: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: 2,
    marginBottom: tema.espacamento.xs,
  },
  itemBadges: { flexDirection: 'row' },
  itemValores: { alignItems: 'flex-end' },
  itemPreco: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  itemEstoque: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
});
