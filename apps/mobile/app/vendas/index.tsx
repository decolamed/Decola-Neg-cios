/**
 * Histórico de Vendas — Seção 7.1, item "Vendas".
 *
 * "Lista vendas realizadas com data, valor, funcionário responsável, forma de
 * pagamento e status. Ao tocar em uma venda: abre os detalhes."
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone, LadrilhoDeIcone } from '@/componentes/Icone';
import { MenuInferior } from '@/componentes/MenuInferior';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  listarSolicitacoesPendentes,
  listarVendas,
  observarVendas,
  type VendaResumo,
} from '@/dados/vendas';
import { moeda } from '@/lib/formato';

const ROTULO_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartão',
  outros: 'Outros',
};

/** Ícone da forma de pagamento — só aparência; o valor vem do banco. */
const ICONE_PAGAMENTO: Record<string, 'dinheiro' | 'pix' | 'cartao' | 'outros'> = {
  dinheiro: 'dinheiro',
  pix: 'pix',
  cartao: 'cartao',
  outros: 'outros',
};

export default function HistoricoDeVendas() {
  // O card "Vendas hoje" do Dashboard abre esta tela já filtrada (Seção 7.2).
  const { hoje } = useLocalSearchParams<{ hoje?: string }>();
  const { conta, temPermissao } = useSessao();
  const empresaId = conta?.empresa.id;

  const [vendas, setVendas] = useState<VendaResumo[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const filtrarHoje = hoje === '1';

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      const inicioDoDia = new Date();
      inicioDoDia.setHours(0, 0, 0, 0);

      const [lista, solicitacoes] = await Promise.all([
        listarVendas(filtrarHoje ? { desde: inicioDoDia.toISOString() } : {}),
        temPermissao('cancelar_venda') ? listarSolicitacoesPendentes() : Promise.resolve([]),
      ]);

      setVendas(lista);
      setPendentes(solicitacoes.length);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar as vendas.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [empresaId, filtrarHoje, temPermissao]);

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

  if (!conta || carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  const totalPeriodo = vendas
    .filter((venda) => venda.status !== 'cancelada')
    .reduce((soma, venda) => soma + venda.total, 0);

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <FlatList
        data={vendas}
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
            <Text style={estilos.titulo}>{filtrarHoje ? 'Vendas de hoje' : 'Vendas'}</Text>
            <Text style={estilos.resumo}>
              {vendas.filter((v) => v.status !== 'cancelada').length} venda(s) ·{' '}
              {moeda(totalPeriodo)}
            </Text>

            {/* Fila de aprovação, só para quem decide (Seção 8.5). */}
            {pendentes > 0 ? (
              <Pressable
                onPress={() => router.push('/vendas/solicitacoes')}
                style={({ pressed }) => [estilos.alertaPendentes, pressed && { opacity: 0.85 }]}
              >
                <Icone nome="alerta" cor={tema.cores.textoAlerta} tamanho={20} />
                <Text style={estilos.textoPendentes}>
                  {pendentes} solicitação(ões) de cancelamento aguardando sua decisão
                </Text>
              </Pressable>
            ) : null}

            <Botao
              titulo="Nova venda"
              aoPressionar={() => router.push('/vendas/nova')}
              estilo={{ marginBottom: tema.espacamento.md }}
            />
          </View>
        }
        ListEmptyComponent={
          <Text style={estilos.vazio}>
            {filtrarHoje ? 'Nenhuma venda registrada hoje.' : 'Nenhuma venda registrada ainda.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/vendas/${item.id}`)}
            style={({ pressed }) => [estilos.item, pressed && { opacity: 0.85 }]}
          >
            <LadrilhoDeIcone
              nome={ICONE_PAGAMENTO[item.forma_pagamento] ?? 'outros'}
              cor={item.status === 'cancelada' ? tema.cores.negativo : tema.cores.secundaria}
              tamanho={38}
            />

            <View style={{ flex: 1 }}>
              <Text style={estilos.itemData}>
                {new Date(item.criado_em).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={estilos.itemVendedor}>{item.vendedor ?? 'Usuário removido'}</Text>
              <Text style={estilos.itemPagamento}>
                {ROTULO_PAGAMENTO[item.forma_pagamento] ?? item.forma_pagamento}
              </Text>
            </View>

            <View style={estilos.itemDireita}>
              <Text style={[estilos.itemTotal, item.status === 'cancelada' && estilos.cancelado]}>
                {moeda(item.total)}
              </Text>
              {item.status === 'cancelada' ? (
                <Text style={estilos.badgeCancelada}>Cancelada</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    
      <MenuInferior />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  resumo: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.md,
  },
  alertaPendentes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.sm,
    backgroundColor: tema.tons.destaque,
    borderRadius: tema.raio.md,
    borderLeftWidth: 3,
    borderLeftColor: tema.cores.alerta,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
  },
  textoPendentes: { ...tema.tipografia.corpoDestacado, color: tema.cores.textoAlerta, flex: 1 },
  vazio: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemData: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemVendedor: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  itemPagamento: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  itemDireita: { alignItems: 'flex-end' },
  itemTotal: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  cancelado: { color: tema.cores.textoSuave, textDecorationLine: 'line-through' },
  badgeCancelada: { ...tema.tipografia.rotulo, color: tema.cores.negativo, marginTop: 2 },
});
