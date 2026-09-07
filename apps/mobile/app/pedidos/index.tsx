/**
 * Pedidos da loja virtual — lista.
 *
 * Abre em "Em aberto" de propósito: quem entra aqui está atrás do que precisa
 * de ação, não do histórico. O histórico fica a um toque.
 *
 * A lista destaca o que está esperando alguém — pagamento declarado e entrega
 * a combinar são os dois estados em que o pedido para até o gestor agir.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import type { Pedido } from '@decola/types';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { MenuInferior } from '@/componentes/MenuInferior';
import { Seletor } from '@/componentes/Seletor';
import { ROTULO_STATUS, listarPedidos } from '@/dados/pedidos';
import { moeda } from '@/lib/formato';
import { textoDoErro } from '@/lib/erros';

/** Estados em que o pedido está parado esperando o gestor. */
const PEDE_ACAO = new Set(['aguardando_pagamento', 'aguardando_negociacao']);

function quando(iso: string): string {
  const data = new Date(iso);
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ListaDePedidos() {
  const [filtro, setFiltro] = useState<'abertos' | 'todos'>('abertos');
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setPedidos(await listarPedidos(filtro));
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar os pedidos.'));
      setPedidos([]);
    }
  }, [filtro]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  if (pedidos === null) return <TelaCarregando />;

  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Pedidos</Text>
        <Text style={estilos.subtitulo}>Solicitações vindas da sua loja virtual.</Text>
      </View>

      <View style={estilos.filtro}>
        <Seletor
          rotulo=""
          horizontal
          opcoes={[
            { valor: 'abertos', rotulo: 'Em aberto' },
            { valor: 'todos', rotulo: 'Todos' },
          ]}
          selecionado={filtro}
          aoSelecionar={(v) => setFiltro(v as 'abertos' | 'todos')}
        />
      </View>

      {erro ? <Aviso mensagem={erro} /> : null}

      {pedidos.length === 0 ? (
        <TelaMensagem
          mensagem={
            filtro === 'abertos'
              ? 'Nenhum pedido em aberto. Quando um cliente enviar uma solicitação pela sua loja, ela aparece aqui.'
              : 'Nenhum pedido ainda.'
          }
        />
      ) : (
        <FlatList
          data={pedidos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={estilos.lista}
          refreshControl={
            <RefreshControl
              refreshing={atualizando}
              onRefresh={async () => {
                setAtualizando(true);
                await carregar();
                setAtualizando(false);
              }}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={estilos.cartao}
              onPress={() => router.push(`/pedidos/${item.id}`)}
              accessibilityRole="button"
            >
              <View style={estilos.linhaTopo}>
                <Text style={estilos.numero}>#{item.numero}</Text>
                <Text style={estilos.valor}>{moeda(Number(item.subtotal))}</Text>
              </View>

              <Text style={estilos.cliente}>{item.cliente_nome}</Text>

              <View style={estilos.linhaBaixo}>
                <Text
                  style={[
                    estilos.status,
                    PEDE_ACAO.has(item.status) && estilos.statusAtencao,
                    item.status === 'cancelado' && estilos.statusCancelado,
                  ]}
                >
                  {ROTULO_STATUS[item.status]}
                </Text>
                <Text style={estilos.meta}>
                  {item.modalidade === 'entrega' ? 'Entrega' : 'Retirada'} · {quando(item.criado_em)}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <MenuInferior />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  cabecalho: { paddingHorizontal: tema.espacamento.lg, paddingTop: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  subtitulo: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
  },
  filtro: { paddingHorizontal: tema.espacamento.lg, paddingTop: tema.espacamento.md },
  lista: { padding: tema.espacamento.lg, gap: tema.espacamento.sm },
  cartao: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    gap: tema.espacamento.xs,
    ...tema.elevacao.card,
  },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numero: { ...tema.tipografia.corpoDestacado, color: tema.cores.textoSuave },
  valor: { ...tema.tipografia.numero, color: tema.cores.primaria },
  cliente: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  linhaBaixo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tema.espacamento.xs,
  },
  status: { ...tema.tipografia.legenda, color: tema.cores.primaria },
  statusAtencao: { color: tema.cores.alerta, fontWeight: 'bold' },
  statusCancelado: { color: tema.cores.textoSuave },
  meta: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
});
