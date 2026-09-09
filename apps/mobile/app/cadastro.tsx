/**
 * Tela Cadastro de Conta e Criação da Empresa — Seção 7.12.
 *
 * O QUE MUDOU, E POR QUÊ. Esta tela criava a conta do próprio aparelho
 * (`signUp`) e só depois pedia a empresa ao banco. Com "Confirm email" ligado
 * no Supabase Auth, o `signUp` não devolve sessão, o passo seguinte nunca
 * acontecia, e a pessoa terminava com uma conta no Auth e NENHUMA empresa —
 * logo, nenhuma assinatura e nenhuma cobrança. Ela confirmava o e-mail,
 * tentava entrar e ouvia "você não está vinculado a nenhuma empresa ativa",
 * sem nunca ter visto um boleto. Quatro contas ficaram assim.
 *
 * Agora a contratação inteira acontece no servidor, na Edge Function
 * `contratar` — a mesma porta que o site usa. Ela cria a conta já confirmada,
 * cria a empresa e ABRE A COBRANÇA no mesmo pedido, devolvendo o endereço do
 * checkout. Não há como sobrar meio cadastro.
 *
 * NÃO SE ESCOLHE SENHA AQUI. Ela chega por e-mail quando o pagamento é
 * confirmado. Pedir senha antes foi o que criou a armadilha: a pessoa
 * escolhia, guardava, e a senha não abria nada.
 *
 * A TELA EXPLICA O CAMINHO ANTES DE PEDIR OS DADOS. Quem preenche um cadastro
 * precisa saber que o próximo passo é pagar, e que o acesso vem depois da
 * confirmação — senão o pagamento parece cobrança indevida e a espera pelo
 * e-mail parece falha.
 *
 * Dois caminhos de entrada:
 *   ?planoId=<uuid>  veio da Escolha do Plano (Seção 7.13) — dá para trocar
 *   ?plano=<slug>    veio de um link direto (Seção 6.3) — plano FIXO, não
 *                    editável, e a Escolha do Plano é pulada por completo
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
import * as WebBrowser from 'expo-web-browser';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Checkbox } from '@/componentes/Checkbox';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone, LadrilhoDeIcone } from '@/componentes/Icone';
import { Marca, AssinaturaDecola } from '@/componentes/Marca';
import { emailValido, ERRO_CADASTRO_GENERICO, sessaoAtual } from '@/dados/autenticacao';
import { contratar, type ContratacaoFeita } from '@/dados/contratacao';
import { documentoValido, mascararDocumento, tipoDoDocumento } from '@decola/pix';
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

/**
 * Abre o checkout do Asaas.
 *
 * No aparelho, o navegador in-app mantém a pessoa dentro do aplicativo. Na
 * web, trocar a página vale mais que abrir uma aba: aba nova é bloqueada por
 * padrão quando não sai de um toque direto, e o cliente ficaria olhando uma
 * tela parada sem entender que o pagamento tinha sido aberto em algum lugar.
 */
async function abrirCheckout(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

export default function Cadastro() {
  const params = useLocalSearchParams<{ planoId?: string; plano?: string }>();

  const [preparacao, setPreparacao] = useState<Preparacao>({ nome: 'carregando' });

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [documento, setDocumento] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [aceitouTermos, setAceitouTermos] = useState(false);

  const [erros, setErros] = useState<Record<string, string | null>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  /**
   * Guardado depois que a contratação dá certo. A conta e a empresa JÁ existem
   * neste ponto: se o navegador engolir a abertura do checkout, a pessoa não
   * pode ficar sem caminho — daí o endereço continuar à mão num botão.
   */
  const [contratado, setContratado] = useState<ContratacaoFeita | null>(null);

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
   * O botão fica desabilitado até os campos obrigatórios estarem válidos —
   * incluindo o aceite dos termos.
   */
  const formularioCompleto = useMemo(() => {
    const base =
      nome.trim().length > 0 &&
      nomeEmpresa.trim().length > 0 &&
      documentoValido(documento) &&
      aceitouTermos;
    return jaAutenticado ? base : base && emailValido(email);
  }, [nome, nomeEmpresa, documento, aceitouTermos, jaAutenticado, email]);

  /**
   * O erro do documento aparece assim que o número está COMPLETO e não fecha —
   * não só ao enviar.
   *
   * O botão fica desabilitado enquanto o documento não vale, e um botão cinza
   * sem explicação é um beco: a pessoa digita um CPF com um dígito trocado, vê
   * o botão apagado e não tem como saber qual campo está errado. Com onze ou
   * catorze dígitos já dá para afirmar que não fecha; com menos, ela ainda está
   * digitando e reclamar seria atrapalhar.
   */
  const aoMudarDocumento = useCallback((valor: string) => {
    const formatado = mascararDocumento(valor);
    setDocumento(formatado);

    const digitos = formatado.replace(/\D/g, '');
    const completo = digitos.length === 11 || digitos.length === 14;

    setErros((atuais) => ({
      ...atuais,
      documento:
        completo && !documentoValido(formatado)
          ? digitos.length === 11
            ? 'Este CPF não é válido. Confira os números.'
            : 'Este CNPJ não é válido. Confira os números.'
          : null,
    }));
  }, []);

  const aoContratar = useCallback(async () => {
    if (preparacao.nome !== 'pronto') return;

    setMensagem(null);
    const novosErros: Record<string, string | null> = {};

    if (nome.trim().length === 0) novosErros.nome = 'Informe seu nome completo.';
    if (nomeEmpresa.trim().length === 0) novosErros.empresa = 'Informe o nome da empresa.';
    if (!jaAutenticado && !emailValido(email)) novosErros.email = 'Informe um e-mail válido.';

    // Dizer QUAL documento está errado poupa a pessoa de conferir o número
    // certo: quem digitou onze dígitos quis dizer CPF, e é do CPF que se fala.
    if (!documentoValido(documento)) {
      const digitos = documento.replace(/\D/g, '');
      novosErros.documento =
        digitos.length === 0
          ? 'Informe o CPF ou CNPJ do responsável.'
          : digitos.length === 11
            ? 'Este CPF não é válido. Confira os números.'
            : digitos.length === 14
              ? 'Este CNPJ não é válido. Confira os números.'
              : 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).';
    }

    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;

    setCriando(true);
    try {
      // Um pedido só: conta, empresa e cobrança. O servidor devolve o endereço
      // do checkout já pronto.
      const resultado = await contratar({
        nome: nome.trim(),
        email: email.trim(),
        nomeEmpresa: nomeEmpresa.trim(),
        planoSlug: preparacao.plano.plano.slug,
        aceitouTermos,
        cpfCnpj: documento,
      });

      setContratado(resultado);
      await abrirCheckout(resultado.url_checkout);
    } catch (e) {
      setMensagem(e instanceof Error && e.message ? e.message : ERRO_CADASTRO_GENERICO);
    } finally {
      setCriando(false);
    }
  }, [preparacao, nome, nomeEmpresa, documento, email, aceitouTermos, jaAutenticado]);

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

  // ---------------------------------------------------------------------------
  // Depois da contratação: a conta existe e falta pagar. Esta tela não promete
  // acesso imediato — ela diz o que está acontecendo e quanto costuma demorar,
  // porque boleto que confirma em três dias úteis não é defeito, mas vira
  // reclamação quando ninguém avisou.
  // ---------------------------------------------------------------------------
  if (contratado) {
    return (
      <SafeAreaView style={estilos.tela}>
        <ScrollView contentContainerStyle={estilos.conteudo}>
          <Marca escura comTagline={false} />

          <Text style={estilos.titulo}>Recebemos seu pedido</Text>
          <Text style={estilos.subtitulo}>
            Sua conta e o cadastro do {nomeEmpresa.trim()} já foram criados. Falta só o pagamento
            de {moeda(contratado.valor)} para liberar o acesso.
          </Text>

          <View style={estilos.cardPasso}>
            <Text style={estilos.tituloCard}>Quanto costuma demorar a confirmação</Text>
            <Text style={estilos.itemPrazo}>
              <Text style={estilos.forte}>Pix</Text> — poucos minutos.
            </Text>
            <Text style={estilos.itemPrazo}>
              <Text style={estilos.forte}>Cartão de crédito</Text> — em geral na hora.
            </Text>
            <Text style={estilos.itemPrazo}>
              <Text style={estilos.forte}>Boleto</Text> — até 3 dias úteis depois do pagamento.
            </Text>
            <Text style={estilos.legenda}>
              Assim que a confirmação chegar, enviamos um e-mail para {email.trim()} com o link
              para você criar sua senha. Você não precisa ficar com esta tela aberta.
            </Text>
          </View>

          <Botao
            titulo="Abrir o pagamento de novo"
            variante="secundario"
            aoPressionar={() => {
              void abrirCheckout(contratado.url_checkout);
            }}
          />

          <Text style={estilos.legenda}>
            Não recebeu o e-mail depois do prazo? Confira a caixa de spam e, se não estiver lá,
            toque em "Esqueci minha senha" na tela de entrada e informe o mesmo e-mail — o link de
            acesso é o mesmo.
          </Text>

          <View style={estilos.rodape}>
            <Link href="/login" style={estilos.link}>
              Voltar para a tela de entrada
            </Link>
          </View>

          <AssinaturaDecola escura />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Marca escura comTagline={false} />

          <Text style={estilos.titulo}>Criar conta</Text>
          <Text style={estilos.subtitulo}>Comece a organizar suas vendas hoje</Text>

          {/* Indicador do plano selecionado. A opção de trocar não aparece no
              fluxo de link direto, onde o plano vem fixo (Seção 6.3). */}
          <View style={estilos.cardPlano}>
            <LadrilhoDeIcone nome="plano" cor={tema.cores.secundaria} tamanho={40} />

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

          {/* Dito ANTES do formulário, de propósito: quem preenche precisa
              saber que o próximo passo é pagar e que a senha vem depois. */}
          <View style={estilos.cardPasso}>
            <Text style={estilos.tituloCard}>Como funciona</Text>
            <Text style={estilos.passo}>
              <Text style={estilos.forte}>1.</Text> Você preenche seus dados aqui.
            </Text>
            <Text style={estilos.passo}>
              <Text style={estilos.forte}>2.</Text> Abrimos o pagamento, onde você escolhe entre
              Pix, boleto ou cartão.
            </Text>
            <Text style={estilos.passo}>
              <Text style={estilos.forte}>3.</Text> Confirmado o pagamento, você recebe um e-mail
              para criar sua senha — e o acesso é liberado na hora.
            </Text>
            <Text style={estilos.legenda}>
              A senha não é escolhida agora: ela vem nesse e-mail, no endereço que você informar
              abaixo.
            </Text>
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

          {/* Vindo do Google, a conta já existe: o e-mail não é editável. */}
          {!jaAutenticado ? (
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
          ) : (
            <View style={estilos.contaGoogle}>
              <Icone nome="perfil" cor={tema.cores.secundaria} tamanho={20} />
              <Text style={estilos.textoContaGoogle}>Conectado como {email}</Text>
            </View>
          )}

          {/* Exigido pelo Asaas para emitir a cobrança. Fica junto dos dados
              de quem paga, e não escondido no fim, porque é dado obrigatório
              e a pessoa costuma precisar buscar o número. */}
          <CampoTexto
            rotulo="CPF ou CNPJ do responsável"
            valor={documento}
            aoMudar={aoMudarDocumento}
            erro={erros.documento}
            bloqueado={criando}
            tipoTeclado="number-pad"
            placeholder="000.000.000-00"
          />
          <Text style={estilos.dica}>
            {tipoDoDocumento(documento) === 'cnpj'
              ? 'CNPJ reconhecido. Ele aparece na nota da assinatura.'
              : 'É quem vai constar na cobrança. Pode ser o seu CPF, se o negócio ainda não tem CNPJ.'}
          </Text>

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

          {/* O rótulo diz o que o botão faz. "Criar conta" escondia que o
              passo seguinte era uma tela de pagamento. */}
          <Botao
            titulo="Continuar para o pagamento"
            aoPressionar={aoContratar}
            carregando={criando}
            desabilitado={!formularioCompleto}
          />

          <View style={estilos.rodape}>
            <Text style={estilos.textoRodape}>Já tem uma conta? </Text>
            <Link href="/login" style={estilos.link}>
              Faça login
            </Link>
          </View>

          <AssinaturaDecola escura />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.superficie },
  conteudo: {
    flexGrow: 1,
    padding: tema.espacamento.xl,
    paddingTop: tema.espacamento.lg,
  },
  titulo: {
    ...tema.tipografia.h1,
    color: tema.cores.texto,
    marginTop: tema.espacamento.xl,
  },
  subtitulo: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  cardPlano: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    borderWidth: 1,
    borderColor: tema.cores.secundaria,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.lg,
    ...tema.elevacao.card,
  },
  infoPlano: { flex: 1 },
  rotuloPlano: { ...tema.tipografia.rotulo, color: tema.cores.textoSuave },
  nomePlano: { ...tema.tipografia.h2, color: tema.cores.texto, marginTop: 2 },
  valorPlano: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria, marginTop: 2 },
  cardPasso: {
    // `fundoCard` é branco, e a tela também: um cartão branco sobre branco não
    // se lê como bloco. O cinza claro do tema separa sem pedir atenção.
    backgroundColor: tema.cores.fundo,
    borderRadius: tema.raio.lg,
    borderWidth: 1,
    borderColor: tema.cores.bordaSuave,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.lg,
    gap: tema.espacamento.xs,
  },
  tituloCard: {
    ...tema.tipografia.rotulo,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.xs,
  },
  passo: { ...tema.tipografia.corpo, color: tema.cores.texto },
  dica: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: -tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
  itemPrazo: { ...tema.tipografia.corpo, color: tema.cores.texto },
  forte: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  legenda: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.sm,
  },
  contaGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.sm,
    backgroundColor: tema.tons.secundaria,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
  },
  textoContaGoogle: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria, flex: 1 },
  textoTermos: { ...tema.tipografia.corpo, color: tema.cores.texto },
  link: { ...tema.tipografia.corpoDestacado, color: tema.cores.destrutiva },
  rodape: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tema.espacamento.xl,
    marginBottom: tema.espacamento.lg,
    flexWrap: 'wrap',
  },
  textoRodape: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
});
