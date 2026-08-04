/**
 * Tela Configurações — Seção 7.9.
 *
 * Funciona como índice de navegação; cada área é detalhada na seção cruzada
 * correspondente. Os itens de fases futuras aparecem desabilitados em vez de
 * ocultos, para o Gestor saber o que existe.
 *
 * "Backup e sincronização" NÃO aparece: foi removido da V1 por redundância com
 * a nuvem (Seção 7.9).
 */
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';

type Item = {
  titulo: string;
  descricao: string;
  destino?: string;
  /** Itens de fases seguintes ficam visíveis, porém inativos. */
  disponivel: boolean;
};

export default function Configuracoes() {
  const { conta, carregando } = useSessao();

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar suas configurações." />;

  // Seção 5.3 — configurar a empresa é ação exclusiva do papel Gestor.
  if (!conta.ehGestor) {
    return (
      <TelaMensagem mensagem="As configurações da empresa são acessíveis apenas ao Gestor." />
    );
  }

  const itens: Item[] = [
    {
      titulo: 'Cadastro de produtos',
      descricao: 'Escolha quais campos aparecem no cadastro e crie campos próprios.',
      destino: '/configuracoes/campos-produto',
      disponivel: true,
    },
    {
      titulo: 'Categorias',
      descricao: 'Organize seus produtos por categoria.',
      destino: '/configuracoes/categorias',
      disponivel: true,
    },
    {
      titulo: 'Alertas de estoque',
      descricao: 'Defina em que percentual do estoque o alerta é disparado.',
      destino: '/configuracoes/alertas-estoque',
      disponivel: true,
    },
    {
      titulo: 'Dados da empresa e chave Pix',
      descricao: 'Nome, CNPJ, endereço, telefone e chave Pix para recebimentos.',
      disponivel: false,
    },
    {
      titulo: 'Funcionários e permissões',
      descricao: 'Convide colaboradores e defina o que cada um pode fazer.',
      destino: '/funcionarios',
      disponivel: true,
    },
    {
      titulo: 'Plano e assinatura',
      descricao: 'Veja seu plano atual, o status da assinatura e troque de plano.',
      destino: '/perfil/plano',
      disponivel: true,
    },
  ];

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Configurações</Text>

        {itens.map((item) => (
          <Pressable
            key={item.titulo}
            disabled={!item.disponivel}
            onPress={() => item.destino && router.push(item.destino)}
            style={({ pressed }) => [
              estilos.item,
              !item.disponivel && { opacity: tema.estados.disabledOpacidade },
              pressed && item.disponivel && { opacity: 0.85 },
            ]}
          >
            <View style={estilos.itemTexto}>
              <Text style={estilos.itemTitulo}>{item.titulo}</Text>
              <Text style={estilos.itemDescricao}>{item.descricao}</Text>
            </View>
            {item.disponivel ? <Text style={estilos.seta}>›</Text> : null}
          </Pressable>
        ))}
      </ScrollView>
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
