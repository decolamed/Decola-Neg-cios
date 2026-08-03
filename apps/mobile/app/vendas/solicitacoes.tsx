/**
 * Solicitações de cancelamento — Seção 8.5.
 *
 * "Sem permissão: o Funcionário solicita o cancelamento; o Gestor recebe a
 * solicitação e aprova ou rejeita."
 *
 * Aprovar dispara a reversão completa (estoque volta, estorno no financeiro,
 * venda marcada como cancelada). Rejeitar apenas encerra a solicitação.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  decidirSolicitacao,
  listarSolicitacoesPendentes,
  observarVendas,
  type SolicitacaoPendente,
} from '@/dados/vendas';
import { moeda } from '@/lib/formato';

export default function Solicitacoes() {
  const { conta, temPermissao, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      setSolicitacoes(await listarSolicitacoesPendentes());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as solicitações.');
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
      return observarVendas(empresaId, () => void carregar());
    }, [empresaId, carregar]),
  );

  const decidir = useCallback(
    async (solicitacao: SolicitacaoPendente, aprovar: boolean) => {
      setProcessando(solicitacao.id);
      setMensagem(null);
      try {
        await decidirSolicitacao(solicitacao.id, aprovar);
        await carregar();
        setMensagem(
          aprovar
            ? 'Cancelamento aprovado. Estoque e financeiro foram revertidos.'
            : 'Solicitação rejeitada. A venda permanece confirmada.',
        );
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.');
      } finally {
        setProcessando(null);
      }
    },
    [carregar],
  );

  const confirmarAprovacao = useCallback(
    (solicitacao: SolicitacaoPendente) => {
      Alert.alert(
        'Aprovar cancelamento',
        `A venda de ${moeda(solicitacao.venda_total)} será cancelada.\n\n` +
          'Os produtos voltam ao estoque e um lançamento de estorno é gerado no financeiro.',
        [
          { text: 'Voltar', style: 'cancel' },
          {
            text: 'Aprovar',
            style: 'destructive',
            onPress: () => void decidir(solicitacao, true),
          },
        ],
      );
    },
    [decidir],
  );

  if (!conta || carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  // Quem decide é quem poderia cancelar diretamente (Seção 8.5).
  if (!temPermissao('cancelar_venda')) {
    return (
      <TelaMensagem mensagem="Apenas quem pode cancelar vendas tem acesso às solicitações." />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <FlatList
        data={solicitacoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.conteudo}
        ListHeaderComponent={
          <View>
            <Text style={estilos.titulo}>Solicitações de cancelamento</Text>
            {mensagem ? <Aviso tom="sucesso" mensagem={mensagem} /> : null}
            {!podeEscrever ? (
              <Aviso
                tom="alerta"
                mensagem="Sua conta está em modo de consulta. Não é possível decidir solicitações."
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={estilos.vazio}>Nenhuma solicitação aguardando decisão.</Text>
        }
        renderItem={({ item }) => (
          <View style={estilos.card}>
            <Text style={estilos.valor}>{moeda(item.venda_total)}</Text>
            <Text style={estilos.detalhe}>
              Venda de {new Date(item.venda_data).toLocaleString('pt-BR')}
            </Text>
            <Text style={estilos.detalhe}>
              Solicitado por {item.solicitante ?? 'usuário removido'} em{' '}
              {new Date(item.criado_em).toLocaleString('pt-BR')}
            </Text>

            {item.motivo ? <Text style={estilos.motivo}>Motivo: {item.motivo}</Text> : null}

            <Botao
              titulo="Ver venda"
              variante="texto"
              aoPressionar={() => router.push(`/vendas/${item.venda_id}`)}
            />

            <View style={estilos.acoes}>
              <Botao
                titulo="Aprovar cancelamento"
                aoPressionar={() => confirmarAprovacao(item)}
                carregando={processando === item.id}
                desabilitado={!podeEscrever}
                estilo={{ flex: 1 }}
              />
              <Botao
                titulo="Rejeitar"
                variante="secundario"
                aoPressionar={() => void decidir(item, false)}
                desabilitado={!podeEscrever || processando === item.id}
                estilo={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
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
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  valor: { ...tema.tipografia.h2, color: tema.cores.primaria },
  detalhe: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  motivo: {
    ...tema.tipografia.corpo,
    color: tema.cores.texto,
    marginTop: tema.espacamento.sm,
  },
  acoes: { flexDirection: 'row', gap: tema.espacamento.sm, marginTop: tema.espacamento.sm },
});
