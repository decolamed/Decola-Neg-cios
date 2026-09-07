/**
 * Tela Financeiro — Seções 7.7 e 8.6.
 *
 * "Financeiro foca em saldo e movimentações do dia a dia (visão operacional,
 * com o resumo de entradas/saídas)"; a análise por período com gráficos e
 * exportação fica em Relatórios, tela separada.
 *
 * Exige `visualizar_financeiro` (Seção 5.3) — a RPC de resumo recusa quem não
 * tem, e a RLS esconde as movimentações.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { LadrilhoDeIcone } from '@/componentes/Icone';
import { Seletor } from '@/componentes/Seletor';
import { MenuInferior } from '@/componentes/MenuInferior';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  carregarResumo,
  listarMovimentacoes,
  observarFinanceiro,
  type Movimentacao,
  type ResumoFinanceiro,
} from '@/dados/financeiro';
import { moeda } from '@/lib/formato';
import { descreverPeriodo, periodoDe, ROTULOS_DE_PERIODO, type Periodo } from '@/lib/periodo';
import { textoDoErro } from '@/lib/erros';

const ROTULO_ORIGEM: Record<string, string> = {
  venda: 'Venda',
  manual: 'Lançamento manual',
  estorno_venda: 'Estorno de venda',
};

export default function Financeiro() {
  const { conta, temPermissao, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('mes'));
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      const [dadosResumo, lista] = await Promise.all([
        carregarResumo(periodo.desde, periodo.ate),
        listarMovimentacoes(periodo.desde, periodo.ate),
      ]);
      setResumo(dadosResumo);
      setMovimentacoes(lista);
      setErro(null);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar o financeiro.'));
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [empresaId, periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      void carregar();
      return observarFinanceiro(empresaId, () => void carregar());
    }, [empresaId, carregar]),
  );

  if (!conta) return <TelaCarregando />;

  // Seção 5.3 — o módulo Financeiro exige `visualizar_financeiro`.
  if (!temPermissao('visualizar_financeiro')) {
    return <TelaMensagem mensagem="Você não tem permissão para visualizar o financeiro." />;
  }

  if (carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <FlatList
        data={movimentacoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              void carregar();
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={estilos.titulo}>Financeiro</Text>

            <Seletor
              opcoes={(['dia', 'semana', 'mes'] as const).map((t) => ({
                valor: t,
                rotulo: ROTULOS_DE_PERIODO[t],
              }))}
              selecionado={periodo.tipo}
              aoSelecionar={(valor) => {
                if (valor) setPeriodo(periodoDe(valor as 'dia' | 'semana' | 'mes'));
              }}
              horizontal
            />

            <Text style={estilos.periodo}>{descreverPeriodo(periodo)}</Text>

            {/* Seção 8.6 — resumo principal, por agregação em tempo real. */}
            <View style={estilos.cartaoSaldo}>
              <Text style={estilos.rotuloSaldo}>Saldo do período</Text>
              <Text
                style={[
                  estilos.saldo,
                  { color: (resumo?.saldo ?? 0) >= 0 ? tema.cores.primaria : tema.cores.negativo },
                ]}
              >
                {moeda(resumo?.saldo ?? 0)}
              </Text>

              <View style={estilos.linhaFluxo}>
                <View style={estilos.fluxo}>
                  <LadrilhoDeIcone nome="entrada" cor={tema.cores.secundaria} tamanho={36} />
                  <View>
                    <Text style={estilos.rotuloFluxo}>Entradas</Text>
                    <Text style={estilos.entradas}>{moeda(resumo?.entradas ?? 0)}</Text>
                  </View>
                </View>
                <View style={estilos.fluxo}>
                  <LadrilhoDeIcone nome="saida" cor={tema.cores.negativo} tamanho={36} />
                  <View>
                    <Text style={estilos.rotuloFluxo}>Saídas</Text>
                    <Text style={estilos.saidas}>{moeda(resumo?.saidas ?? 0)}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={estilos.grade}>
              <Indicador rotulo="Total vendido" valor={moeda(resumo?.total_vendido ?? 0)} />
              <Indicador rotulo="Vendas" valor={String(resumo?.quantidade_vendas ?? 0)} />
              <Indicador rotulo="Ticket médio" valor={moeda(resumo?.ticket_medio ?? 0)} />
            </View>

            {/* Seção 8.6 — lançamento manual é ação do Gestor. */}
            {conta.ehGestor ? (
              <Botao
                titulo="Novo lançamento"
                aoPressionar={() => router.push('/financeiro/lancamento')}
                desabilitado={!podeEscrever}
                estilo={{ marginBottom: tema.espacamento.sm }}
              />
            ) : null}

            {temPermissao('exportar_relatorios') ? (
              <Botao
                titulo="Ver relatórios"
                variante="secundario"
                aoPressionar={() => router.push('/relatorios')}
                estilo={{ marginBottom: tema.espacamento.md }}
              />
            ) : null}

            {!podeEscrever ? (
              <Aviso
                tom="alerta"
                mensagem="Sua conta está em modo de consulta. Não é possível criar ou editar lançamentos."
              />
            ) : null}

            <Text style={estilos.secao}>Movimentações</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={estilos.vazio}>Nenhuma movimentação no período.</Text>
        }
        renderItem={({ item }) => {
          const entrada = item.tipo === 'entrada';
          // Só lançamento manual é editável (Seção 8.6).
          const editavel = item.origem === 'manual' && conta.ehGestor && podeEscrever;

          return (
            <Pressable
              disabled={!editavel}
              onPress={() => router.push(`/financeiro/lancamento?id=${item.id}`)}
              style={({ pressed }) => [estilos.item, pressed && editavel && { opacity: 0.85 }]}
            >
              <LadrilhoDeIcone
                nome={entrada ? 'entrada' : 'saida'}
                cor={entrada ? tema.cores.secundaria : tema.cores.negativo}
                tamanho={38}
              />

              <View style={{ flex: 1 }}>
                <Text style={estilos.itemDescricao} numberOfLines={1}>
                  {item.descricao || ROTULO_ORIGEM[item.origem]}
                </Text>
                <Text style={estilos.itemDetalhe}>
                  {new Date(`${item.data_movimentacao}T12:00:00`).toLocaleDateString('pt-BR')}
                  {item.categoria ? ` · ${item.categoria}` : ''}
                  {` · ${ROTULO_ORIGEM[item.origem]}`}
                </Text>
              </View>

              <Text style={[estilos.itemValor, { color: entrada ? tema.cores.secundaria : tema.cores.negativo }]}>
                {entrada ? '+' : '−'} {moeda(item.valor)}
              </Text>
            </Pressable>
          );
        }}
      />
    
      <MenuInferior />
    </SafeAreaView>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.indicador}>
      <Text style={estilos.rotuloIndicador}>{rotulo}</Text>
      <Text style={estilos.valorIndicador}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  periodo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.md,
  },
  cartaoSaldo: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  rotuloSaldo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  saldo: { ...tema.tipografia.numero, color: tema.cores.primaria, marginBottom: tema.espacamento.md },
  linhaFluxo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tema.espacamento.md,
    paddingTop: tema.espacamento.md,
    borderTopWidth: 1,
    borderTopColor: tema.cores.bordaSuave,
  },
  fluxo: { flexDirection: 'row', alignItems: 'center', gap: tema.espacamento.sm },
  alinhadoDireita: { alignItems: 'flex-end' },
  rotuloFluxo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  entradas: { ...tema.tipografia.corpoDestacado, color: tema.cores.secundaria },
  saidas: { ...tema.tipografia.corpoDestacado, color: tema.cores.negativo },
  /* Três indicadores lado a lado ficavam estreitos demais para valores em
     reais ("R$ 11.905,00" quebrava em várias linhas). Com duas colunas o
     valor cabe em uma linha e o terceiro cartão ocupa a largura restante. */
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tema.espacamento.sm,
    marginBottom: tema.espacamento.md,
  },
  indicador: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  rotuloIndicador: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  valorIndicador: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto, marginTop: 2 },
  secao: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  vazio: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, textAlign: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    gap: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemDescricao: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemDetalhe: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  itemValor: { ...tema.tipografia.corpoDestacado, textAlign: 'right' },
});
