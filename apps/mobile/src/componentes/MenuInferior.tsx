/**
 * Navegação Global — Menu Inferior (Seção 7.1).
 *
 * Cinco itens, exatamente os da especificação: Início, Vendas, o botão +
 * central que abre Nova Venda, Financeiro e Mais.
 *
 * "Financeiro" só aparece com `visualizar_financeiro` — esconder aqui é
 * conveniência; a tela e a RLS recusam de qualquer forma (Seção 9.1).
 */
import { usePathname, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Icone, type NomeDeIcone } from '@/componentes/Icone';
import { useSessao } from '@/contexto/SessaoContexto';

type Item = {
  rotulo: string;
  destino: string;
  icone: NomeDeIcone;
  /** Prefixos de rota que deixam este item em destaque. */
  ativoEm: string[];
};

export function MenuInferior() {
  const caminho = usePathname();
  const { temPermissao } = useSessao();
  const margens = useSafeAreaInsets();

  const itens: Item[] = [
    { rotulo: 'Início', destino: '/dashboard', icone: 'inicio', ativoEm: ['/dashboard'] },
    { rotulo: 'Vendas', destino: '/vendas', icone: 'vendas', ativoEm: ['/vendas'] },
  ];

  const itensDireita: Item[] = [];
  if (temPermissao('visualizar_financeiro')) {
    itensDireita.push({
      rotulo: 'Financeiro',
      destino: '/financeiro',
      icone: 'financeiro',
      ativoEm: ['/financeiro'],
    });
  }
  itensDireita.push({
    rotulo: 'Mais',
    destino: '/mais',
    icone: 'menu',
    ativoEm: ['/mais', '/produtos', '/funcionarios', '/configuracoes', '/perfil', '/relatorios'],
  });

  const estaAtivo = (item: Item) =>
    item.ativoEm.some((prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`));

  return (
    <View style={[estilos.barra, { paddingBottom: Math.max(margens.bottom, tema.espacamento.sm) }]}>
      {itens.map((item) => (
        <ItemDoMenu key={item.rotulo} item={item} ativo={estaAtivo(item)} />
      ))}

      {/* Botão + central — Seção 7.1: abre a tela Nova Venda. */}
      <Pressable
        onPress={() => router.push('/vendas/nova')}
        accessibilityRole="button"
        accessibilityLabel="Nova venda"
        style={({ pressed }) => [estilos.botaoCentral, pressed && { opacity: 0.85 }]}
      >
        <Icone nome="mais" cor={tema.cores.textoSobreAcao} tamanho={26} />
      </Pressable>

      {itensDireita.map((item) => (
        <ItemDoMenu key={item.rotulo} item={item} ativo={estaAtivo(item)} />
      ))}
    </View>
  );
}

function ItemDoMenu({ item, ativo }: { item: Item; ativo: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(item.destino)}
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
      style={({ pressed }) => [estilos.item, pressed && { opacity: 0.7 }]}
    >
      <Icone
        nome={item.icone}
        cor={ativo ? tema.cores.primaria : tema.cores.textoSuave}
        tamanho={22}
      />
      <Text style={[estilos.rotulo, ativo && estilos.rotuloAtivo]}>{item.rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: tema.cores.superficie,
    borderTopWidth: 1,
    borderTopColor: tema.cores.bordaSuave,
    paddingTop: tema.espacamento.sm,
    paddingHorizontal: tema.espacamento.sm,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: tema.espacamento.xs,
  },
  rotulo: { ...tema.tipografia.micro, fontWeight: '400', color: tema.cores.textoSuave },
  rotuloAtivo: { ...tema.tipografia.micro, color: tema.cores.primaria },
  botaoCentral: {
    width: 56,
    height: 56,
    borderRadius: tema.raio.pill,
    backgroundColor: tema.cores.acaoPrimaria,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: tema.espacamento.sm,
    marginTop: -22,
    borderWidth: 4,
    borderColor: tema.cores.superficie,
    ...tema.elevacao.flutuante,
  },
});
