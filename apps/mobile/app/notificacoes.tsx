/**
 * Central de notificações — Seção 7.2, botão Notificações.
 *
 * "alertas de estoque baixo (Seção 8.3), avisos de assinatura (trial/carência
 *  — Seção 6.5–6.6), avisos administrativos, outras notificações. Tocar em uma
 *  notificação abre a tela relacionada."
 *
 * Duas tabelas, uma lista: `alertas_estoque` guarda produto e ciclo, e
 * `notificacoes` guarda o resto — para o usuário isso é um detalhe interno.
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  listarAvisos,
  marcarComoLido,
  marcarTodosComoLidos,
  observarAvisos,
  type Aviso as AvisoDaEmpresa,
  type CategoriaDoAviso,
} from '@/dados/dashboard';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; avisos: AvisoDaEmpresa[] }
  | { nome: 'erro'; mensagem: string };

const ROTULO_CATEGORIA: Record<CategoriaDoAviso, string> = {
  estoque: 'Estoque',
  assinatura: 'Assinatura',
  administrativo: 'Administrativo',
};

function quando(iso: string): string {
  const data = new Date(iso);
  const minutos = Math.floor((Date.now() - data.getTime()) / 60000);

  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 60 * 24) return `há ${Math.floor(minutos / 60)} h`;
  return data.toLocaleDateString('pt-BR');
}

export default function Notificacoes() {
  const { conta } = useSessao();
  const usuarioId = conta?.vinculo.usuario_id ?? null;
  const empresaId = conta?.empresa.id;

  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEstado({ nome: 'pronto', avisos: await listarAvisos() });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar as notificações.',
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!empresaId) return;
    return observarAvisos(empresaId, () => {
      void carregar();
    });
  }, [empresaId, carregar]);

  if (estado.nome === 'carregando') return <TelaCarregando />;
  if (estado.nome === 'erro') {
    return <TelaMensagem mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const naoLidas = estado.avisos.filter((aviso) => !aviso.lido).length;

  const abrir = async (aviso: AvisoDaEmpresa) => {
    setErroAcao(null);

    if (!aviso.lido && usuarioId) {
      try {
        await marcarComoLido(aviso, usuarioId);
        await carregar();
      } catch (e) {
        // Não impede a navegação: marcar como lido é secundário ao destino.
        setErroAcao(e instanceof Error ? e.message : 'Não foi possível marcar como lido.');
      }
    }

    if (aviso.destino) router.push(aviso.destino);
  };

  const lerTudo = async () => {
    if (!usuarioId) return;
    setErroAcao(null);
    try {
      await marcarTodosComoLidos(estado.avisos, usuarioId);
      await carregar();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Não foi possível marcar tudo como lido.');
    }
  };

  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Notificações</Text>
        {naoLidas > 0 ? (
          <Botao titulo="Marcar tudo como lido" variante="texto" aoPressionar={lerTudo} />
        ) : null}
      </View>

      {erroAcao ? (
        <View style={estilos.margemLateral}>
          <Aviso mensagem={erroAcao} tom="erro" />
        </View>
      ) : null}

      <FlatList
        data={estado.avisos}
        keyExtractor={(item) => `${item.fonte}:${item.id}`}
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
        ListEmptyComponent={
          <Text style={estilos.vazio}>
            Nenhuma notificação por aqui. Alertas de estoque e avisos da sua assinatura aparecem
            nesta tela.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => abrir(item)}
            style={({ pressed }) => [
              estilos.item,
              !item.lido && estilos.itemNaoLido,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={estilos.linhaTopo}>
              <Text style={estilos.categoria}>{ROTULO_CATEGORIA[item.categoria]}</Text>
              <Text style={estilos.quando}>{quando(item.criado_em)}</Text>
            </View>

            <Text style={estilos.tituloAviso}>{item.titulo}</Text>
            <Text style={estilos.mensagem}>{item.mensagem}</Text>

            {item.destino ? <Text style={estilos.acao}>Toque para abrir ›</Text> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tema.espacamento.lg,
    paddingTop: tema.espacamento.lg,
  },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  margemLateral: { paddingHorizontal: tema.espacamento.lg },
  lista: { padding: tema.espacamento.lg },
  item: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemNaoLido: {
    borderLeftWidth: 3,
    borderLeftColor: tema.cores.acaoPrimaria,
  },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between' },
  categoria: { ...tema.tipografia.legenda, color: tema.cores.primaria },
  quando: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  tituloAviso: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    marginTop: tema.espacamento.xs,
  },
  mensagem: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginTop: 2 },
  acao: {
    ...tema.tipografia.legenda,
    color: tema.cores.primaria,
    marginTop: tema.espacamento.sm,
  },
  vazio: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.xl,
  },
});
