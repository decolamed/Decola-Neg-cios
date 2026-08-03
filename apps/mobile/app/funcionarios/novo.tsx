/**
 * Adicionar funcionário — Seções 5.2 e 7.8.
 *
 * "O Gestor informa nome e e-mail do colaborador. É criado um registro em
 * `empresa_usuarios` com status = convidado... O sistema envia o convite para
 * o e-mail informado."
 *
 * O convite é criado primeiro, no banco, e só então o e-mail é disparado. Se o
 * envio falhar, o convite continua válido e o Gestor pode reenviar — não faz
 * sentido perder o vínculo por causa do provedor de e-mail.
 */
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { emailValido } from '@/dados/autenticacao';
import { convidarFuncionario, enviarEmailDeConvite } from '@/dados/funcionarios';

export default function NovoFuncionario() {
  const { conta, podeEscrever } = useSessao();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const convidar = useCallback(async () => {
    setMensagem(null);
    setAviso(null);

    const novosErros: Record<string, string | null> = {};
    if (nome.trim().length === 0) novosErros.nome = 'Informe o nome do funcionário.';
    if (!emailValido(email)) novosErros.email = 'Informe um e-mail válido.';

    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;

    setEnviando(true);
    try {
      const vinculoId = await convidarFuncionario(nome, email);

      try {
        await enviarEmailDeConvite(vinculoId);
        router.replace('/funcionarios');
      } catch {
        // O vínculo já existe; só o e-mail não saiu.
        setAviso(
          'O convite foi criado, mas não conseguimos enviar o e-mail agora. ' +
            'Use "Reenviar convite" na tela do funcionário para tentar de novo.',
        );
      }
    } catch (e) {
      // Limite do plano, e-mail já vinculado a outra empresa, convite duplicado
      // — a RPC devolve a mensagem pronta (Seções 5.1, 5.2, 6.8).
      setMensagem(e instanceof Error ? e.message : 'Não foi possível enviar o convite.');
    } finally {
      setEnviando(false);
    }
  }, [nome, email]);

  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar sua conta." />;

  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Apenas o Gestor pode convidar funcionários." />;
  }

  if (!podeEscrever) {
    return (
      <TelaMensagem mensagem="Sua conta está em modo de consulta. Não é possível convidar funcionários." />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>Adicionar funcionário</Text>
          <Text style={estilos.descricao}>
            Ele receberá um convite por e-mail, válido por 7 dias. Ao aceitar, entra como
            Funcionário e você define as permissões depois.
          </Text>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          {aviso ? (
            <>
              <Aviso tom="alerta" mensagem={aviso} />
              <Botao
                titulo="Ir para Funcionários"
                aoPressionar={() => router.replace('/funcionarios')}
              />
            </>
          ) : (
            <>
              <CampoTexto
                rotulo="Nome *"
                valor={nome}
                aoMudar={setNome}
                erro={erros.nome}
                bloqueado={enviando}
                autoCompletar="name"
              />

              <CampoTexto
                rotulo="E-mail *"
                valor={email}
                aoMudar={setEmail}
                erro={erros.email}
                bloqueado={enviando}
                tipoTeclado="email-address"
                autoCompletar="email"
                placeholder="funcionario@exemplo.com"
              />

              <Botao titulo="Enviar convite" aoPressionar={convidar} carregando={enviando} />
              <Botao titulo="Cancelar" variante="texto" aoPressionar={() => router.back()} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
});
