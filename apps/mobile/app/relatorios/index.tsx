/**
 * Tela Relatórios — Seções 7.7, 10.2 e 10.3.
 *
 * "Relatórios foca em análise por período com gráficos, filtros e exportação
 * (visão analítica)", separada do Financeiro operacional.
 *
 * Acesso: `exportar_relatorios` dá a TELA COMPLETA, não só o botão de exportar
 * (Seção 10.3). A RPC de agregação recusa quem não tem.
 */
import { useCallback, useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { LadrilhoDeIcone, type NomeDeIcone } from '@/componentes/Icone';
import {
  CartaoDeGrafico,
  ComparacaoDePeriodos,
  GraficoDeEvolucao,
  GraficoDeRanking,
} from '@/componentes/Graficos';
import { Seletor } from '@/componentes/Seletor';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  carregarRelatorio,
  exportarRelatorio,
  type ColunasDoRelatorio,
  type Relatorio,
} from '@/dados/financeiro';
import { moeda } from '@/lib/formato';
import {
  dataDeTexto,
  descreverPeriodo,
  periodoDe,
  periodoPersonalizado,
  ROTULOS_DE_PERIODO,
  type Periodo,
  type TipoDePeriodo,
} from '@/lib/periodo';

const ROTULO_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartão',
  outros: 'Outros',
};

export default function Relatorios() {
  const { conta, temPermissao } = useSessao();

  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDe('mes'));
  const [inicioTexto, setInicioTexto] = useState('');
  const [fimTexto, setFimTexto] = useState('');
  const [erroPeriodo, setErroPeriodo] = useState<string | null>(null);

  // Seção 10.2 — filtros personalizados: o Gestor escolhe quais informações
  // aparecem no relatório e no arquivo exportado.
  const [colunas, setColunas] = useState<ColunasDoRelatorio>({
    funcionario: true,
    formaPagamento: true,
    produtos: true,
    quantidade: true,
  });

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [exportando, setExportando] = useState<'pdf' | 'csv' | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setRelatorio(await carregarRelatorio(periodo.desde, periodo.ate));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o relatório.');
    } finally {
      setCarregando(false);
    }
  }, [periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aplicarPersonalizado = useCallback(() => {
    setErroPeriodo(null);
    const inicio = dataDeTexto(inicioTexto);
    const fim = dataDeTexto(fimTexto);

    if (!inicio || !fim) {
      setErroPeriodo('Informe as duas datas no formato AAAA-MM-DD.');
      return;
    }
    if (inicio > fim) {
      setErroPeriodo('A data inicial precisa ser anterior à final.');
      return;
    }

    setPeriodo(periodoPersonalizado(inicio, fim));
  }, [inicioTexto, fimTexto]);

  /**
   * Seção 10.3 — o arquivo é montado no BACKEND; o app só recebe os bytes e
   * abre a folha de compartilhamento para o usuário salvar ou enviar.
   */
  const exportar = useCallback(
    async (formato: 'pdf' | 'csv') => {
      setMensagem(null);
      setExportando(formato);
      try {
        const arquivo = await exportarRelatorio({
          formato,
          desde: periodo.desde,
          ate: periodo.ate,
          colunas,
        });

        const caminho = `${FileSystem.cacheDirectory}${arquivo.nomeArquivo}`;
        await FileSystem.writeAsStringAsync(caminho, arquivo.conteudo, {
          encoding: formato === 'pdf' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(caminho, {
            mimeType: arquivo.mimeType,
            dialogTitle: 'Relatório de vendas',
          });
        } else {
          setMensagem(`Relatório salvo em ${caminho}`);
        }
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível exportar o relatório.');
      } finally {
        setExportando(null);
      }
    },
    [periodo, colunas],
  );

  if (!conta) return <TelaCarregando />;

  // Seção 10.3 — visibilidade de TELA, não de botão isolado.
  if (!temPermissao('exportar_relatorios')) {
    return <TelaMensagem mensagem="Você não tem permissão para acessar os relatórios." />;
  }

  if (carregando) return <TelaCarregando />;
  if (erro || !relatorio) {
    return <TelaMensagem mensagem={erro ?? 'Sem dados.'} aoTentarNovamente={carregar} />;
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Relatórios</Text>
        <Text style={estilos.periodo}>{descreverPeriodo(periodo)}</Text>

        {/* Seção 10.2 — dia, semana, mês ou período personalizado. */}
        <Seletor
          opcoes={(['dia', 'semana', 'mes', 'personalizado'] as TipoDePeriodo[]).map((t) => ({
            valor: t,
            rotulo: ROTULOS_DE_PERIODO[t],
          }))}
          selecionado={periodo.tipo}
          aoSelecionar={(valor) => {
            if (!valor) return;
            if (valor === 'personalizado') {
              setPeriodo({ ...periodo, tipo: 'personalizado' });
            } else {
              setPeriodo(periodoDe(valor as 'dia' | 'semana' | 'mes'));
            }
          }}
          horizontal
        />

        {periodo.tipo === 'personalizado' ? (
          <View style={estilos.cartao}>
            <CampoTexto
              rotulo="De"
              valor={inicioTexto}
              aoMudar={setInicioTexto}
              placeholder="AAAA-MM-DD"
            />
            <CampoTexto
              rotulo="Até"
              valor={fimTexto}
              aoMudar={setFimTexto}
              erro={erroPeriodo}
              placeholder="AAAA-MM-DD"
            />
            <Botao
              titulo="Aplicar período"
              variante="contorno"
              aoPressionar={aplicarPersonalizado}
            />
          </View>
        ) : null}

        {mensagem ? <Aviso mensagem={mensagem} tom="informacao" /> : null}

        <CartaoDeGrafico titulo="Comparação entre períodos">
          <ComparacaoDePeriodos
            atual={Number(relatorio.totais.total_vendido)}
            anterior={Number(relatorio.periodo_anterior.total_vendido)}
          />
        </CartaoDeGrafico>

        <View style={estilos.grade}>
          <Indicador
            rotulo="Vendas"
            valor={String(relatorio.totais.quantidade_vendas)}
            icone="vendas"
            cor={tema.cores.secundaria}
          />
          <Indicador
            rotulo="Ticket médio"
            valor={moeda(Number(relatorio.totais.ticket_medio))}
            icone="financeiro"
            cor={tema.cores.apoio}
          />
          <Indicador
            rotulo="Descontos"
            valor={moeda(Number(relatorio.totais.desconto_concedido))}
            icone="saida"
            cor={tema.cores.negativo}
          />
        </View>

        {relatorio.canceladas.quantidade > 0 ? (
          <Aviso
            tom="alerta"
            mensagem={`${relatorio.canceladas.quantidade} venda(s) cancelada(s) no período, somando ${moeda(
              Number(relatorio.canceladas.total),
            )}. Vendas canceladas não entram nos totais.`}
          />
        ) : null}

        <CartaoDeGrafico titulo="Evolução das vendas" vazio={relatorio.evolucao.length === 0}>
          <GraficoDeEvolucao
            dados={relatorio.evolucao.map((ponto) => ({
              rotulo: new Date(`${ponto.dia}T12:00:00`).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              }),
              valor: Number(ponto.total),
            }))}
          />
        </CartaoDeGrafico>

        {colunas.produtos ? (
          <CartaoDeGrafico
            titulo="Produtos mais vendidos"
            vazio={relatorio.produtos_mais_vendidos.length === 0}
          >
            <GraficoDeRanking
              dados={relatorio.produtos_mais_vendidos.map((p) => ({
                rotulo: p.nome,
                valor: Number(p.total),
                detalhe: colunas.quantidade ? `${p.quantidade} un.` : undefined,
              }))}
            />
          </CartaoDeGrafico>
        ) : null}

        {colunas.formaPagamento ? (
          <CartaoDeGrafico
            titulo="Formas de pagamento"
            vazio={relatorio.formas_pagamento.length === 0}
          >
            <GraficoDeRanking
              dados={relatorio.formas_pagamento.map((f) => ({
                rotulo: ROTULO_PAGAMENTO[f.forma] ?? f.forma,
                valor: Number(f.total),
                detalhe: colunas.quantidade ? `${f.quantidade} venda(s)` : undefined,
              }))}
            />
          </CartaoDeGrafico>
        ) : null}

        {colunas.funcionario ? (
          <CartaoDeGrafico
            titulo="Vendas por funcionário"
            vazio={relatorio.por_funcionario.length === 0}
          >
            <GraficoDeRanking
              dados={relatorio.por_funcionario.map((p) => ({
                rotulo: p.nome,
                valor: Number(p.total),
                detalhe: colunas.quantidade ? `${p.quantidade} venda(s)` : undefined,
              }))}
            />
          </CartaoDeGrafico>
        ) : null}

        {/* Seção 10.2 — o Gestor escolhe o que aparece no relatório e no arquivo. */}
        <View style={estilos.cartao}>
          <Text style={estilos.tituloCartao}>Informações do relatório</Text>
          <Alternador
            rotulo="Funcionário responsável"
            valor={colunas.funcionario}
            aoMudar={(v) => setColunas((c) => ({ ...c, funcionario: v }))}
          />
          <Alternador
            rotulo="Forma de pagamento"
            valor={colunas.formaPagamento}
            aoMudar={(v) => setColunas((c) => ({ ...c, formaPagamento: v }))}
          />
          <Alternador
            rotulo="Produtos vendidos"
            valor={colunas.produtos}
            aoMudar={(v) => setColunas((c) => ({ ...c, produtos: v }))}
          />
          <Alternador
            rotulo="Quantidade"
            valor={colunas.quantidade}
            aoMudar={(v) => setColunas((c) => ({ ...c, quantidade: v }))}
          />
        </View>

        <View style={estilos.exportacao}>
          <Text style={estilos.tituloCartao}>Exportar</Text>
          <Botao
            titulo="Exportar PDF"
            aoPressionar={() => void exportar('pdf')}
            carregando={exportando === 'pdf'}
            desabilitado={exportando !== null}
            estilo={{ marginBottom: tema.espacamento.sm }}
          />
          <Botao
            titulo="Exportar planilha (Excel)"
            variante="contorno"
            aoPressionar={() => void exportar('csv')}
            carregando={exportando === 'csv'}
            desabilitado={exportando !== null}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Indicador({
  rotulo,
  valor,
  icone,
  cor,
}: {
  rotulo: string;
  valor: string;
  icone: NomeDeIcone;
  cor: string;
}) {
  return (
    <View style={estilos.indicador}>
      <LadrilhoDeIcone nome={icone} cor={cor} tamanho={32} />
      <Text style={estilos.valorIndicador}>{valor}</Text>
      <Text style={estilos.rotuloIndicador}>{rotulo}</Text>
    </View>
  );
}

function Alternador({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: boolean;
  aoMudar: (valor: boolean) => void;
}) {
  return (
    <View style={estilos.linhaAlternador}>
      <Text style={estilos.rotuloAlternador}>{rotulo}</Text>
      <Switch
        value={valor}
        onValueChange={aoMudar}
        trackColor={{ true: tema.cores.secundaria, false: tema.cores.borda }}
        thumbColor={tema.cores.superficie}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  periodo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: 2,
    marginBottom: tema.espacamento.md,
  },
  cartao: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  tituloCartao: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.sm,
  },
  grade: { flexDirection: 'row', gap: tema.espacamento.sm, marginBottom: tema.espacamento.md },
  indicador: {
    flex: 1,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  rotuloIndicador: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  valorIndicador: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    marginTop: tema.espacamento.sm,
  },
  exportacao: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  linhaAlternador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tema.espacamento.xs,
  },
  rotuloAlternador: { ...tema.tipografia.corpo, color: tema.cores.texto },
});
