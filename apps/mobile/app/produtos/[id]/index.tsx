/**
 * Detalhes do Produto — Seção 7.5.
 *
 * Ações: Editar (`editar_produto`), Adicionar estoque e Reduzir estoque
 * (`gerenciar_estoque`), Arquivar/Restaurar e Excluir (`excluir_produto`).
 *
 * Regras que a tela precisa respeitar literalmente:
 *   - a redução manual exige CONFIRMAÇÃO e MOTIVO obrigatório (Seção 7.5);
 *   - a exclusão precisa deixar claro que não há desfazer pela interface
 *     (Seção 8.4);
 *   - o arquivamento é reversível.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { BadgeArquivado, BadgeStatus } from '@/componentes/BadgeStatus';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { listarCamposAtivos, type CampoConfigurado } from '@/dados/camposProduto';
import {
  ajustarEstoque,
  arquivarProduto,
  buscarProduto,
  excluirProduto,
  restaurarProduto,
  type ProdutoComStatus,
} from '@/dados/produtos';
import { moeda } from '@/lib/formato';

export default function DetalhesDoProduto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conta, temPermissao, podeEscrever } = useSessao();

  const [produto, setProduto] = useState<ProdutoComStatus | null>(null);
  const [campos, setCampos] = useState<CampoConfigurado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  // Painel de ajuste de estoque.
  const [painel, setPainel] = useState<'nenhum' | 'adicionar' | 'reduzir'>('nenhum');
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erroQuantidade, setErroQuantidade] = useState<string | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!id || !conta) return;
    try {
      const [encontrado, ativos] = await Promise.all([
        buscarProduto(id),
        listarCamposAtivos(conta.empresa.id),
      ]);
      setProduto(encontrado);
      setCampos(ativos);
      setErro(encontrado ? null : 'Produto não encontrado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o produto.');
    } finally {
      setCarregando(false);
    }
  }, [id, conta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const fecharPainel = () => {
    setPainel('nenhum');
    setQuantidade('');
    setMotivo('');
    setErroQuantidade(null);
    setErroMotivo(null);
  };

  const aplicarAjuste = useCallback(async () => {
    if (!produto) return;

    setErroQuantidade(null);
    setErroMotivo(null);
    setMensagem(null);

    const numero = Number(quantidade);
    if (!Number.isInteger(numero) || numero <= 0) {
      setErroQuantidade('Informe uma quantidade maior que zero.');
      return;
    }

    // Seção 7.5 — motivo obrigatório na redução manual.
    if (painel === 'reduzir' && motivo.trim().length === 0) {
      setErroMotivo('Informe o motivo da redução.');
      return;
    }

    if (painel === 'reduzir' && numero > produto.estoque_atual) {
      setErroQuantidade(`Há apenas ${produto.estoque_atual} unidade(s) em estoque.`);
      return;
    }

    const aplicar = async () => {
      setProcessando(true);
      try {
        await ajustarEstoque({
          produtoId: produto.id,
          quantidade: painel === 'reduzir' ? -numero : numero,
          motivo: painel === 'reduzir' ? motivo : null,
          tipo: painel === 'reduzir' ? 'reducao_manual' : 'reposicao',
        });
        fecharPainel();
        await carregar();
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível ajustar o estoque.');
      } finally {
        setProcessando(false);
      }
    };

    if (painel === 'reduzir') {
      // Seção 7.5 — a redução exige confirmação antes de aplicar.
      Alert.alert(
        'Confirmar redução de estoque',
        `Reduzir ${numero} unidade(s) de "${produto.nome}"?\n\nMotivo: ${motivo.trim()}`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar', style: 'destructive', onPress: () => void aplicar() },
        ],
      );
      return;
    }

    await aplicar();
  }, [produto, quantidade, motivo, painel, carregar]);

  const confirmarArquivar = useCallback(() => {
    if (!produto) return;
    Alert.alert(
      'Arquivar produto',
      `"${produto.nome}" deixará de aparecer nas vendas, mas todo o histórico é mantido e você pode restaurá-lo depois.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Arquivar',
          onPress: async () => {
            setProcessando(true);
            try {
              await arquivarProduto(produto.id);
              await carregar();
            } catch (e) {
              setMensagem(e instanceof Error ? e.message : 'Não foi possível arquivar.');
            } finally {
              setProcessando(false);
            }
          },
        },
      ],
    );
  }, [produto, carregar]);

  const confirmarExcluir = useCallback(() => {
    if (!produto) return;
    // Seção 8.4 — a confirmação deve deixar claro que não há desfazer.
    Alert.alert(
      'Excluir produto',
      `"${produto.nome}" sairá de todas as listas e NÃO poderá ser restaurado pelo aplicativo.\n\n` +
        'O histórico de vendas é preservado. Se você só quer parar de vender por um tempo, use Arquivar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir definitivamente',
          style: 'destructive',
          onPress: async () => {
            setProcessando(true);
            try {
              await excluirProduto(produto.id);
              router.back();
            } catch (e) {
              setMensagem(e instanceof Error ? e.message : 'Não foi possível excluir.');
              setProcessando(false);
            }
          },
        },
      ],
    );
  }, [produto]);

  if (carregando) return <TelaCarregando />;
  if (erro || !produto) {
    return <TelaMensagem mensagem={erro ?? 'Produto não encontrado.'} aoTentarNovamente={carregar} />;
  }

  const podeGerenciarEstoque = temPermissao('gerenciar_estoque') && podeEscrever;
  const podeEditar = temPermissao('editar_produto') && podeEscrever;
  const podeArquivarOuExcluir = temPermissao('excluir_produto') && podeEscrever;

  const atributosPreenchidos = campos
    .map((campo) => ({ campo, valor: produto.atributos?.[campo.chave] }))
    .filter((item) => item.valor !== undefined && item.valor !== null && item.valor !== '');

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.nome}>{produto.nome}</Text>
        <Text style={estilos.detalhe}>
          {[produto.categoria_nome, produto.codigo].filter(Boolean).join(' · ') || 'Sem categoria'}
        </Text>

        <View style={estilos.badges}>
          {produto.ciclo_vida === 'arquivado' ? (
            <BadgeArquivado />
          ) : (
            <BadgeStatus status={produto.status_estoque} />
          )}
        </View>

        {mensagem ? <Aviso mensagem={mensagem} /> : null}

        <View style={estilos.card}>
          <Linha rotulo="Preço" valor={moeda(produto.preco)} />
          <Linha rotulo="Em estoque" valor={`${produto.estoque_atual} unidade(s)`} />
          <Linha
            rotulo="Referência do ciclo"
            valor={`${produto.estoque_referencia_alerta} unidade(s)`}
          />
          {produto.percentual_restante !== null ? (
            <Linha rotulo="Restante do ciclo" valor={`${produto.percentual_restante}%`} />
          ) : null}
        </View>

        {atributosPreenchidos.length > 0 ? (
          <View style={estilos.card}>
            {atributosPreenchidos.map(({ campo, valor }) => (
              <Linha
                key={campo.id}
                rotulo={campo.nome_exibicao}
                valor={
                  typeof valor === 'boolean' ? (valor ? 'Sim' : 'Não') : String(valor)
                }
              />
            ))}
          </View>
        ) : null}

        {/* Painel de ajuste de estoque */}
        {painel !== 'nenhum' ? (
          <View style={estilos.card}>
            <Text style={estilos.tituloPainel}>
              {painel === 'adicionar' ? 'Adicionar estoque' : 'Reduzir estoque'}
            </Text>

            {painel === 'adicionar' ? (
              <Text style={estilos.nota}>
                A reposição inicia um novo ciclo de alerta: a referência passa a ser a nova
                quantidade total.
              </Text>
            ) : null}

            <CampoTexto
              rotulo="Quantidade"
              valor={quantidade}
              aoMudar={(v) => setQuantidade(v.replace(/[^0-9]/g, ''))}
              erro={erroQuantidade}
              bloqueado={processando}
            />

            {painel === 'reduzir' ? (
              <CampoTexto
                rotulo="Motivo *"
                valor={motivo}
                aoMudar={setMotivo}
                erro={erroMotivo}
                bloqueado={processando}
                placeholder="Ex.: produto danificado, perda, ajuste de contagem"
              />
            ) : null}

            <Botao
              titulo={painel === 'adicionar' ? 'Adicionar' : 'Reduzir'}
              aoPressionar={aplicarAjuste}
              carregando={processando}
              variante={painel === 'reduzir' ? 'primario' : 'secundario'}
            />
            <Botao titulo="Cancelar" variante="texto" aoPressionar={fecharPainel} />
          </View>
        ) : null}

        {/* Ações */}
        {podeGerenciarEstoque && painel === 'nenhum' ? (
          <>
            <Botao
              titulo="Adicionar estoque"
              variante="secundario"
              aoPressionar={() => setPainel('adicionar')}
              estilo={{ marginBottom: tema.espacamento.sm }}
            />
            <Botao
              titulo="Reduzir estoque"
              variante="texto"
              aoPressionar={() => setPainel('reduzir')}
            />
          </>
        ) : null}

        {podeEditar ? (
          <Botao
            titulo="Editar produto"
            variante="secundario"
            aoPressionar={() => router.push(`/produtos/${produto.id}/editar`)}
            estilo={{ marginTop: tema.espacamento.md }}
          />
        ) : null}

        {podeArquivarOuExcluir ? (
          <View style={estilos.acoesDestrutivas}>
            {produto.ciclo_vida === 'arquivado' ? (
              <Botao
                titulo="Restaurar produto"
                variante="secundario"
                carregando={processando}
                aoPressionar={async () => {
                  setProcessando(true);
                  try {
                    await restaurarProduto(produto.id);
                    await carregar();
                  } catch (e) {
                    setMensagem(e instanceof Error ? e.message : 'Não foi possível restaurar.');
                  } finally {
                    setProcessando(false);
                  }
                }}
              />
            ) : (
              <Botao titulo="Arquivar produto" variante="texto" aoPressionar={confirmarArquivar} />
            )}

            <Botao titulo="Excluir produto" aoPressionar={confirmarExcluir} />
          </View>
        ) : null}

        {!podeEscrever ? (
          <Aviso
            tom="alerta"
            mensagem="Sua conta está em modo de consulta. As ações de alteração estão indisponíveis."
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.linhaRotulo}>{rotulo}</Text>
      <Text style={estilos.linhaValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  nome: { ...tema.tipografia.h1, color: tema.cores.texto },
  detalhe: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginTop: 2 },
  badges: { flexDirection: 'row', marginTop: tema.espacamento.sm, marginBottom: tema.espacamento.md },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  tituloPainel: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  nota: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.md,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tema.espacamento.xs,
  },
  linhaRotulo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, flex: 1 },
  linhaValor: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    textAlign: 'right',
    flex: 1,
  },
  acoesDestrutivas: { marginTop: tema.espacamento.xl, gap: tema.espacamento.sm },
});
