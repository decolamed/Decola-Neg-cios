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
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone, LadrilhoDeIcone, type NomeDeIcone } from '@/componentes/Icone';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  assinarInstalacao,
  comoInstalarAMao,
  estadoDaInstalacao,
  instalar,
  type EstadoDaInstalacao,
} from '@/lib/instalacao';

type Item = {
  titulo: string;
  descricao: string;
  destino?: string;
  icone: NomeDeIcone;
  cor: string;
  /** Itens de fases seguintes ficam visíveis, porém inativos. */
  disponivel: boolean;
};

export default function Configuracoes() {
  const { conta, carregando } = useSessao();

  /**
   * A instalação é uma AÇÃO, não um destino — por isso ela não entra na lista
   * acima, que navega. E ela precisa estar aqui, e não só no tutorial: quem
   * fechou o storyboard, ou quem hoje abriu o Decola noutro aparelho, não tem
   * por que rever sete etapas para pôr o ícone na tela inicial.
   */
  const [instalacao, setInstalacao] = useState<EstadoDaInstalacao>(estadoDaInstalacao);
  const [instalando, setInstalando] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  useEffect(() => assinarInstalacao(setInstalacao), []);

  const aoInstalar = useCallback(async () => {
    // Sem o convite do navegador não há o que chamar: o caminho é o menu dele.
    if (instalacao !== 'pronto') {
      setRecado(comoInstalarAMao());
      return;
    }
    setInstalando(true);
    try {
      const aceitou = await instalar();
      setRecado(
        aceitou
          ? null
          : 'A instalação não foi concluída. Você pode tentar de novo quando quiser.',
      );
    } finally {
      setInstalando(false);
    }
  }, [instalacao]);

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
      icone: 'produtos',
      cor: tema.cores.apoio,
      disponivel: true,
    },
    {
      titulo: 'Categorias',
      descricao: 'Organize seus produtos por categoria.',
      destino: '/configuracoes/categorias',
      icone: 'estoque',
      cor: tema.cores.secundaria,
      disponivel: true,
    },
    {
      titulo: 'Alertas de estoque',
      descricao: 'Defina em que percentual do estoque o alerta é disparado.',
      destino: '/configuracoes/alertas-estoque',
      icone: 'alerta',
      cor: tema.cores.negativo,
      disponivel: true,
    },
    {
      titulo: 'Dados da empresa e chave Pix',
      descricao: 'Nome, CNPJ, endereço, telefone e chave Pix para recebimentos.',
      destino: '/configuracoes/empresa',
      icone: 'financeiro',
      cor: tema.cores.primaria,
      disponivel: true,
    },
    /**
     * O horário fica ao lado da loja virtual, e não perdido no fim: é dela que
     * ele fala. Um pedido que entra fora do horário sem aviso é o cliente
     * achando que foi ignorado.
     */
    {
      titulo: 'Horário de funcionamento',
      descricao: 'Dias e horários em que você atende. Aparece na sua loja virtual.',
      destino: '/configuracoes/horario',
      icone: 'relatorios',
      cor: tema.cores.apoio,
      disponivel: true,
    },
    {
      titulo: 'Loja virtual',
      descricao: 'Publique seus produtos numa página pública e receba pedidos.',
      destino: '/configuracoes/loja',
      icone: 'vendas',
      cor: tema.cores.acaoPrimaria,
      disponivel: true,
    },
    {
      titulo: 'Aparência da loja',
      descricao: 'Nome, logo, cor e banners que seus clientes veem na vitrine.',
      destino: '/configuracoes/aparencia-da-loja',
      icone: 'produtos',
      cor: tema.cores.destaque,
      disponivel: true,
    },
    {
      titulo: 'Funcionários e permissões',
      descricao: 'Convide colaboradores e defina o que cada um pode fazer.',
      destino: '/funcionarios',
      icone: 'equipe',
      cor: tema.cores.destaque,
      disponivel: true,
    },
    {
      titulo: 'Plano e assinatura',
      descricao: 'Veja seu plano atual, o status da assinatura e troque de plano.',
      destino: '/perfil/plano',
      icone: 'plano',
      cor: tema.cores.secundaria,
      disponivel: true,
    },
    {
      titulo: 'Ver tutorial novamente',
      descricao: 'O passo a passo de boas-vindas, com tudo o que o aplicativo faz.',
      destino: '/tutorial?rever=1',
      icone: 'inicio',
      cor: tema.cores.primaria,
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
            <LadrilhoDeIcone nome={item.icone} cor={item.cor} />
            <View style={estilos.itemTexto}>
              <Text style={estilos.itemTitulo}>{item.titulo}</Text>
              <Text style={estilos.itemDescricao}>{item.descricao}</Text>
            </View>
            {item.disponivel ? (
              <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} />
            ) : null}
          </Pressable>
        ))}

        {Platform.OS === 'web' ? (
          <>
            <Pressable
              onPress={() => void aoInstalar()}
              disabled={instalando || instalacao === 'instalado'}
              style={({ pressed }) => [
                estilos.item,
                instalacao === 'instalado' && { opacity: tema.estados.disabledOpacidade },
                pressed && { opacity: 0.85 },
              ]}
            >
              <LadrilhoDeIcone nome="configuracoes" cor={tema.cores.apoio} />
              <View style={estilos.itemTexto}>
                <Text style={estilos.itemTitulo}>
                  {instalacao === 'instalado' ? 'Aplicativo instalado' : 'Instalar aplicativo'}
                </Text>
                <Text style={estilos.itemDescricao}>
                  {instalacao === 'instalado'
                    ? 'Você já está usando o Decola como aplicativo neste aparelho.'
                    : instalando
                      ? 'Aguardando a confirmação do navegador…'
                      : 'Ponha o Decola na tela inicial deste aparelho, com ícone próprio.'}
                </Text>
              </View>
              {instalacao !== 'instalado' ? (
                <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} />
              ) : null}
            </Pressable>

            {recado ? <Aviso mensagem={recado} tom="informacao" /> : null}
          </>
        ) : null}
      </ScrollView>
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
