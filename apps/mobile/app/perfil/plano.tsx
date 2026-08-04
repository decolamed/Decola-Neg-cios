/**
 * Meu plano — Seção 7.14 (botão "Meu plano") e Seções 6.5 a 6.7.
 *
 * "Gestor: leva à tela de Escolha/Troca de Plano (Seção 7.13, modo troca).
 *  Funcionário: mesmas informações SOMENTE LEITURA, sem opção de trocar."
 *
 * O botão de troca aparece só com `gerenciar_assinatura`, mas quem decide é a
 * RPC `trocar_plano` — esconder o botão é conveniência, não segurança
 * (Seção 9.1).
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  cancelarTrocaDePlano,
  carregarDetalheDaAssinatura,
  ERRO_CARREGAR_ASSINATURA,
  EXPLICACAO_STATUS_ASSINATURA,
  ROTULO_FORMA_COBRANCA,
  ROTULO_STATUS_ASSINATURA,
  ROTULO_STATUS_COBRANCA,
  type DetalheDaAssinatura,
} from '@/dados/assinatura';
import { moeda, rotuloDeFuncionalidade } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; detalhe: DetalheDaAssinatura }
  | { nome: 'erro'; mensagem: string };

/** Datas do banco chegam em ISO; a tela mostra sempre em pt-BR. */
function dataBR(valor: string | null): string {
  if (!valor) return '—';
  const data = valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor);
  return data.toLocaleDateString('pt-BR');
}

export default function MeuPlano() {
  const { conta, temPermissao } = useSessao();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const empresaId = conta?.empresa.id;

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setEstado({ nome: 'carregando' });
    try {
      const detalhe = await carregarDetalheDaAssinatura(empresaId);
      if (!detalhe) {
        setEstado({ nome: 'erro', mensagem: 'Nenhuma assinatura encontrada para esta empresa.' });
        return;
      }
      setEstado({ nome: 'pronto', detalhe });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : ERRO_CARREGAR_ASSINATURA,
      });
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Voltar da tela de troca precisa refletir o plano novo imediatamente.
  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  if (estado.nome === 'carregando') return <TelaCarregando />;

  if (estado.nome === 'erro') {
    return <TelaMensagem mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const { assinatura, plano, planoAgendado, cobrancas } = estado.detalhe;
  const podeGerenciar = temPermissao('gerenciar_assinatura');

  const funcionalidades = Array.isArray(plano.funcionalidades)
    ? (plano.funcionalidades as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];

  const maxFuncionarios = (plano.limites as Record<string, unknown> | null)?.max_funcionarios;

  const desfazerTroca = async () => {
    setSalvando(true);
    setMensagem(null);
    try {
      await cancelarTrocaDePlano();
      setMensagem('Troca de plano cancelada. Você continua no plano atual.');
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível cancelar a troca.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Meu plano</Text>

        {mensagem ? <Aviso mensagem={mensagem} tom="sucesso" /> : null}

        <View style={estilos.card}>
          <Text style={estilos.nomePlano}>{plano.nome}</Text>
          <View style={estilos.linhaValor}>
            {/* O valor exibido é o CONTRATADO, não o de tabela: o preço fica
                congelado no momento da contratação (Seção 7.15). */}
            <Text style={estilos.valor}>{moeda(assinatura.valor_contratado)}</Text>
            <Text style={estilos.periodo}>/mês</Text>
          </View>

          <View style={estilos.selo}>
            <Text style={estilos.textoSelo}>
              {ROTULO_STATUS_ASSINATURA[assinatura.status]}
            </Text>
          </View>

          <Text style={estilos.explicacao}>
            {EXPLICACAO_STATUS_ASSINATURA[assinatura.status]}
          </Text>

          {assinatura.status === 'trial' && assinatura.trial_expira_em ? (
            <Linha rotulo="Teste gratuito até" valor={dataBR(assinatura.trial_expira_em)} />
          ) : null}

          {assinatura.status === 'carencia' && assinatura.carencia_expira_em ? (
            <Linha rotulo="Carência até" valor={dataBR(assinatura.carencia_expira_em)} />
          ) : null}

          {assinatura.proximo_vencimento ? (
            <Linha rotulo="Próximo vencimento" valor={dataBR(assinatura.proximo_vencimento)} />
          ) : null}

          {typeof maxFuncionarios === 'number' ? (
            <Linha rotulo="Funcionários incluídos" valor={`Até ${maxFuncionarios}`} />
          ) : null}

          {/* Seção 6.9 — contas ativadas manualmente não passam pelo fluxo
              normal de pagamento; dizer isso evita cobrança fantasma. */}
          {assinatura.ativada_manualmente ? (
            <Text style={estilos.observacao}>
              Esta conta foi ativada manualmente pela equipe Decola Negócios e não passa pelo
              fluxo de pagamento.
            </Text>
          ) : null}

          {funcionalidades.length > 0 ? (
            <View style={estilos.bloco}>
              <Text style={estilos.subtitulo}>Incluído no seu plano</Text>
              {funcionalidades.map((funcionalidade) => (
                <Text key={funcionalidade} style={estilos.funcionalidade}>
                  • {rotuloDeFuncionalidade(funcionalidade)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {/* Seção 6.7 — downgrade agendado: o cliente permanece no plano atual
            até o vencimento, e pode desistir antes disso. */}
        {planoAgendado ? (
          <View style={estilos.card}>
            <Text style={estilos.subtitulo}>Troca agendada</Text>
            <Text style={estilos.texto}>
              Seu plano muda para <Text style={estilos.destaque}>{planoAgendado.nome}</Text> em{' '}
              {dataBR(assinatura.troca_agendada_para)}
              {assinatura.valor_agendado !== null
                ? `, passando a ${moeda(assinatura.valor_agendado)}/mês`
                : ''}
              . Até lá nada muda.
            </Text>

            {podeGerenciar ? (
              <Botao
                titulo="Cancelar a troca"
                variante="secundario"
                carregando={salvando}
                aoPressionar={desfazerTroca}
                estilo={{ marginTop: tema.espacamento.md }}
              />
            ) : null}
          </View>
        ) : null}

        {/* Seção 7.14 — alteração exige `gerenciar_assinatura`; para o
            Funcionário a tela é somente leitura. */}
        {podeGerenciar ? (
          <>
            {assinatura.status === 'pendente_pagamento' ||
            assinatura.status === 'modo_limitado' ||
            assinatura.status === 'carencia' ? (
              <Botao
                titulo="Regularizar pagamento"
                aoPressionar={() => router.push('/pagamento')}
                estilo={{ marginBottom: tema.espacamento.sm }}
              />
            ) : null}

            <Botao
              titulo="Trocar de plano"
              variante="secundario"
              aoPressionar={() => router.push({ pathname: '/planos', params: { modo: 'troca' } })}
              estilo={{ marginBottom: tema.espacamento.md }}
            />
          </>
        ) : (
          <Text style={estilos.observacao}>
            Para trocar de plano, fale com o Gestor da sua empresa.
          </Text>
        )}

        {/* Extrato — a política `cobrancas_leitura` (0007) já exige
            `gerenciar_assinatura`, então para o Funcionário vem vazio. */}
        {cobrancas.length > 0 ? (
          <View style={estilos.card}>
            <Text style={estilos.subtitulo}>Cobranças</Text>
            {cobrancas.map((cobranca) => (
              <View key={cobranca.id} style={estilos.cobranca}>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.cobrancaValor}>{moeda(cobranca.valor)}</Text>
                  <Text style={estilos.cobrancaDetalhe}>
                    {ROTULO_FORMA_COBRANCA[cobranca.forma_pagamento]} · vence em{' '}
                    {dataBR(cobranca.vencimento)}
                  </Text>
                </View>
                <Text style={estilos.cobrancaStatus}>
                  {ROTULO_STATUS_COBRANCA[cobranca.status]}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.linhaRotulo}>{rotulo}</Text>
      <Text style={estilos.linhaValorTexto}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  nomePlano: { ...tema.tipografia.h2, color: tema.cores.texto },
  linhaValor: { flexDirection: 'row', alignItems: 'baseline', marginTop: tema.espacamento.xs },
  valor: { ...tema.tipografia.h1, color: tema.cores.primaria },
  periodo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginLeft: 4 },
  selo: {
    alignSelf: 'flex-start',
    backgroundColor: tema.cores.destaque,
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.sm,
    paddingVertical: tema.espacamento.xs,
    marginTop: tema.espacamento.sm,
  },
  textoSelo: { ...tema.tipografia.legenda, color: tema.cores.texto },
  explicacao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.sm,
  },
  bloco: { marginTop: tema.espacamento.md },
  subtitulo: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.xs,
  },
  texto: { ...tema.tipografia.corpo, color: tema.cores.texto },
  destaque: tema.tipografia.corpoDestacado,
  funcionalidade: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
  },
  observacao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.sm,
    marginBottom: tema.espacamento.md,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: tema.espacamento.sm,
  },
  linhaRotulo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  linhaValorTexto: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  cobranca: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: tema.cores.borda,
    paddingTop: tema.espacamento.sm,
    marginTop: tema.espacamento.sm,
  },
  cobrancaValor: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  cobrancaDetalhe: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  cobrancaStatus: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
});
