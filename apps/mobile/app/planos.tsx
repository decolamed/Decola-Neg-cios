/**
 * Tela Escolha do Plano — Seção 7.13.
 *
 * Primeira etapa do fluxo padrão de cadastro (Seção 6.2). É PULADA quando o
 * usuário chega por um link direto de plano (Seção 6.3) — nesse caso o
 * roteamento leva direto ao Cadastro com o plano fixado.
 *
 * "Esta mesma tela é REUTILIZADA para troca de plano por um Gestor já
 * autenticado" (Seção 7.13): com `?modo=troca` a permissão exigida passa a ser
 * `gerenciar_assinatura` e o botão deixa de criar assinatura para solicitar a
 * troca (upgrade imediato ou downgrade no próximo ciclo — Seção 6.7).
 *
 * Os planos são carregados dinamicamente do banco (Seção 6.1): criar, editar
 * ou desativar um plano no Painel Administrativo reflete aqui sem alteração
 * de código.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { trocarPlano } from '@/dados/assinatura';
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
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; catalogo: CatalogoDePlanos }
  | { nome: 'erro'; mensagem: string };

export default function EscolhaDoPlano() {
  const { modo } = useLocalSearchParams<{ modo?: string }>();
  const ehTroca = modo === 'troca';

  const { conta, temPermissao, carregando: carregandoSessao } = useSessao();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [aviso, setAviso] = useState<{ texto: string; tom: 'erro' | 'sucesso' } | null>(null);
  const [trocando, setTrocando] = useState<string | null>(null);

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

  if (estado.nome === 'carregando' || (ehTroca && carregandoSessao)) return <TelaCarregando />;

  if (estado.nome === 'erro') {
    return <TelaMensagem mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  // Seção 7.13 — no modo troca a permissão exigida é `gerenciar_assinatura`.
  // Esconder a tela é conveniência; quem recusa de fato é a RPC (Seção 9.1).
  if (ehTroca && !temPermissao('gerenciar_assinatura')) {
    return (
      <TelaMensagem mensagem="Somente o Gestor pode trocar o plano da empresa." />
    );
  }

  const { planos, trialAtivo, trialDias } = estado.catalogo;
  const planoAtualId = conta?.assinatura?.plano_id ?? null;

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

  const solicitarTroca = async (item: PlanoComTrial) => {
    setAviso(null);
    setTrocando(item.plano.id);

    try {
      const resultado = await trocarPlano(item.plano.id);
      setAviso({ texto: resultado.mensagem, tom: 'sucesso' });

      // O upgrade vale na hora; o downgrade fica agendado e a tela de Meu
      // plano é onde ele aparece. Nos dois casos voltamos para lá.
      setTimeout(() => router.replace('/perfil/plano'), 1500);
    } catch (e) {
      // Seção 6.7 — quando a empresa excede os limites do plano de destino, a
      // RPC devolve a lista exata do que precisa ser ajustado. Repassamos o
      // texto dela sem reescrever.
      setAviso({
        texto: textoDoErro(e, 'Não foi possível trocar de plano.'),
        tom: 'erro',
      });
    } finally {
      setTrocando(null);
    }
  };

  const confirmarTroca = (item: PlanoComTrial) => {
    const atual = conta?.assinatura?.valor_contratado ?? 0;
    const upgrade = item.plano.valor_mensal > atual;

    Dialogo.alert(
      `Trocar para ${item.plano.nome}?`,
      upgrade
        ? `A troca vale imediatamente e o novo valor passa a ser ${moeda(
            item.plano.valor_mensal,
          )}/mês.`
        : `A troca passa a valer no próximo vencimento — até lá você continua no plano atual, ` +
          `com tudo o que ele oferece.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: () => void solicitarTroca(item) },
      ],
    );
  };

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>{ehTroca ? 'Trocar de plano' : 'Escolha seu plano'}</Text>
        <Text style={estilos.descricao}>
          {ehTroca
            ? 'O upgrade vale na hora. O downgrade passa a valer no próximo vencimento.'
            : 'Você pode trocar de plano depois, a qualquer momento.'}
        </Text>

        {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}

        {planos.map((item) => (
          <CardDePlano
            key={item.plano.id}
            item={item}
            // No modo troca o selo de trial não faz sentido: quem já assina não
            // recomeça um teste gratuito.
            trialAtivo={trialAtivo && !ehTroca}
            trialDias={trialDias}
            ehAtual={ehTroca && item.plano.id === planoAtualId}
            carregando={trocando === item.plano.id}
            bloqueado={trocando !== null}
            rotuloBotao={ehTroca ? 'Trocar para este plano' : 'Escolher este plano'}
            aoEscolher={() =>
              ehTroca
                ? confirmarTroca(item)
                : router.push({ pathname: '/cadastro', params: { planoId: item.plano.id } })
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
  ehAtual = false,
  carregando = false,
  bloqueado = false,
  rotuloBotao,
  aoEscolher,
}: {
  item: PlanoComTrial;
  trialAtivo: boolean;
  trialDias: number;
  ehAtual?: boolean;
  carregando?: boolean;
  bloqueado?: boolean;
  rotuloBotao: string;
  aoEscolher: () => void;
}) {
  return (
    <View style={[estilos.card, ehAtual && estilos.cardAtual]}>
      {/* Selo de trial, exibido apenas quando o trial está ligado
          globalmente; a duração vem de configuracoes_plataforma. */}
      {trialAtivo ? (
        <View style={estilos.selo}>
          <Text style={estilos.textoSelo}>{trialDias} dias grátis</Text>
        </View>
      ) : null}

      {ehAtual ? (
        <View style={estilos.seloAtual}>
          <Text style={estilos.textoSeloAtual}>Seu plano atual</Text>
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
        <View key={funcionalidade} style={estilos.linhaFuncionalidade}>
          <Text style={estilos.marcador}>✓</Text>
          <Text style={estilos.funcionalidade}>{rotuloDeFuncionalidade(funcionalidade)}</Text>
        </View>
      ))}

      {ehAtual ? (
        <Text style={estilos.observacao}>Este já é o plano contratado pela sua empresa.</Text>
      ) : (
        <Botao
          titulo={rotuloBotao}
          aoPressionar={aoEscolher}
          carregando={carregando}
          desabilitado={bloqueado && !carregando}
          estilo={{ marginTop: tema.espacamento.md }}
        />
      )}
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
    borderWidth: 1,
    borderColor: tema.cores.bordaSuave,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  cardAtual: { borderWidth: 2, borderColor: tema.cores.secundaria },
  selo: {
    alignSelf: 'flex-start',
    backgroundColor: tema.cores.destaque,
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.md,
    paddingVertical: 5,
    marginBottom: tema.espacamento.sm,
  },
  textoSelo: { ...tema.tipografia.rotulo, color: tema.cores.textoSobreAcao },
  seloAtual: {
    alignSelf: 'flex-start',
    backgroundColor: tema.cores.primaria,
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.md,
    paddingVertical: 5,
    marginBottom: tema.espacamento.sm,
  },
  textoSeloAtual: { ...tema.tipografia.rotulo, color: tema.cores.textoInverso },
  nomePlano: { ...tema.tipografia.h2, color: tema.cores.texto },
  linhaValor: { flexDirection: 'row', alignItems: 'baseline', marginTop: tema.espacamento.xs },
  valor: { ...tema.tipografia.numero, color: tema.cores.primaria },
  periodo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginLeft: 4 },
  limite: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    marginTop: tema.espacamento.md,
  },
  linhaFuncionalidade: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tema.espacamento.sm,
    marginTop: tema.espacamento.sm,
  },
  marcador: { ...tema.tipografia.corpoDestacado, color: tema.cores.secundaria },
  funcionalidade: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    flex: 1,
  },
  observacao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.md,
  },
  suporte: {
    ...tema.tipografia.rotulo,
    color: tema.cores.primaria,
    textAlign: 'center',
    marginTop: tema.espacamento.lg,
  },
});
