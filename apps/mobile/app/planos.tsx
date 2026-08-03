/**
 * Tela Escolha do Plano — Seção 7.13.
 *
 * Primeira etapa do fluxo padrão de cadastro (Seção 6.2). É PULADA quando o
 * usuário chega por um link direto de plano (Seção 6.3) — nesse caso o
 * roteamento leva direto ao Cadastro com o plano fixado.
 *
 * Os planos são carregados dinamicamente do banco (Seção 6.1): criar, editar
 * ou desativar um plano no Painel Administrativo reflete aqui sem alteração
 * de código.
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import {
  EMAIL_SUPORTE,
  ERRO_CARREGAR_PLANOS,
  listarPlanosDisponiveis,
  NENHUM_PLANO,
  type CatalogoDePlanos,
  type PlanoComTrial,
} from '@/dados/planos';
import { SemConexaoError } from '@/lib/conectividade';
import { moeda, rotuloDeFuncionalidade } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; catalogo: CatalogoDePlanos }
  | { nome: 'erro'; mensagem: string };

export default function EscolhaDoPlano() {
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      setEstado({ nome: 'pronto', catalogo: await listarPlanosDisponiveis() });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem:
          e instanceof SemConexaoError
            ? e.message
            : e instanceof Error
              ? e.message
              : ERRO_CARREGAR_PLANOS,
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.nome === 'carregando') return <TelaCarregando />;

  if (estado.nome === 'erro') {
    return <TelaMensagem mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const { planos, trialAtivo, trialDias } = estado.catalogo;

  // Estado "Vazio": caso extremo que não deveria ocorrer em operação normal.
  // Tratado como falha operacional do administrador, sem fallback automático.
  if (planos.length === 0) {
    return (
      <TelaMensagem
        mensagem={NENHUM_PLANO}
        complemento={`Precisa de ajuda? Fale com o suporte: ${EMAIL_SUPORTE}`}
        aoTentarNovamente={carregar}
      />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Escolha seu plano</Text>
        <Text style={estilos.descricao}>
          Você pode trocar de plano depois, a qualquer momento.
        </Text>

        {planos.map((item) => (
          <CardDePlano
            key={item.plano.id}
            item={item}
            trialAtivo={trialAtivo}
            trialDias={trialDias}
            aoEscolher={() =>
              router.push({ pathname: '/cadastro', params: { planoId: item.plano.id } })
            }
          />
        ))}

        <Pressable onPress={() => Linking.openURL(`mailto:${EMAIL_SUPORTE}`)}>
          <Text style={estilos.suporte}>Dúvidas? Fale com o suporte</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function CardDePlano({
  item,
  trialAtivo,
  trialDias,
  aoEscolher,
}: {
  item: PlanoComTrial;
  trialAtivo: boolean;
  trialDias: number;
  aoEscolher: () => void;
}) {
  return (
    <View style={estilos.card}>
      {/* Selo de trial, exibido apenas quando o trial está ligado
          globalmente; a duração vem de configuracoes_plataforma. */}
      {trialAtivo ? (
        <View style={estilos.selo}>
          <Text style={estilos.textoSelo}>{trialDias} dias grátis</Text>
        </View>
      ) : null}

      <Text style={estilos.nomePlano}>{item.plano.nome}</Text>

      <View style={estilos.linhaValor}>
        <Text style={estilos.valor}>{moeda(item.plano.valor_mensal)}</Text>
        <Text style={estilos.periodo}>/mês</Text>
      </View>

      {item.maxFuncionarios !== null ? (
        <Text style={estilos.limite}>Até {item.maxFuncionarios} funcionários</Text>
      ) : null}

      {item.funcionalidades.map((funcionalidade) => (
        <Text key={funcionalidade} style={estilos.funcionalidade}>
          • {rotuloDeFuncionalidade(funcionalidade)}
        </Text>
      ))}

      <Botao
        titulo="Escolher este plano"
        aoPressionar={aoEscolher}
        estilo={{ marginTop: tema.espacamento.md }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  selo: {
    alignSelf: 'flex-start',
    backgroundColor: tema.cores.destaque,
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.sm,
    paddingVertical: tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
  textoSelo: { ...tema.tipografia.legenda, color: tema.cores.texto },
  nomePlano: { ...tema.tipografia.h2, color: tema.cores.texto },
  linhaValor: { flexDirection: 'row', alignItems: 'baseline', marginTop: tema.espacamento.xs },
  valor: { ...tema.tipografia.h1, color: tema.cores.primaria },
  periodo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginLeft: 4 },
  limite: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    marginTop: tema.espacamento.sm,
  },
  funcionalidade: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
  },
  suporte: {
    ...tema.tipografia.legenda,
    color: tema.cores.primaria,
    textAlign: 'center',
    marginTop: tema.espacamento.md,
  },
});
