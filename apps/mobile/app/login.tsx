/**
 * Tela Login — Seção 7.11.
 *
 * Componentes exigidos: logo/marca, E-mail, Senha (com mostrar/ocultar),
 * "Esqueci minha senha", botão Entrar, divisor "ou entre com", "Entrar com
 * Google" e "Ainda não tem uma conta? Cadastre-se".
 *
 * Apple ficou explicitamente fora da V1.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Marca } from '@/componentes/Marca';
import {
  AVISO_SEM_EMPRESA,
  emailValido,
  entrarComGoogle,
  entrarComSenha,
  sair,
} from '@/dados/autenticacao';
import { carregarContextoDaConta } from '@/dados/empresa';
import { assinarMudancaDeConexao, MENSAGENS_SEM_CONEXAO } from '@/lib/conectividade';

export default function Login() {
  const params = useLocalSearchParams<{ aviso?: string }>();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(params.aviso ?? null);
  const [entrando, setEntrando] = useState(false);
  const [entrandoComGoogle, setEntrandoComGoogle] = useState(false);
  const [conectado, setConectado] = useState(true);

  useEffect(() => assinarMudancaDeConexao(setConectado), []);

  const carregando = entrando || entrandoComGoogle;

  // Botão Entrar desabilitado até e-mail e senha estarem preenchidos, e
  // também quando não há conexão (login exige rede — Seção 3.5).
  const podeEntrar = email.trim().length > 0 && senha.length > 0 && conectado;

  /**
   * Depois de autenticar, o destino depende de haver empresa ativa vinculada.
   * Sem empresa: encerra a sessão e PERMANECE em Login com a mensagem
   * explicativa — mesma regra da Splash (Seção 7.10), aplicada aqui.
   */
  const rotearAposLogin = useCallback(async (origemGoogle: boolean) => {
    const conta = await carregarContextoDaConta();

    if (conta) {
      router.replace('/dashboard');
      return;
    }

    if (origemGoogle) {
      // Primeira vez com Google: segue para o cadastro da empresa, já
      // autenticado — a criação de senha é pulada (Seção 7.11).
      // A escolha do plano vem antes, porque o Cadastro (Seção 7.12) exige
      // um plano selecionado.
      router.replace('/planos');
      return;
    }

    await sair();
    setMensagem(AVISO_SEM_EMPRESA);
  }, []);

  const aoEntrar = useCallback(async () => {
    setMensagem(null);
    setErroEmail(null);
    setErroSenha(null);

    // Validações da Seção 7.11: e-mail em formato válido; senha não vazia.
    let invalido = false;
    if (!emailValido(email)) {
      setErroEmail('Informe um e-mail válido.');
      invalido = true;
    }
    if (senha.length === 0) {
      setErroSenha('Informe sua senha.');
      invalido = true;
    }
    if (invalido) return;

    setEntrando(true);
    try {
      await entrarComSenha(email, senha);
      await rotearAposLogin(false);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : null);
    } finally {
      setEntrando(false);
    }
  }, [email, senha, rotearAposLogin]);

  const aoEntrarComGoogle = useCallback(async () => {
    setMensagem(null);
    setEntrandoComGoogle(true);
    try {
      await entrarComGoogle();
      await rotearAposLogin(true);
    } catch (e) {
      // Cancelamento do usuário volta com mensagem vazia: não é erro.
      const texto = e instanceof Error ? e.message : '';
      if (texto) setMensagem(texto);
    } finally {
      setEntrandoComGoogle(false);
    }
  }, [rotearAposLogin]);

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <View style={estilos.cabecalho}>
            <Marca escura />
          </View>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          {!conectado ? <Aviso mensagem={MENSAGENS_SEM_CONEXAO.login} tom="alerta" /> : null}

          <CampoTexto
            rotulo="E-mail"
            valor={email}
            aoMudar={setEmail}
            erro={erroEmail}
            bloqueado={carregando}
            tipoTeclado="email-address"
            autoCompletar="email"
            placeholder="voce@exemplo.com"
          />

          <CampoTexto
            rotulo="Senha"
            valor={senha}
            aoMudar={setSenha}
            erro={erroSenha}
            bloqueado={carregando}
            senha
            autoCompletar="password"
          />

          <Link href="/recuperar-senha" style={estilos.link}>
            Esqueci minha senha
          </Link>

          <Botao
            titulo="Entrar"
            aoPressionar={aoEntrar}
            carregando={entrando}
            desabilitado={!podeEntrar}
            estilo={{ marginTop: tema.espacamento.md }}
          />

          <View style={estilos.divisor}>
            <View style={estilos.linhaDivisor} />
            <Text style={estilos.textoDivisor}>ou entre com</Text>
            <View style={estilos.linhaDivisor} />
          </View>

          <Botao
            titulo="Entrar com Google"
            aoPressionar={aoEntrarComGoogle}
            variante="secundario"
            carregando={entrandoComGoogle}
            desabilitado={!conectado || entrando}
          />

          <View style={estilos.rodape}>
            <Text style={estilos.textoRodape}>Ainda não tem uma conta? </Text>
            <Link href="/planos" style={estilos.link}>
              Cadastre-se
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: tema.espacamento.lg,
  },
  cabecalho: { alignItems: 'center', marginBottom: tema.espacamento.xl },
  link: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.primaria,
    alignSelf: 'flex-start',
    marginBottom: tema.espacamento.sm,
  },
  divisor: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: tema.espacamento.lg,
  },
  linhaDivisor: { flex: 1, height: 1, backgroundColor: tema.cores.borda },
  textoDivisor: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginHorizontal: tema.espacamento.sm,
  },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tema.espacamento.xl,
    flexWrap: 'wrap',
  },
  textoRodape: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
});
