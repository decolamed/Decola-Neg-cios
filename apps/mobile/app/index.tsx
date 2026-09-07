/**
 * Tela Splash — Seção 7.10.
 *
 * Exibe a marca e verifica o estado de autenticação antes de rotear.
 * SEM nenhum elemento interativo além do "Tentar novamente" dos estados de
 * falha, e sem nenhuma validação (a tela não tem input).
 *
 * Roteamento (automático, sem ação do usuário):
 *   sessão válida + vínculo ativo ............ Dashboard
 *   sessão válida, administrador da plataforma  Painel administrativo (na web)
 *   sessão válida, sem empresa ativa ......... Login, encerrando a sessão,
 *                                              com mensagem explicativa
 *   sem sessão válida ........................ Login
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import tema from '@decola/theme';
import { Marca, AssinaturaDecola } from '@/componentes/Marca';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import { estaConectado, MENSAGENS_SEM_CONEXAO } from '@/lib/conectividade';
import {
  AVISO_SEM_EMPRESA,
  ehAdministradorDaPlataforma,
  sair,
  sessaoAtual,
} from '@/dados/autenticacao';
import { carregarContextoDaConta, destinoDaConta } from '@/dados/empresa';

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
        /**
         * Administrador da plataforma não tem empresa — e não é um erro.
         *
         * Ele chega aqui ao clicar "Visualizar aplicativo" no painel, já
         * autenticado, porque as duas partes dividem a sessão. Sem esta
         * verificação ele cairia no `sair()` abaixo e perderia também a sessão
         * do painel de onde veio: um clique de curiosidade custando o login.
         *
         * Só vale na web, que é onde o painel existe.
         */
        if (Platform.OS === 'web' && (await ehAdministradorDaPlataforma())) {
          window.location.replace('/');
          return;
        }

        // Encerra a sessão para não deixar o usuário preso numa tela sem
        // saída, e para que ele não crie uma segunda empresa sem perceber
        // que já teve acesso a uma (Seção 7.10).
        await sair();
        router.replace({ pathname: '/login', params: { aviso: AVISO_SEM_EMPRESA } });
        return;
      }

      router.replace(destinoDaConta(conta));
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
      <View style={estilos.miolo}>
        <Marca escura comSimbolo tamanho="lg" />
        <ActivityIndicator
          size="large"
          color={tema.cores.primaria}
          style={{ marginTop: tema.espacamento.xl }}
        />
      </View>

      <AssinaturaDecola escura />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    paddingVertical: tema.espacamento.xxl,
    paddingHorizontal: tema.espacamento.lg,
    backgroundColor: tema.cores.destaque,
  },
  miolo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
