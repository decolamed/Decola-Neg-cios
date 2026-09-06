/**
 * Menu "Mais" — Seção 7.1.
 *
 * "Abre menu com acesso a: Produtos (Estoque), Funcionários, Configurações,
 *  Perfil."
 *
 * Relatórios entra junto porque a Seção 10.2 lhe dá tela própria e o menu
 * inferior não tem espaço para um sexto item — sem isso a tela ficaria sem
 * porta de entrada. Cada item respeita a permissão da Seção 5.3.
 */
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone, LadrilhoDeIcone, type NomeDeIcone } from '@/componentes/Icone';
import { MenuInferior } from '@/componentes/MenuInferior';
import { useSessao } from '@/contexto/SessaoContexto';

export default function Mais() {
  const { carregando, conta, temPermissao } = useSessao();

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar seu menu." />;

  const itens: {
    titulo: string;
    descricao: string;
    destino: string;
    icone: NomeDeIcone;
    cor: string;
  }[] = [
    {
      titulo: 'Produtos e estoque',
      descricao: 'Cadastro, reposição e ciclo de vida dos produtos.',
      destino: '/produtos',
      icone: 'produtos',
      cor: tema.cores.apoio,
    },
    {
      titulo: 'Estoque baixo',
      descricao: 'Produtos que atingiram o alerta configurado.',
      destino: '/estoque-baixo',
      icone: 'alerta',
      cor: tema.cores.negativo,
    },
  ];

  // Atender pedido é ação de Gestor: as quatro RPCs (confirmar pagamento,
  // avançar, cancelar, finalizar) exigem `pode_escrever_como_gestor`. Mostrar
  // a tela a quem só conseguiria ler seria oferecer botões que o banco recusa.
  if (conta.ehGestor) {
    itens.push({
      titulo: 'Pedidos da loja',
      descricao: 'Solicitações que chegaram pela sua loja virtual.',
      destino: '/pedidos',
      icone: 'vendas',
      cor: tema.cores.acaoPrimaria,
    });
  }

  if (temPermissao('exportar_relatorios')) {
    itens.push({
      titulo: 'Relatórios',
      descricao: 'Gráficos de vendas e exportação em PDF ou Excel.',
      destino: '/relatorios',
      icone: 'relatorios',
      cor: tema.cores.secundaria,
    });
  }

  if (conta.ehGestor) {
    itens.push(
      {
        titulo: 'Funcionários',
        descricao: 'Convites, papéis e permissões da equipe.',
        destino: '/funcionarios',
        icone: 'equipe',
        cor: tema.cores.primaria,
      },
      {
        titulo: 'Configurações',
        descricao: 'Dados da empresa, chave Pix, categorias e alertas.',
        destino: '/configuracoes',
        icone: 'configuracoes',
        cor: tema.cores.destaque,
      },
    );
  }

  itens.push({
    titulo: 'Perfil',
    descricao: 'Sua conta, plano, notificações e senha.',
    destino: '/perfil',
    icone: 'perfil',
    cor: tema.cores.secundaria,
  });

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Mais</Text>

        {itens.map((item) => (
          <Pressable
            key={item.titulo}
            onPress={() => router.push(item.destino)}
            style={({ pressed }) => [estilos.item, pressed && { opacity: 0.85 }]}
          >
            <LadrilhoDeIcone nome={item.icone} cor={item.cor} />
            <View style={estilos.itemTexto}>
              <Text style={estilos.itemTitulo}>{item.titulo}</Text>
              <Text style={estilos.itemDescricao}>{item.descricao}</Text>
            </View>
            <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} />
          </Pressable>
        ))}
      </ScrollView>

      <MenuInferior />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemTexto: { flex: 1 },
  itemTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemDescricao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
});
