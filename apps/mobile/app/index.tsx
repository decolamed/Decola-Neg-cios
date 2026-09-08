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
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
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

/**
 * Prazo até a abertura admitir que não vai terminar.
 *
 * A abertura faz três chamadas de rede em sequência (conexão, sessão, conta).
 * Qualquer uma pode ficar pendurada numa rede ruim, e nenhuma tem prazo
 * próprio — o resultado era esta tela amarela parada, sem texto, sem botão e
 * sem saída. Não dá para consertar isso "deixando carregar": é preciso um
 * ponto em que a tela para de esperar e devolve o controle à pessoa.
 *
 * Doze segundos são generosos para 3G ruim e curtos o bastante para não
 * parecer travado.
 */
const PRAZO_DA_ABERTURA = 12000;

type Estado = 'carregando' | 'sem_conexao' | 'erro' | 'demorou';

export default function Splash() {
  const [estado, setEstado] = useState<Estado>('carregando');

  const verificar = useCallback(async () => {
    setEstado('carregando');

    // O relógio corre em paralelo à abertura. Se ela terminar antes, o
    // roteamento já tirou a pessoa desta tela e este `setEstado` não tem
    // efeito nenhum sobre o que ela está vendo.
    const relogio = setTimeout(() => setEstado('demorou'), PRAZO_DA_ABERTURA);
    const encerrarRelogio = () => clearTimeout(relogio);

    // A verificação de sessão passa pelo Supabase Auth, então a Splash exige
    // conectividade mínima — sem travar indefinidamente (Seção 7.10).
    if (!(await estaConectado())) {
      encerrarRelogio();
      setEstado('sem_conexao');
      return;
    }

    try {
      const sessao = await sessaoAtual();

      if (!sessao) {
        encerrarRelogio();
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
          encerrarRelogio();
          window.location.replace('/');
          return;
        }

        // Encerra a sessão para não deixar o usuário preso numa tela sem
        // saída, e para que ele não crie uma segunda empresa sem perceber
        // que já teve acesso a uma (Seção 7.10).
        await sair();
        encerrarRelogio();
        router.replace({ pathname: '/login', params: { aviso: AVISO_SEM_EMPRESA } });
        return;
      }

      encerrarRelogio();
      router.replace(destinoDaConta(conta));
    } catch {
      encerrarRelogio();
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

  /**
   * Demorou demais. A saída não é só "tentar de novo": se a abertura está
   * pendurada por causa da sessão guardada no aparelho, tentar de novo pendura
   * igual. Entrar com e-mail e senha desvia dela por completo — é a porta que
   * sempre funciona.
   */
  if (estado === 'demorou') {
    return (
      <View style={estilos.tela}>
        <View style={estilos.miolo}>
          <Marca escura comSimbolo tamanho="lg" />
          <Text style={estilos.aviso}>
            A abertura está demorando mais que o normal. Isso costuma ser a internet do aparelho.
          </Text>
          <Botao
            titulo="Tentar novamente"
            aoPressionar={verificar}
            estilo={{ marginTop: tema.espacamento.lg, minWidth: 240 }}
          />
          <Botao
            titulo="Entrar com meu e-mail"
            variante="secundario"
            aoPressionar={() => router.replace('/login')}
            estilo={{ marginTop: tema.espacamento.sm, minWidth: 240 }}
          />
        </View>

        <AssinaturaDecola escura />
      </View>
    );
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
  aviso: {
    ...tema.tipografia.corpo,
    color: tema.cores.texto,
    textAlign: 'center',
    marginTop: tema.espacamento.xl,
  },
});
