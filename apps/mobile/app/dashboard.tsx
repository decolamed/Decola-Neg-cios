/**
 * Tela Inicial / Dashboard — Seção 7.2.
 *
 * Quatro cards, cada um com o destino que a especificação define, e o sino de
 * notificações com o total de avisos não lidos. Os números vêm agregados do
 * banco (`resumo_dashboard`, migration 0029) e se atualizam em tempo real:
 * uma venda em outro caixa muda o card sem recarregar (Seção 3.3).
 *
 * O estado da conta (trial, carência, modo limitado, empresa suspensa) fica no
 * topo porque é aqui que a Seção 7.11 manda sinalizá-lo depois do login.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { MenuInferior } from '@/componentes/MenuInferior';
import { useSessao } from '@/contexto/SessaoContexto';
import { carregarResumo, observarAvisos, type ResumoDoDashboard } from '@/dados/dashboard';
import { moeda } from '@/lib/formato';

/** Seções 6.5, 6.6 e 6.9 — cada estado que o usuário precisa entender. */
function avisoDaConta(
  statusEmpresa: string,
  statusAssinatura: string | undefined,
): { texto: string; tom: 'alerta' | 'erro' } | null {
  if (statusEmpresa === 'suspensa') {
    return {
      texto: 'Esta conta está suspensa. Entre em contato com o suporte para regularizar.',
      tom: 'erro',
    };
  }
  if (statusEmpresa === 'inativa') {
    return { texto: 'Esta conta está inativa. Entre em contato com o suporte.', tom: 'erro' };
  }

  switch (statusAssinatura) {
    case 'modo_limitado':
      return {
        texto:
          'Sua conta está em modo limitado. Você pode consultar seus dados, mas não registrar ' +
          'vendas, alterar estoque ou editar produtos até regularizar o pagamento. Nenhum dado foi perdido.',
        tom: 'erro',
      };
    case 'carencia':
      return {
        texto:
          'Há um pagamento pendente. Todas as funcionalidades seguem disponíveis durante o ' +
          'período de carência — regularize para não entrar em modo limitado.',
        tom: 'alerta',
      };
    case 'trial':
      return { texto: 'Você está no período de teste gratuito.', tom: 'alerta' };
    default:
      return null;
  }
}

export default function Dashboard() {
  const { carregando, conta, erro, recarregar } = useSessao();

  const [resumo, setResumo] = useState<ResumoDoDashboard | null>(null);
  const [erroResumo, setErroResumo] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  const empresaId = conta?.empresa.id;

  const buscar = useCallback(async () => {
    if (!empresaId) return;
    try {
      setResumo(await carregarResumo());
      setErroResumo(null);
    } catch (e) {
      setErroResumo(e instanceof Error ? e.message : 'Não foi possível carregar o resumo.');
    }
  }, [empresaId]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  // Voltar de uma venda ou de um ajuste de estoque precisa refletir nos cards.
  useFocusEffect(
    useCallback(() => {
      void buscar();
    }, [buscar]),
  );

  // Seção 3.3 — o sino e os cards acompanham o que outros dispositivos fazem.
  useEffect(() => {
    if (!empresaId) return;
    return observarAvisos(empresaId, () => {
      void buscar();
    });
  }, [empresaId, buscar]);

  if (carregando) return <TelaCarregando />;

  if (erro || !conta) {
    return (
      <TelaMensagem
        mensagem={erro ?? 'Não foi possível carregar sua conta.'}
        aoTentarNovamente={recarregar}
      />
    );
  }

  const aviso = avisoDaConta(conta.empresa.status, conta.assinatura?.status);
  const naoLidas = resumo?.nao_lidas ?? 0;

  const atualizar = async () => {
    setAtualizando(true);
    await Promise.all([recarregar(), buscar()]);
    setAtualizando(false);
  };

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={atualizar} />}
      >
        <View style={estilos.cabecalho}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.empresa}>{conta.empresa.nome}</Text>
            <Text style={estilos.papel}>
              {conta.vinculo.papel === 'gestor_principal'
                ? 'Gestor Principal'
                : conta.vinculo.papel === 'gestor'
                  ? 'Gestor'
                  : 'Funcionário'}
            </Text>
          </View>

          {/* Sino — Seção 7.2, abre a central de notificações. */}
          <Pressable
            onPress={() => router.push('/notificacoes')}
            accessibilityRole="button"
            accessibilityLabel={
              naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'
            }
            style={({ pressed }) => [estilos.sino, pressed && { opacity: 0.85 }]}
          >
            <Text style={estilos.iconeSino}>🔔</Text>
            {naoLidas > 0 ? (
              <View style={estilos.badge}>
                <Text style={estilos.textoBadge}>{naoLidas > 99 ? '99+' : naoLidas}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}
        {erroResumo ? <Aviso mensagem={erroResumo} tom="erro" /> : null}

        <View style={estilos.grade}>
          <Card
            rotulo="Vendas hoje"
            valor={moeda(resumo?.vendas_hoje_total ?? 0)}
            nota={`${resumo?.vendas_hoje_quantidade ?? 0} venda(s)`}
            // Seção 7.2 — abre o histórico filtrado pelo dia atual.
            aoTocar={() => router.push({ pathname: '/vendas', params: { hoje: '1' } })}
          />
          <Card
            rotulo="Quantidade de vendas"
            valor={String(resumo?.vendas_quantidade_total ?? 0)}
            nota="Histórico completo"
            aoTocar={() => router.push('/vendas')}
          />
          <Card
            rotulo="Produtos"
            valor={String(resumo?.produtos_ativos ?? 0)}
            nota="Ativos no catálogo"
            aoTocar={() => router.push('/produtos')}
          />
          <Card
            rotulo="Estoque baixo"
            valor={String(resumo?.estoque_baixo ?? 0)}
            nota="No alerta configurado"
            atencao={(resumo?.estoque_baixo ?? 0) > 0}
            aoTocar={() => router.push('/estoque-baixo')}
          />
        </View>
      </ScrollView>

      <MenuInferior />
    </SafeAreaView>
  );
}

function Card({
  rotulo,
  valor,
  nota,
  aoTocar,
  atencao = false,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  aoTocar: () => void;
  atencao?: boolean;
}) {
  return (
    <Pressable
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={`${rotulo}: ${valor}`}
      style={({ pressed }) => [estilos.card, pressed && { opacity: 0.85 }]}
    >
      <Text style={estilos.cardRotulo}>{rotulo}</Text>
      <Text style={[estilos.cardValor, atencao && { color: tema.cores.negativo }]}>{valor}</Text>
      <Text style={estilos.cardNota}>{nota}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: tema.espacamento.lg,
  },
  empresa: { ...tema.tipografia.h1, color: tema.cores.texto },
  papel: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  sino: { padding: tema.espacamento.sm },
  iconeSino: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 20,
    paddingHorizontal: 4,
    height: 20,
    borderRadius: tema.raio.pill,
    backgroundColor: tema.cores.acaoPrimaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoBadge: { ...tema.tipografia.legenda, color: tema.cores.textoInverso, fontSize: 11 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacamento.md },
  card: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.lg,
    ...tema.elevacao.card,
  },
  cardRotulo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  cardValor: {
    ...tema.tipografia.h1,
    color: tema.cores.primaria,
    marginTop: tema.espacamento.xs,
  },
  cardNota: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
});
