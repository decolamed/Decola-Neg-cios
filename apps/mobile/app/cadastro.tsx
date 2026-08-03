/**
 * Tela Cadastro de Conta e Criação da Empresa — Seção 7.12.
 *
 * Cria a conta do usuário — que se torna automaticamente Gestor Principal
 * (Seção 5.1) — e a empresa associada, dando início a uma nova assinatura.
 *
 * Dois caminhos de entrada:
 *   ?planoId=<uuid>  veio da Escolha do Plano (Seção 7.13) — dá para trocar
 *   ?plano=<slug>    veio de um link direto (Seção 6.3) — plano FIXO, não
 *                    editável, e a Escolha do Plano é pulada por completo
 *
 * Se o usuário já está autenticado (chegou por "Entrar com Google" sem conta
 * prévia — Seção 7.11), os campos de e-mail e senha não aparecem e o nome
 * completo vem pré-preenchido, editável.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Linking,
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
import { Checkbox } from '@/componentes/Checkbox';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import {
  cadastrarComSenha,
  emailValido,
  ERRO_CADASTRO_GENERICO,
  sessaoAtual,
} from '@/dados/autenticacao';
import { criarEmpresaEAssinatura } from '@/dados/empresa';
import {
  buscarPlanoPorId,
  buscarPlanoPorSlug,
  ERRO_CARREGAR_PLANOS,
  type PlanoComTrial,
} from '@/dados/planos';
import { moeda } from '@/lib/formato';
import { SemConexaoError } from '@/lib/conectividade';

const URL_TERMOS = 'https://decolanegocios.com.br/termos';
const URL_PRIVACIDADE = 'https://decolanegocios.com.br/privacidade';

const PLANO_INDISPONIVEL =
  'Este plano não está mais disponível para novas contratações. Escolha outro plano.';

type Preparacao =
  | { nome: 'carregando' }
  | { nome: 'pronto'; plano: PlanoComTrial; planoFixo: boolean; jaAutenticado: boolean }
  | { nome: 'erro'; mensagem: string; permiteEscolherOutro: boolean };

export default function Cadastro() {
  const params = useLocalSearchParams<{ planoId?: string; plano?: string }>();

  const [preparacao, setPreparacao] = useState<Preparacao>({ nome: 'carregando' });

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  /** Resolve o plano e detecta se já existe sessão (caminho do Google). */
  const preparar = useCallback(async () => {
    setPreparacao({ nome: 'carregando' });
    try {
      const sessao = await sessaoAtual();

      // O link direto fixa o plano; vir da tela de planos permite trocar.
      const porSlug = params.plano ? await buscarPlanoPorSlug(params.plano) : null;
      const porId = !porSlug && params.planoId ? await buscarPlanoPorId(params.planoId) : null;
      const plano = porSlug ?? porId;

      if (!plano) {
        setPreparacao({
          nome: 'erro',
          mensagem: PLANO_INDISPONIVEL,
          permiteEscolherOutro: true,
        });
        return;
      }

      if (!plano.plano.ativo) {
        setPreparacao({ nome: 'erro', mensagem: PLANO_INDISPONIVEL, permiteEscolherOutro: true });
        return;
      }

      if (sessao?.user) {
        // Nome pré-preenchido a partir do que o Google devolveu, editável.
        const metadados = sessao.user.user_metadata ?? {};
        setNome(
          (metadados.nome as string) ??
            (metadados.full_name as string) ??
            (metadados.name as string) ??
            '',
        );
        setEmail(sessao.user.email ?? '');
      }

      setPreparacao({
        nome: 'pronto',
        plano,
        planoFixo: Boolean(porSlug),
        jaAutenticado: Boolean(sessao?.user),
      });
    } catch (e) {
      setPreparacao({
        nome: 'erro',
        mensagem:
          e instanceof SemConexaoError
            ? e.message
            : e instanceof Error
              ? e.message
              : ERRO_CARREGAR_PLANOS,
        permiteEscolherOutro: false,
      });
    }
  }, [params.plano, params.planoId]);

  useEffect(() => {
    void preparar();
  }, [preparar]);

  const jaAutenticado = preparacao.nome === 'pronto' && preparacao.jaAutenticado;

  /**
   * Estado "Preenchimento": o botão Criar conta fica desabilitado até todos os
   * campos obrigatórios estarem válidos — incluindo o aceite dos termos.
   */
  const formularioCompleto = useMemo(() => {
    const base = nome.trim().length > 0 && nomeEmpresa.trim().length > 0 && aceitouTermos;
    if (jaAutenticado) return base;
    return base && emailValido(email) && senha.length > 0;
  }, [nome, nomeEmpresa, aceitouTermos, jaAutenticado, email, senha]);

  const aoCriarConta = useCallback(async () => {
    if (preparacao.nome !== 'pronto') return;

    setMensagem(null);
    const novosErros: Record<string, string | null> = {};

    if (nome.trim().length === 0) novosErros.nome = 'Informe seu nome completo.';
    if (nomeEmpresa.trim().length === 0) novosErros.empresa = 'Informe o nome da empresa.';
    if (!jaAutenticado) {
      if (!emailValido(email)) novosErros.email = 'Informe um e-mail válido.';
      // Seção 5.5 — sem exigência de complexidade; apenas não vazia.
      if (senha.length === 0) novosErros.senha = 'Informe uma senha.';
    }

    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;

    setCriando(true);
    try {
      // Passo 2 — cria o auth.users (o trigger cria `usuarios`). Pulado
      // quando a conta já existe por vir do Google.
      if (!jaAutenticado) {
        await cadastrarComSenha(nome, email, senha);
      }

      // Passos 3 a 5, numa transação só, revalidados no servidor.
      const resultado = await criarEmpresaEAssinatura({
        nomeEmpresa,
        planoId: preparacao.plano.plano.id,
        nomeUsuario: nome,
        aceitouTermos,
      });

      // Passo 6 — sem tela de confirmação intermediária.
      if (resultado.assinatura_status === 'trial') {
        router.replace('/dashboard');
      } else {
        // `pendente_pagamento`: sem acesso ao conteúdo até a confirmação.
        // O checkout hospedado do Asaas entra na Fase 7 (Seção 7.12, item 6).
        router.replace('/pagamento');
      }
    } catch (e) {
      setMensagem(e instanceof Error && e.message ? e.message : ERRO_CADASTRO_GENERICO);
    } finally {
      setCriando(false);
    }
  }, [preparacao, nome, nomeEmpresa, email, senha, aceitouTermos, jaAutenticado]);

  if (preparacao.nome === 'carregando') return <TelaCarregando />;

  if (preparacao.nome === 'erro') {
    return (
      <TelaMensagem
        mensagem={preparacao.mensagem}
        aoTentarNovamente={
          preparacao.permiteEscolherOutro ? () => router.replace('/planos') : preparar
        }
      />
    );
  }

  const { plano, planoFixo } = preparacao;

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>Criar conta</Text>

          {/* Indicador do plano selecionado. A opção de trocar não aparece no
              fluxo de link direto, onde o plano vem fixo (Seção 6.3). */}
          <View style={estilos.cardPlano}>
            <View style={estilos.infoPlano}>
              <Text style={estilos.rotuloPlano}>Plano selecionado</Text>
              <Text style={estilos.nomePlano}>{plano.plano.nome}</Text>
              <Text style={estilos.valorPlano}>{moeda(plano.plano.valor_mensal)} /mês</Text>
            </View>

            {!planoFixo ? (
              <Link href="/planos" style={estilos.link}>
                Trocar
              </Link>
            ) : null}
          </View>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          <CampoTexto
            rotulo="Nome completo"
            valor={nome}
            aoMudar={setNome}
            erro={erros.nome}
            bloqueado={criando}
            autoCompletar="name"
          />

          {/* Vindo do Google, a conta já existe: e-mail e senha não aparecem. */}
          {!jaAutenticado ? (
            <>
              <CampoTexto
                rotulo="E-mail"
                valor={email}
                aoMudar={setEmail}
                erro={erros.email}
                bloqueado={criando}
                tipoTeclado="email-address"
                autoCompletar="email"
                placeholder="voce@exemplo.com"
              />

              <CampoTexto
                rotulo="Senha"
                valor={senha}
                aoMudar={setSenha}
                erro={erros.senha}
                bloqueado={criando}
                senha
                autoCompletar="password"
              />
            </>
          ) : (
            <View style={estilos.contaGoogle}>
              <Text style={estilos.textoContaGoogle}>Conectado como {email}</Text>
            </View>
          )}

          <CampoTexto
            rotulo="Nome da empresa"
            valor={nomeEmpresa}
            aoMudar={setNomeEmpresa}
            erro={erros.empresa}
            bloqueado={criando}
          />

          <Checkbox marcado={aceitouTermos} aoMudar={setAceitouTermos} bloqueado={criando}>
            <Text style={estilos.textoTermos}>
              Li e aceito os{' '}
              <Text style={estilos.link} onPress={() => Linking.openURL(URL_TERMOS)}>
                Termos de Uso
              </Text>{' '}
              e a{' '}
              <Text style={estilos.link} onPress={() => Linking.openURL(URL_PRIVACIDADE)}>
                Política de Privacidade
              </Text>
              .
            </Text>
          </Checkbox>

          <Botao
            titulo="Criar conta"
            aoPressionar={aoCriarConta}
            carregando={criando}
            desabilitado={!formularioCompleto}
          />

          <View style={estilos.rodape}>
            <Text style={estilos.textoRodape}>Já tem uma conta? </Text>
            <Link href="/login" style={estilos.link}>
              Faça login
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { flexGrow: 1, padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  cardPlano: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.lg,
    ...tema.elevacao.card,
  },
  infoPlano: { flex: 1 },
  rotuloPlano: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  nomePlano: { ...tema.tipografia.h2, color: tema.cores.texto, marginTop: 2 },
  valorPlano: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria, marginTop: 2 },
  contaGoogle: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
  },
  textoContaGoogle: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  textoTermos: { ...tema.tipografia.corpo, color: tema.cores.texto },
  link: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tema.espacamento.lg,
    flexWrap: 'wrap',
  },
  textoRodape: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
});
