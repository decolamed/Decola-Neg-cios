/**
 * Tela Splash — Seção 7.10.
 *
 * Exibe a marca e verifica o estado de autenticação antes de rotear.
 * SEM nenhum elemento interativo além do "Tentar novamente" dos estados de
 * falha, e sem nenhuma validação (a tela não tem input).
 *
 * Roteamento (automático, sem ação do usuário):
 *   sessão válida + vínculo ativo ............ Dashboard
 *   sessão válida, sem empresa ativa ......... Login, encerrando a sessão,
 *                                              com mensagem explicativa
 *   sem sessão válida ........................ Login
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import tema from '@decola/theme';
import { Marca } from '@/componentes/Marca';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import { estaConectado, MENSAGENS_SEM_CONEXAO } from '@/lib/conectividade';
import { AVISO_SEM_EMPRESA, sair, sessaoAtual } from '@/dados/autenticacao';
import { carregarContextoDaConta } from '@/dados/empresa';

const ERRO_INICIAR = 'Não foi possível iniciar o app.';

type Estado = 'carregando' | 'sem_conexao' | 'erro';

export default function Splash() {
  const [estado, setEstado] = useState<Estado>('carregando');

  const verificar = useCallback(async () => {
    setEstado('carregando');

    // A verificação de sessão passa pelo Supabase Auth, então a Splash exige
    // conectividade mínima — sem travar indefinidamente (Seção 7.10).
    if (!(await estaConectado())) {
      setEstado('sem_conexao');
      return;
    }

    try {
      const sessao = await sessaoAtual();

      if (!sessao) {
        router.replace('/login');
        return;
      }

      const conta = await carregarContextoDaConta();

      if (!conta) {
        // Encerra a sessão para não deixar o usuário preso numa tela sem
        // saída, e para que ele não crie uma segunda empresa sem perceber
        // que já teve acesso a uma (Seção 7.10).
        await sair();
        router.replace({ pathname: '/login', params: { aviso: AVISO_SEM_EMPRESA } });
        return;
      }

      router.replace('/dashboard');
    } catch {
      setEstado('erro');
    }
  }, []);

  useEffect(() => {
    void verificar();
  }, [verificar]);

  if (estado === 'sem_conexao') {
    return (
      <TelaMensagem
        mensagem={MENSAGENS_SEM_CONEXAO.splash}
        aoTentarNovamente={verificar}
        sobreMarca
      />
    );
  }

  if (estado === 'erro') {
    return <TelaMensagem mensagem={ERRO_INICIAR} aoTentarNovamente={verificar} sobreMarca />;
  }

  // Estado "Carregando": indicador visual, sem interação possível.
  return (
    <View style={estilos.tela}>
      <Marca />
      <ActivityIndicator
        size="large"
        color={tema.cores.destaque}
        style={{ marginTop: tema.espacamento.xl }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tema.cores.primaria,
  },
});
