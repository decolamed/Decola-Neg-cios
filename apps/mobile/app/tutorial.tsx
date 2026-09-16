/**
 * Boas-vindas — o storyboard que abre no primeiro acesso.
 *
 * POR QUE ELE EXISTE, e por que não é o roteiro de `/comecar`. São duas coisas
 * diferentes e as duas fazem falta:
 *
 *   `/comecar` ..... o que FALTA CONFIGURAR nesta loja (chave Pix, endereço da
 *                    vitrine). Lê dos dados, muda conforme a empresa, e manda
 *                    para as telas de verdade.
 *   este tutorial .. o que o aplicativo É. Onde fica cada coisa, o que cada aba
 *                    faz, como instalar o ícone no celular. Não depende de
 *                    dado nenhum e é igual para todo mundo.
 *
 * Misturar os dois daria uma tela que ensina e cobra ao mesmo tempo — e quem é
 * cobrado para de ler.
 *
 * UMA ETAPA POR VEZ, com índice, e não um carrossel que rola. Rolagem
 * horizontal dentro de uma página que também rola na vertical é o gesto que
 * some no celular; com botão, ninguém fica preso na primeira tela sem saber que
 * havia mais.
 *
 * ELE NÃO PRENDE NINGUÉM. "Pular" está visível desde a primeira etapa, e sair
 * marca como visto do mesmo jeito: um tutorial que reaparece porque a pessoa
 * não o terminou é um tutorial que ela vai aprender a fechar sem ler. Quem
 * quiser rever tem o item em Configurações.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { Icone, LadrilhoDeIcone, type NomeDeIcone } from '@/componentes/Icone';
import { Marca } from '@/componentes/Marca';
import { useSessao } from '@/contexto/SessaoContexto';
import { marcarTutorialVisto } from '@/dados/tutorial';
import {
  assinarInstalacao,
  comoInstalarAMao,
  estadoDaInstalacao,
  instalar,
  type EstadoDaInstalacao,
} from '@/lib/instalacao';

type Etapa = {
  icone: NomeDeIcone;
  cor: string;
  titulo: string;
  texto: string;
  /** O que a pessoa vai encontrar naquela parte, em frases curtas. */
  itens: string[];
  /** A etapa da instalação tem conteúdo próprio. */
  instalar?: true;
};

const ETAPAS: Etapa[] = [
  {
    icone: 'inicio',
    cor: tema.cores.primaria,
    titulo: 'Bem-vindo ao Decola Negócios',
    texto:
      'Tudo o que a sua loja precisa num lugar só: vender, controlar o estoque, acompanhar o ' +
      'dinheiro e receber pedidos pela internet.',
    itens: [
      'A barra de baixo leva às quatro áreas principais',
      'O botão do meio abre a venda rápida',
      'Este tutorial leva menos de um minuto',
    ],
  },
  {
    icone: 'vendas',
    cor: tema.cores.secundaria,
    titulo: 'Vender é o botão do meio',
    texto:
      'Toque no botão central da barra de baixo para registrar uma venda. Busque pelo nome, ' +
      'bipe o código de barras, escolha a forma de pagamento e pronto.',
    itens: [
      'O estoque baixa sozinho a cada venda',
      'A entrada no financeiro é criada junto',
      'Venda cancelada vira estorno, e nada some do histórico',
    ],
  },
  {
    icone: 'produtos',
    cor: tema.cores.apoio,
    titulo: 'Produtos e estoque',
    texto:
      'Cadastre uma vez e use em todo lugar. O código de barras já traz nome, foto e descrição ' +
      'quando o produto é conhecido — o preço é sempre seu.',
    itens: [
      'Cadastrar vários seguidos, com o leitor na mão',
      'Aviso automático quando o estoque fica baixo',
      'Produto nunca é apagado de verdade: fica arquivado',
    ],
  },
  {
    icone: 'financeiro',
    cor: tema.cores.positivo,
    titulo: 'O dinheiro da loja',
    texto:
      'Entradas e saídas em um extrato só. As vendas entram sozinhas; o que você paga (aluguel, ' +
      'fornecedor, luz) você lança à mão.',
    itens: [
      'Saldo do dia, da semana e do mês',
      'Relatórios com exportação',
      'Cada lançamento diz de onde veio',
    ],
  },
  {
    icone: 'estoque',
    cor: tema.cores.destaque,
    titulo: 'Sua loja na internet',
    texto:
      'Você ganha um endereço próprio para mandar no WhatsApp. O cliente escolhe, monta o ' +
      'carrinho e o pedido chega aqui dentro.',
    itens: [
      'Cores, banner e horário de funcionamento são seus',
      'Pedido novo avisa na hora',
      'O estoque da loja e o do balcão são o mesmo',
    ],
  },
  {
    icone: 'equipe',
    cor: tema.cores.primaria,
    titulo: 'Equipe e ajustes',
    texto:
      'Convide funcionários por e-mail e escolha o que cada um pode fazer. Tudo o mais fica em ' +
      'Configurações, no menu.',
    itens: [
      'Permissão por pessoa, não por senha compartilhada',
      'Dados da empresa, chave Pix e aparência da loja',
      'Este tutorial pode ser reaberto por lá quando quiser',
    ],
  },
  {
    icone: 'configuracoes',
    cor: tema.cores.apoio,
    titulo: 'Instale na tela inicial',
    texto:
      'O Decola Negócios abre no navegador — não precisa baixar de loja nenhuma. Instalando, ' +
      'ele ganha ícone próprio e abre em tela cheia, como qualquer aplicativo.',
    itens: [
      'Abre mais rápido, sem digitar endereço',
      'Ocupa quase nada no aparelho',
      'Pode instalar em quantos aparelhos quiser',
    ],
    instalar: true,
  },
];

export default function Tutorial() {
  const { conta } = useSessao();
  /** `?rever=1` — veio de Configurações, e o fim volta para lá. */
  const { rever } = useLocalSearchParams<{ rever?: string }>();

  const [indice, setIndice] = useState(0);
  const [instalacao, setInstalacao] = useState<EstadoDaInstalacao>(estadoDaInstalacao);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => assinarInstalacao(setInstalacao), []);

  const etapa = ETAPAS[indice];
  const ultima = indice === ETAPAS.length - 1;

  /**
   * Sair marca como visto, tanto no fim quanto no "Pular".
   *
   * Não distinguir os dois é deliberado: quem pulou decidiu que não queria, e
   * reapresentar amanhã transforma a decisão dela numa pergunta repetida.
   */
  const sair = useCallback(async () => {
    if (conta?.vinculo.usuario_id) {
      await marcarTutorialVisto(conta.vinculo.usuario_id);
    }
    if (rever === '1') router.back();
    else router.replace('/dashboard');
  }, [conta, rever]);

  const aoInstalar = useCallback(async () => {
    setInstalando(true);
    try {
      await instalar();
    } finally {
      setInstalando(false);
    }
  }, []);

  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.topo}>
        <Marca comTagline={false} tamanho="md" />
        <Pressable onPress={() => void sair()} accessibilityRole="button">
          <Text style={estilos.pular}>{ultima ? 'Fechar' : 'Pular'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={estilos.conteudo}>
        <View style={estilos.ilustracao}>
          <LadrilhoDeIcone nome={etapa.icone} cor={etapa.cor} tamanho={96} />
        </View>

        <Text style={estilos.titulo}>{etapa.titulo}</Text>
        <Text style={estilos.texto}>{etapa.texto}</Text>

        <View style={estilos.lista}>
          {etapa.itens.map((item) => (
            <View key={item} style={estilos.item}>
              <View style={[estilos.marcador, { backgroundColor: etapa.cor }]} />
              <Text style={estilos.itemTexto}>{item}</Text>
            </View>
          ))}
        </View>

        {etapa.instalar ? <EtapaDeInstalacao
          estado={instalacao}
          instalando={instalando}
          aoInstalar={() => void aoInstalar()}
        /> : null}
      </ScrollView>

      <View style={estilos.rodape}>
        {/* Os pontos dizem quanto falta. Sem eles, "Próximo" é um poço sem
            fundo e a pessoa desiste no terceiro toque. */}
        <View style={estilos.pontos}>
          {ETAPAS.map((e, i) => (
            <View
              key={e.titulo}
              style={[
                estilos.ponto,
                i === indice && { backgroundColor: tema.cores.primaria, width: 20 },
              ]}
            />
          ))}
        </View>

        <View style={estilos.botoes}>
          {indice > 0 ? (
            <Pressable
              onPress={() => setIndice((n) => n - 1)}
              style={estilos.voltar}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
            >
              <Icone nome="voltar" cor={tema.cores.primaria} tamanho={20} />
            </Pressable>
          ) : null}

          <Botao
            titulo={ultima ? 'Começar a usar' : 'Próximo'}
            aoPressionar={() => (ultima ? void sair() : setIndice((n) => n + 1))}
            estilo={{ flex: 1 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * O bloco de instalar, que muda conforme o que o navegador permite.
 *
 * NÃO MOSTRA BOTÃO QUE NÃO FUNCIONA. No iPhone o Safari não oferece o convite
 * de instalação a ninguém — a única coisa honesta a fazer ali é ensinar o
 * caminho do menu. Um botão "Instalar" que não instala é pior que o texto.
 */
function EtapaDeInstalacao({
  estado,
  instalando,
  aoInstalar,
}: {
  estado: EstadoDaInstalacao;
  instalando: boolean;
  aoInstalar: () => void;
}) {
  if (Platform.OS !== 'web') return null;

  if (estado === 'instalado') {
    return (
      <View style={[estilos.caixa, { backgroundColor: tema.tons.secundaria }]}>
        <Text style={estilos.caixaTitulo}>Já está instalado</Text>
        <Text style={estilos.caixaTexto}>
          Você já está usando o Decola Negócios como aplicativo neste aparelho.
        </Text>
      </View>
    );
  }

  if (estado === 'manual') {
    return (
      <View style={[estilos.caixa, { backgroundColor: tema.tons.destaque }]}>
        <Text style={estilos.caixaTitulo}>Como instalar neste aparelho</Text>
        <Text style={estilos.caixaTexto}>{comoInstalarAMao()}</Text>
      </View>
    );
  }

  return (
    <Botao
      titulo={instalando ? 'Instalando…' : 'Instalar aplicativo'}
      variante="secundario"
      aoPressionar={aoInstalar}
      desabilitado={instalando}
      estilo={{ marginTop: tema.espacamento.md }}
    />
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tema.espacamento.lg,
    paddingTop: tema.espacamento.md,
  },
  pular: { ...tema.tipografia.corpoDestacado, color: tema.cores.textoSuave },

  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  ilustracao: { alignItems: 'center', marginVertical: tema.espacamento.xl },

  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, textAlign: 'center' },
  texto: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.sm,
  },

  lista: { marginTop: tema.espacamento.lg, gap: tema.espacamento.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: tema.espacamento.sm },
  marcador: { width: 7, height: 7, borderRadius: 4, marginTop: 7 },
  itemTexto: { ...tema.tipografia.corpo, color: tema.cores.texto, flex: 1 },

  caixa: {
    marginTop: tema.espacamento.lg,
    padding: tema.espacamento.md,
    borderRadius: tema.raio.md,
    gap: tema.espacamento.xs,
  },
  caixaTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  caixaTexto: { ...tema.tipografia.legenda, color: tema.cores.texto },

  rodape: {
    paddingHorizontal: tema.espacamento.lg,
    paddingBottom: tema.espacamento.lg,
    gap: tema.espacamento.md,
  },
  pontos: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  ponto: { width: 7, height: 7, borderRadius: 4, backgroundColor: tema.cores.borda },
  botoes: { flexDirection: 'row', alignItems: 'center', gap: tema.espacamento.sm },
  voltar: {
    width: 48,
    height: 48,
    borderRadius: tema.raio.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tema.cores.borda,
    backgroundColor: tema.cores.superficie,
  },
});
