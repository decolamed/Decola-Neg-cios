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
  const { rotulo, cor } = APARENCIA[status];
  return <Badge rotulo={rotulo} cor={cor} />;
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
