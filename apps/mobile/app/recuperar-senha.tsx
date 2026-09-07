/**
 * Recuperação de senha — sub-fluxo do botão "Esqueci minha senha" (Seção 7.11).
 *
 * Campo de e-mail → envia link de redefinição (mecanismo padrão do Supabase
 * Auth, Seção 5.5). Após o envio, mensagem de confirmação e retorno ao Login.
 */
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { emailValido, enviarLinkDeRecuperacao } from '@/dados/autenticacao';
import { textoDoErro } from '@/lib/erros';

export default function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const aoEnviar = useCallback(async () => {
    setErro(null);
    setErroEmail(null);

    if (!emailValido(email)) {
      setErroEmail('Informe um e-mail válido.');
      return;
    }

    setEnviando(true);
    try {
      await enviarLinkDeRecuperacao(email);
      setEnviado(true);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível enviar o e-mail de recuperação. Tente novamente.'));
    } finally {
      setEnviando(false);
    }
  }, [email]);

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>Recuperar senha</Text>
          <Text style={estilos.descricao}>
            Informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha.
          </Text>

          {erro ? <Aviso mensagem={erro} /> : null}

          {enviado ? (
            <>
              {/* A confirmação é a mesma tenha o e-mail conta ou não — não
                  revelamos quais e-mails estão cadastrados (Seção 7.11). */}
              <Aviso
                tom="sucesso"
                mensagem={
                  'Se houver uma conta com este e-mail, enviamos um link para redefinir a senha. ' +
                  'Verifique sua caixa de entrada.'
                }
              />
              <Botao titulo="Voltar para o login" aoPressionar={() => router.replace('/login')} />
            </>
          ) : (
            <>
              <CampoTexto
                rotulo="E-mail"
                valor={email}
                aoMudar={setEmail}
                erro={erroEmail}
                bloqueado={enviando}
                tipoTeclado="email-address"
                autoCompletar="email"
                placeholder="voce@exemplo.com"
              />

              <Botao
                titulo="Enviar link de redefinição"
                aoPressionar={aoEnviar}
                carregando={enviando}
                desabilitado={email.trim().length === 0}
              />

              <View style={{ marginTop: tema.espacamento.sm }}>
                <Botao titulo="Cancelar" variante="texto" aoPressionar={() => router.back()} />
              </View>
            </>
          )}
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
});
