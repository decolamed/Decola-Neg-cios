/**
 * Redefinir senha — destino do link enviado por e-mail (Seções 5.5 e 7.11).
 *
 * É para cá que aponta o `redirectTo` de `enviarLinkDeRecuperacao`, e também o
 * link que o Painel Administrativo dispara ao criar uma empresa manualmente
 * (Seção 7.15 B): nos dois casos a pessoa tem uma conta cuja senha ela não
 * conhece, e o e-mail é a prova de identidade.
 *
 * A tela tem duas etapas, e a primeira é invisível quando dá certo:
 *   1. troca o `code` do link por uma sessão de curta duração;
 *   2. com essa sessão, grava a nova senha e leva ao Dashboard.
 *
 * Um link expirado ou já usado morre na etapa 1, com o caminho de volta para
 * pedir outro — sem isso o app abriria numa tela de senha que falharia só ao
 * salvar, depois de a pessoa já ter digitado tudo.
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { abrirSessaoDeRecuperacao, definirNovaSenha } from '@/dados/autenticacao';
import { textoDoErro } from '@/lib/erros';

type Etapa =
  | { nome: 'validando' }
  | { nome: 'pronto' }
  | { nome: 'linkInvalido'; mensagem: string };

export default function RedefinirSenha() {
  /**
   * A URL inteira, não os parâmetros de busca.
   *
   * `useLocalSearchParams` só enxerga a query, e o fluxo implícito — o dos
   * links disparados pelo Painel Administrativo — entrega os tokens no
   * fragmento (`#access_token=…`). Lendo só a query, esses links caíam sempre
   * em "link inválido".
   *
   * `useURL` devolve `null` no primeiro render; enquanto for `null`, a tela
   * segue em "validando" em vez de decidir cedo demais que não há link.
   */
  const url = Linking.useURL();

  const [etapa, setEtapa] = useState<Etapa>({ nome: 'validando' });
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;

    const validar = async () => {
      // Ainda não sabemos qual foi o link: esperar é o certo, e o estado
      // "validando" já está na tela.
      if (!url) return;

      try {
        await abrirSessaoDeRecuperacao(url);
        if (ativo) setEtapa({ nome: 'pronto' });
      } catch (e) {
        if (ativo) {
          setEtapa({
            nome: 'linkInvalido',
            mensagem:
              textoDoErro(e, 'Não foi possível validar o link de redefinição.'),
          });
        }
      }
    };

    void validar();
    return () => {
      ativo = false;
    };
  }, [url]);

  const aoSalvar = useCallback(async () => {
    setErro(null);
    setErroSenha(null);

    // Seção 5.5 — a única exigência é não ser vazia.
    if (senha.length === 0) {
      setErroSenha('Informe a nova senha.');
      return;
    }
    if (senha !== confirmacao) {
      setErroSenha('As duas senhas não são iguais.');
      return;
    }

    setSalvando(true);
    try {
      await definirNovaSenha(senha);
      // Já autenticado pela sessão da recuperação: entra direto.
      router.replace('/dashboard');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível definir sua senha.'));
    } finally {
      setSalvando(false);
    }
  }, [senha, confirmacao]);

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>Criar nova senha</Text>

          {etapa.nome === 'validando' ? (
            <View style={estilos.centralizado}>
              <ActivityIndicator color={tema.cores.primaria} />
              <Text style={estilos.descricao}>Validando seu link…</Text>
            </View>
          ) : null}

          {etapa.nome === 'linkInvalido' ? (
            <>
              <Aviso mensagem={etapa.mensagem} />
              <Botao
                titulo="Pedir um novo link"
                aoPressionar={() => router.replace('/recuperar-senha')}
              />
              <View style={{ marginTop: tema.espacamento.sm }}>
                <Botao
                  titulo="Voltar para o login"
                  variante="texto"
                  aoPressionar={() => router.replace('/login')}
                />
              </View>
            </>
          ) : null}

          {etapa.nome === 'pronto' ? (
            <>
              <Text style={estilos.descricao}>
                Escolha a senha que você vai usar para entrar no Decola Negócios.
              </Text>

              {erro ? <Aviso mensagem={erro} /> : null}

              <CampoTexto
                rotulo="Nova senha"
                valor={senha}
                aoMudar={setSenha}
                erro={erroSenha}
                bloqueado={salvando}
                senha
                autoCompletar="password"
              />

              <CampoTexto
                rotulo="Repita a nova senha"
                valor={confirmacao}
                aoMudar={setConfirmacao}
                bloqueado={salvando}
                senha
                autoCompletar="password"
              />

              <Botao
                titulo="Salvar e entrar"
                aoPressionar={aoSalvar}
                carregando={salvando}
                desabilitado={senha.length === 0 || confirmacao.length === 0}
              />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  descricao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.lg,
  },
  centralizado: { alignItems: 'center', gap: tema.espacamento.md },
});
