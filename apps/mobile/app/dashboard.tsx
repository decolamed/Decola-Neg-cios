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
  // "Sair da conta" saiu daqui: a Seção 7.14 a coloca no Perfil, com confirmação.
  const { carregando, conta, erro, recarregar, temPermissao } = useSessao();

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

        {/* Acessos das Seções 7.2 e 7.9 já implementados. Os cards de resumo
            com totais e o sino de notificações entram com o Dashboard completo. */}
        <Botao
          titulo="Nova venda"
          aoPressionar={() => router.push('/vendas/nova')}
          estilo={{ marginBottom: tema.espacamento.sm }}
        />
        <Botao
          titulo="Vendas"
          variante="secundario"
          aoPressionar={() => router.push('/vendas')}
          estilo={{ marginBottom: tema.espacamento.sm }}
        />
        <Botao
          titulo="Estoque"
          variante="secundario"
          aoPressionar={() => router.push('/produtos')}
          estilo={{ marginBottom: tema.espacamento.sm }}
        />
        <Botao
          titulo="Estoque baixo"
          variante="secundario"
          aoPressionar={() => router.push('/estoque-baixo')}
          estilo={{ marginBottom: tema.espacamento.sm }}
        />
        {temPermissao('visualizar_financeiro') ? (
          <Botao
            titulo="Financeiro"
            variante="secundario"
            aoPressionar={() => router.push('/financeiro')}
            estilo={{ marginBottom: tema.espacamento.sm }}
          />
        ) : null}
        {temPermissao('exportar_relatorios') ? (
          <Botao
            titulo="Relatórios"
            variante="secundario"
            aoPressionar={() => router.push('/relatorios')}
            estilo={{ marginBottom: tema.espacamento.sm }}
          />
        ) : null}
        {conta.ehGestor ? (
          <>
            <Botao
              titulo="Funcionários"
              variante="secundario"
              aoPressionar={() => router.push('/funcionarios')}
              estilo={{ marginBottom: tema.espacamento.sm }}
            />
            <Botao
              titulo="Configurações"
              variante="secundario"
              aoPressionar={() => router.push('/configuracoes')}
              estilo={{ marginBottom: tema.espacamento.md }}
            />
          </>
        ) : null}

        <Botao
          titulo="Perfil"
          variante="secundario"
          aoPressionar={() => router.push('/perfil')}
          estilo={{ marginBottom: tema.espacamento.md }}
        />

        <View style={estilos.placeholder}>
          <Text style={estilos.textoPlaceholder}>
            Os cards de resumo e o sino de notificações (Seção 7.2) entram nas próximas fases.
          </Text>
        </View>
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
