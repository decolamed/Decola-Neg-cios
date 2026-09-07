/**
 * Etapa de pagamento — Seções 6.4, 6.6 e 7.12 (item 6).
 *
 * "o app abre o checkout hospedado do Asaas (Asaas Checkout) dentro de uma
 * webview/navegador in-app, usando a URL gerada pelo backend ao criar a
 * cobrança (Seção 6.4) — evita construir um formulário de cartão/Pix/boleto
 * customizado... Após o pagamento, o app aguarda a confirmação via webhook
 * (backend atualiza `assinaturas.status` para `ativa`) e navega
 * automaticamente para o Dashboard assim que detectar a mudança (poll
 * periódico curto ou Supabase Realtime na tabela `assinaturas`)."
 *
 * O app não conhece a chave do Asaas nem escreve em `assinaturas`: pede a URL
 * à Edge Function `asaas-checkout` e espera. Quem libera o acesso é o webhook.
 *
 * Duas portas chegam aqui: o cadastro com trial desligado
 * (`pendente_pagamento`, Seção 7.12) e a regularização a partir de Meu plano
 * (`carencia` ou `modo_limitado`, Seção 6.6).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { iniciarCheckout } from '@/dados/assinatura';
import { moeda } from '@/lib/formato';
import { textoDoErro } from '@/lib/erros';

/** Estados em que o acesso está liberado — a tela de pagamento sai de cena. */
const STATUS_LIBERADOS = ['ativa', 'trial'];

/** Rede de segurança do "poll periódico curto" da Seção 7.12. */
const INTERVALO_DE_CONFERENCIA_MS = 5000;

export default function Pagamento() {
  const { carregando, conta, recarregar, sair, temPermissao } = useSessao();
  const status = conta?.assinatura?.status;

  const [erro, setErro] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [aguardando, setAguardando] = useState(false);
  const aguardandoRef = useRef(false);

  useEffect(() => {
    aguardandoRef.current = aguardando;
  }, [aguardando]);

  // Seção 7.12 — assim que o webhook marca a assinatura como ativa, o app
  // navega sozinho. O Realtime de `assinaturas` (SessaoContexto) é o caminho
  // principal; o poll abaixo cobre o caso de a conexão ter caído.
  useEffect(() => {
    if (status && STATUS_LIBERADOS.includes(status)) {
      router.replace('/dashboard');
    }
  }, [status]);

  useEffect(() => {
    if (!aguardando) return;

    const timer = setInterval(() => {
      void recarregar();
    }, INTERVALO_DE_CONFERENCIA_MS);

    return () => clearInterval(timer);
  }, [aguardando, recarregar]);

  // Voltar ao app depois de pagar no navegador externo também dispara a
  // conferência, sem esperar o próximo tique.
  useEffect(() => {
    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && aguardandoRef.current) void recarregar();
    });
    return () => inscricao.remove();
  }, [recarregar]);

  const pagar = useCallback(async () => {
    setErro(null);
    setAbrindo(true);

    try {
      const checkout = await iniciarCheckout();

      // Navegador in-app: mantém o usuário dentro do app e devolve o controle
      // ao fechar, sem depender de deep link de retorno do Asaas.
      await WebBrowser.openBrowserAsync(checkout.url_checkout);

      setAguardando(true);
      await recarregar();
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível iniciar o pagamento.'));
    } finally {
      setAbrindo(false);
    }
  }, [recarregar]);

  if (carregando) return <TelaCarregando />;

  const valor = conta?.assinatura?.valor_contratado ?? null;
  const podeGerenciar = temPermissao('gerenciar_assinatura');

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>
          {status === 'pendente_pagamento' ? 'Ative sua assinatura' : 'Regularize seu pagamento'}
        </Text>

        <Text style={estilos.texto}>
          {status === 'pendente_pagamento'
            ? 'Sua empresa foi criada. Para liberar o acesso, conclua o pagamento da assinatura.'
            : 'Conclua o pagamento para restaurar o acesso completo. Nenhum dado foi perdido.'}
        </Text>

        {valor !== null ? (
          <View style={estilos.card}>
            <Text style={estilos.rotuloValor}>Valor da assinatura</Text>
            <Text style={estilos.valor}>{moeda(valor)}/mês</Text>
            <Text style={estilos.formas}>Pague com Pix, boleto ou cartão de crédito.</Text>
          </View>
        ) : null}

        {erro ? <Aviso mensagem={erro} tom="erro" /> : null}

        {aguardando ? (
          <Aviso
            mensagem={
              'Estamos aguardando a confirmação do pagamento. Pix costuma levar poucos minutos; ' +
              'boleto pode levar até 3 dias úteis. Assim que o pagamento for confirmado, esta ' +
              'tela libera o app sozinha.'
            }
            tom="alerta"
          />
        ) : null}

        {/* Seção 5.3 — pagar a assinatura é ação de quem tem
            `gerenciar_assinatura`. O Funcionário fica só com a explicação. */}
        {podeGerenciar ? (
          <Botao
            titulo={aguardando ? 'Abrir o pagamento novamente' : 'Pagar agora'}
            aoPressionar={pagar}
            carregando={abrindo}
            estilo={{ marginBottom: tema.espacamento.md }}
          />
        ) : (
          <Text style={estilos.nota}>
            Fale com o Gestor da sua empresa para regularizar a assinatura.
          </Text>
        )}

        {status === 'modo_limitado' || status === 'carencia' ? (
          <Botao
            titulo="Voltar ao app"
            variante="secundario"
            aoPressionar={() => router.replace('/dashboard')}
            estilo={{ marginBottom: tema.espacamento.md }}
          />
        ) : null}

        <Botao
          titulo="Sair da conta"
          variante="texto"
          aoPressionar={async () => {
            await sair();
            router.replace('/login');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  texto: { ...tema.tipografia.corpo, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  rotuloValor: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  valor: { ...tema.tipografia.h1, color: tema.cores.primaria, marginTop: tema.espacamento.xs },
  formas: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
  },
  nota: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.md,
  },
});
