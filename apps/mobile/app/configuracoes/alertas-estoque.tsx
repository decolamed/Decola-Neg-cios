/**
 * Configurações → Estoque → Alertas de estoque — Seção 8.3.
 *
 * O alerta NÃO é configurado por produto: é uma configuração geral da empresa,
 * aplicada automaticamente a todos os produtos. Isso substitui o "estoque
 * mínimo" absoluto por produto, que não existe mais no sistema.
 */
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Seletor } from '@/componentes/Seletor';
import { useSessao } from '@/contexto/SessaoContexto';
import { definirPercentualDeAlerta, PERCENTUAIS_DE_ALERTA } from '@/dados/configuracoesEmpresa';

export default function AlertasDeEstoque() {
  const { conta, podeEscrever, recarregar, carregando } = useSessao();

  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const atual = conta?.empresa.alerta_estoque_percentual ?? null;
  const escolhido = selecionado ?? atual;

  const salvar = useCallback(async () => {
    if (!conta || escolhido === null) return;
    setMensagem(null);
    setSucesso(false);
    setSalvando(true);
    try {
      await definirPercentualDeAlerta(conta.empresa.id, escolhido);
      await recarregar();
      setSucesso(true);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível salvar a configuração.');
    } finally {
      setSalvando(false);
    }
  }, [conta, escolhido, recarregar]);

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar as configurações." />;

  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Apenas o Gestor pode configurar os alertas de estoque." />;
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Alertas de estoque</Text>
        <Text style={estilos.descricao}>
          Escolha em que ponto um produto entra em alerta. O percentual é calculado sobre a
          quantidade de referência do produto, que é atualizada a cada reposição.
        </Text>

        {mensagem ? <Aviso mensagem={mensagem} /> : null}
        {sucesso ? <Aviso tom="sucesso" mensagem="Configuração salva." /> : null}
        {!podeEscrever ? (
          <Aviso tom="alerta" mensagem="Sua conta está em modo de consulta. As alterações estão bloqueadas." />
        ) : null}

        <Seletor
          rotulo="Alertar quando o estoque atingir"
          opcoes={PERCENTUAIS_DE_ALERTA.map((p) => ({ valor: String(p), rotulo: `${p}%` }))}
          selecionado={escolhido === null ? null : String(escolhido)}
          aoSelecionar={(valor) => {
            setSucesso(false);
            if (valor) setSelecionado(Number(valor));
          }}
          bloqueado={!podeEscrever || salvando}
        />

        <Text style={estilos.exemplo}>
          {escolhido !== null
            ? `Exemplo: um produto com referência de 20 unidades entra em alerta ao chegar em ${Math.floor(
                (20 * escolhido) / 100,
              )} unidade(s).`
            : ''}
        </Text>

        <Botao
          titulo="Salvar"
          aoPressionar={salvar}
          carregando={salvando}
          desabilitado={!podeEscrever || escolhido === atual}
        />
      </ScrollView>
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
  exemplo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.lg,
  },
});
