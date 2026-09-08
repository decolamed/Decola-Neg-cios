/**
 * Badge de status de estoque — Seções 2.3 e 8.3.
 * O status é sempre o valor computado pelo banco, nunca recalculado no app.
 */
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import type { StatusEstoque } from '@/dados/produtos';

const APARENCIA: Record<StatusEstoque, { rotulo: string; cor: string }> = {
  // Seção 2.1 — vermelho para indicadores negativos, amarelo para neutros.
  esgotado: { rotulo: 'Esgotado', cor: tema.cores.negativo },
  estoque_baixo: { rotulo: 'Estoque baixo', cor: tema.cores.alerta },
  disponivel: { rotulo: 'Disponível', cor: tema.cores.secundaria },
};

export function BadgeStatus({ status }: { status: StatusEstoque }) {
  /**
   * A reserva não é zelo excessivo — é o raio de alcance.
   *
   * Este badge aparece na LISTA de produtos, na tela de estoque baixo e no
   * detalhe do produto. Desestruturar direto de `APARENCIA[status]` significa
   * que um único valor inesperado (uma situação nova no banco, uma linha
   * estranha) não estraga um badge: derruba as três telas inteiras, e o
   * lojista fica sem o catálogo.
   *
   * Mostrar o valor cru é feio e é de propósito: é honesto, cabe na tela e diz
   * a quem for consertar exatamente o que apareceu.
   */
  const aparencia = APARENCIA[status] ?? { rotulo: String(status), cor: tema.cores.textoSuave };
  return <Badge rotulo={aparencia.rotulo} cor={aparencia.cor} />;
}

/**
 * Badge genérico com a mesma aparência — para status que não vêm de
 * `StatusEstoque` (ex.: situação da venda). Só rótulo e cor: nenhuma regra.
 */
export function Badge({ rotulo, cor }: { rotulo: string; cor: string }) {
  return (
    <View style={[estilos.badge, { backgroundColor: tema.clarear(cor) }]}>
      <View style={[estilos.bolinha, { backgroundColor: cor }]} />
      <Text style={[estilos.texto, { color: tema.escurecer(cor, 0.18) }]}>{rotulo}</Text>
    </View>
  );
}

export function BadgeArquivado() {
  return (
    <View style={[estilos.badge, { backgroundColor: tema.cores.fundo }]}>
      <Text style={[estilos.texto, { color: tema.cores.textoSuave }]}>Arquivado</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.sm + 2,
    paddingVertical: 4,
  },
  bolinha: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  texto: tema.tipografia.rotulo,
});
