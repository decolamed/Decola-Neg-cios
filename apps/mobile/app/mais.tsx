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
import { MenuInferior } from '@/componentes/MenuInferior';
import { useSessao } from '@/contexto/SessaoContexto';

export default function Mais() {
  const { carregando, conta, temPermissao } = useSessao();

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar seu menu." />;

  const itens: { titulo: string; descricao: string; destino: string }[] = [
    {
      titulo: 'Produtos e estoque',
      descricao: 'Cadastro, reposição e ciclo de vida dos produtos.',
      destino: '/produtos',
    },
    {
      titulo: 'Estoque baixo',
      descricao: 'Produtos que atingiram o alerta configurado.',
      destino: '/estoque-baixo',
    },
  ];

  if (temPermissao('exportar_relatorios')) {
    itens.push({
      titulo: 'Relatórios',
      descricao: 'Gráficos de vendas e exportação em PDF ou Excel.',
      destino: '/relatorios',
    });
  }

  if (conta.ehGestor) {
    itens.push(
      {
        titulo: 'Funcionários',
        descricao: 'Convites, papéis e permissões da equipe.',
        destino: '/funcionarios',
      },
      {
        titulo: 'Configurações',
        descricao: 'Dados da empresa, chave Pix, categorias e alertas.',
        destino: '/configuracoes',
      },
    );
  }

  itens.push({
    titulo: 'Perfil',
    descricao: 'Sua conta, plano, notificações e senha.',
    destino: '/perfil',
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
            <View style={estilos.itemTexto}>
              <Text style={estilos.itemTitulo}>{item.titulo}</Text>
              <Text style={estilos.itemDescricao}>{item.descricao}</Text>
            </View>
            <Text style={estilos.seta}>›</Text>
          </Pressable>
        ))}
      </ScrollView>

      <MenuInferior />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemTexto: { flex: 1 },
  itemTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemDescricao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  seta: { ...tema.tipografia.h2, color: tema.cores.textoSuave, marginLeft: tema.espacamento.sm },
});
