/**
 * Gráficos — Seções 7.7 e 10.2.
 *
 * "Os componentes de gráfico e agregação são COMPARTILHADOS entre as duas
 * telas para evitar duplicação de lógica" (Seção 7.7). Por isso vivem aqui, e
 * não dentro de uma tela.
 *
 * Desenhados com react-native-svg, sem biblioteca de gráficos: as três formas
 * que a especificação pede (evolução, ranking e distribuição) são simples o
 * bastante, e assim as cores saem direto dos tokens do tema.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import tema from '@decola/theme';
import { moeda } from '@/lib/formato';

/** Paleta de séries, na ordem de uso. Vem toda da Seção 2.1. */
const CORES_DE_SERIE = [
  tema.cores.primaria,
  tema.cores.secundaria,
  tema.cores.apoio,
  tema.cores.destaque,
  tema.cores.negativo,
];

export function CartaoDeGrafico({
  titulo,
  vazio,
  children,
}: {
  titulo: string;
  vazio?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={estilos.cartao}>
      <Text style={estilos.titulo}>{titulo}</Text>
      {vazio ? <Text style={estilos.vazio}>Sem dados no período.</Text> : children}
    </View>
  );
}

/**
 * Evolução das vendas — barras verticais ao longo do tempo (Seção 10.2).
 */
export function GraficoDeEvolucao({
  dados,
  altura = 160,
}: {
  dados: { rotulo: string; valor: number }[];
  altura?: number;
}) {
  if (dados.length === 0) return null;

  const maximo = Math.max(...dados.map((d) => d.valor), 1);
  const largura = 320;
  const espaco = 4;
  const larguraBarra = Math.max((largura - espaco * dados.length) / dados.length, 2);

  return (
    <View>
      <Svg width="100%" height={altura} viewBox={`0 0 ${largura} ${altura}`}>
        {/* Linha de base */}
        <Line
          x1={0}
          y1={altura - 1}
          x2={largura}
          y2={altura - 1}
          stroke={tema.cores.borda}
          strokeWidth={1}
        />
        {dados.map((ponto, indice) => {
          const alturaBarra = Math.max((ponto.valor / maximo) * (altura - 12), 2);
          return (
            <Rect
              key={`${ponto.rotulo}-${indice}`}
              x={indice * (larguraBarra + espaco)}
              y={altura - alturaBarra - 1}
              width={larguraBarra}
              height={alturaBarra}
              rx={2}
              fill={tema.cores.secundaria}
            />
          );
        })}
      </Svg>

      <View style={estilos.eixo}>
        <Text style={estilos.rotuloEixo}>{dados[0].rotulo}</Text>
        <Text style={estilos.rotuloEixo}>{moeda(maximo)} máx.</Text>
        <Text style={estilos.rotuloEixo}>{dados[dados.length - 1].rotulo}</Text>
      </View>
    </View>
  );
}

/**
 * Ranking horizontal — serve a "produtos mais vendidos", "formas de pagamento"
 * e "vendas por funcionário", que são a mesma forma com dados diferentes.
 */
export function GraficoDeRanking({
  dados,
  formatarValor = moeda,
}: {
  dados: { rotulo: string; valor: number; detalhe?: string }[];
  formatarValor?: (valor: number) => string;
}) {
  if (dados.length === 0) return null;

  const maximo = Math.max(...dados.map((d) => d.valor), 1);

  return (
    <View>
      {dados.map((item, indice) => (
        <View key={`${item.rotulo}-${indice}`} style={estilos.linhaRanking}>
          <View style={estilos.cabecalhoRanking}>
            <Text style={estilos.rotuloRanking} numberOfLines={1}>
              {item.rotulo}
            </Text>
            <Text style={estilos.valorRanking}>
              {formatarValor(item.valor)}
              {item.detalhe ? ` · ${item.detalhe}` : ''}
            </Text>
          </View>

          <View style={estilos.trilho}>
            <View
              style={[
                estilos.preenchimento,
                {
                  width: `${Math.max((item.valor / maximo) * 100, 2)}%`,
                  backgroundColor: CORES_DE_SERIE[indice % CORES_DE_SERIE.length],
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Comparação entre períodos (Seção 10.2) — o número atual contra o período
 * anterior de mesma duração, com a variação percentual.
 */
export function ComparacaoDePeriodos({
  atual,
  anterior,
}: {
  atual: number;
  anterior: number;
}) {
  const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
  const subiu = (variacao ?? 0) >= 0;

  return (
    <View style={estilos.comparacao}>
      <View>
        <Text style={estilos.rotuloComparacao}>Período atual</Text>
        <Text style={estilos.valorComparacao}>{moeda(atual)}</Text>
      </View>

      <View style={estilos.alinhadoDireita}>
        <Text style={estilos.rotuloComparacao}>Período anterior</Text>
        <Text style={estilos.valorAnterior}>{moeda(anterior)}</Text>
        {variacao !== null ? (
          <Text style={[estilos.variacao, { color: subiu ? tema.cores.secundaria : tema.cores.negativo }]}>
            {subiu ? '▲' : '▼'} {Math.abs(variacao).toFixed(1)}%
          </Text>
        ) : (
          <Text style={estilos.rotuloComparacao}>sem base de comparação</Text>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  titulo: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  vazio: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  eixo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: tema.espacamento.xs },
  rotuloEixo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  linhaRanking: { marginBottom: tema.espacamento.md },
  cabecalhoRanking: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tema.espacamento.xs,
    gap: tema.espacamento.sm,
  },
  rotuloRanking: { ...tema.tipografia.corpo, color: tema.cores.texto, flex: 1 },
  valorRanking: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  trilho: {
    height: 8,
    borderRadius: 4,
    backgroundColor: tema.cores.fundo,
    overflow: 'hidden',
  },
  preenchimento: { height: 8, borderRadius: 4 },
  comparacao: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  alinhadoDireita: { alignItems: 'flex-end' },
  rotuloComparacao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  valorComparacao: { ...tema.tipografia.h1, color: tema.cores.primaria },
  valorAnterior: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  variacao: { ...tema.tipografia.legenda, marginTop: 2 },
});
