/**
 * Dashboard — PLACEHOLDER.
 *
 * A tela completa da Seção 7.2 (cards de resumo, notificações, acessos
 * rápidos) entra a partir da Fase 3. O que existe aqui é o mínimo que a
 * Fase 2 exige: um destino válido para o roteamento da Splash e do Login, e a
 * sinalização do estado da assinatura que a Seção 7.11 diz acontecer "no
 * Dashboard após a autenticação".
 */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';

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
  const { carregando, conta, erro, recarregar, sair } = useSessao();

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

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.empresa}>{conta.empresa.nome}</Text>
        <Text style={estilos.papel}>
          {conta.vinculo.papel === 'gestor_principal'
            ? 'Gestor Principal'
            : conta.vinculo.papel === 'gestor'
              ? 'Gestor'
              : 'Funcionário'}
        </Text>

        {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}

        <View style={estilos.placeholder}>
          <Text style={estilos.textoPlaceholder}>
            O Dashboard completo (Seção 7.2) entra na próxima fase.
          </Text>
        </View>

        <Botao
          titulo="Sair da conta"
          variante="texto"
          aoPressionar={async () => {
            await sair();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  empresa: { ...tema.tipografia.h1, color: tema.cores.texto },
  papel: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.lg,
  },
  placeholder: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
  },
  textoPlaceholder: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
});
