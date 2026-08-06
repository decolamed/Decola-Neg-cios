/**
 * Tela Perfil — Seção 7.14.
 *
 * Índice das ações de conta: Meu plano, Notificações, Ajuda e suporte,
 * Alterar senha e Sair da conta. Todas disponíveis a qualquer usuário
 * autenticado; o que muda entre papéis é o que cada sub-tela permite fazer
 * (ver "Meu plano", que é leitura para o Funcionário).
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone, LadrilhoDeIcone, type NomeDeIcone } from '@/componentes/Icone';
import { AssinaturaDecola } from '@/componentes/Marca';
import { useSessao } from '@/contexto/SessaoContexto';
import { ROTULO_PAPEL } from '@/dados/funcionarios';
import { EMAIL_SUPORTE } from '@/dados/planos';

type Item = {
  titulo: string;
  descricao: string;
  aoTocar: () => void;
  icone: NomeDeIcone;
  cor: string;
  /** Destaca a ação como destrutiva (apenas aparência). */
  destrutiva?: boolean;
};

/** Iniciais para o avatar: a Seção 7.14 pede "avatar/inicial". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 1).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export default function Perfil() {
  const { carregando, conta, sessao, erro, recarregar, sair } = useSessao();
  const [avisoSuporte, setAvisoSuporte] = useState<string | null>(null);

  if (carregando) return <TelaCarregando />;

  if (erro || !conta) {
    return (
      <TelaMensagem
        mensagem={erro ?? 'Não foi possível carregar seu perfil.'}
        aoTentarNovamente={recarregar}
      />
    );
  }

  // Depois do aceite vale o nome real da conta; antes, o que o Gestor digitou
  // no convite (mesma regra da lista de Funcionários, Seção 5.2).
  const nome = conta.usuario?.nome || conta.vinculo.nome_convite || 'Você';
  const email = conta.usuario?.email || sessao?.user.email || conta.vinculo.email_convite;

  const confirmarSaida = () => {
    // Seção 7.14 — "Exibe confirmação ('Tem certeza que deseja sair?')".
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await sair();
          router.replace('/login');
        },
      },
    ]);
  };

  const abrirSuporte = async () => {
    // Seção 7.14 — canal de suporte da V1 é e-mail (`mailto:`).
    const url = `mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(
      `Ajuda — ${conta.empresa.nome}`,
    )}`;

    try {
      await Linking.openURL(url);
    } catch {
      setAvisoSuporte(
        `Não foi possível abrir seu aplicativo de e-mail. Escreva para ${EMAIL_SUPORTE}.`,
      );
    }
  };

  const itens: Item[] = [
    {
      titulo: 'Meu plano',
      descricao: 'Plano atual, status da assinatura e cobranças.',
      aoTocar: () => router.push('/perfil/plano'),
      icone: 'plano',
      cor: tema.cores.secundaria,
    },
    {
      titulo: 'Notificações',
      descricao: 'Escolha sobre o que você quer ser avisado.',
      aoTocar: () => router.push('/perfil/notificacoes'),
      icone: 'sino',
      cor: tema.cores.apoio,
    },
    {
      titulo: 'Ajuda e suporte',
      descricao: `Fale com a gente por e-mail: ${EMAIL_SUPORTE}`,
      aoTocar: abrirSuporte,
      icone: 'perfil',
      cor: tema.cores.primaria,
    },
    {
      titulo: 'Alterar senha',
      descricao: 'Trocar a senha de acesso da sua conta.',
      aoTocar: () => router.push('/perfil/alterar-senha'),
      icone: 'senha',
      cor: tema.cores.destaque,
    },
    {
      titulo: 'Sair da conta',
      descricao: 'Encerra a sessão neste aparelho.',
      aoTocar: confirmarSaida,
      icone: 'sair',
      cor: tema.cores.destrutiva,
      destrutiva: true,
    },
  ];

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <View style={estilos.cabecalho}>
          <View style={estilos.avatar}>
            <Text style={estilos.iniciais}>{iniciais(nome)}</Text>
          </View>
          <Text style={estilos.nome}>{nome}</Text>
          <Text style={estilos.detalhe}>{email}</Text>
          <Text style={estilos.detalhe}>
            {ROTULO_PAPEL[conta.vinculo.papel]} · {conta.empresa.nome}
          </Text>
        </View>

        {avisoSuporte ? <Aviso mensagem={avisoSuporte} tom="alerta" /> : null}

        {itens.map((item) => (
          <Pressable
            key={item.titulo}
            onPress={item.aoTocar}
            style={({ pressed }) => [estilos.item, pressed && { opacity: 0.85 }]}
          >
            <LadrilhoDeIcone nome={item.icone} cor={item.cor} />
            <View style={estilos.itemTexto}>
              <Text style={[estilos.itemTitulo, item.destrutiva && estilos.itemTituloDestrutivo]}>
                {item.titulo}
              </Text>
              <Text style={estilos.itemDescricao}>{item.descricao}</Text>
            </View>
            <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} />
          </Pressable>
        ))}

        <View style={estilos.rodape}>
          <AssinaturaDecola escura />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  cabecalho: {
    alignItems: 'center',
    marginBottom: tema.espacamento.lg,
    paddingVertical: tema.espacamento.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tema.cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  iniciais: { ...tema.tipografia.h1, color: tema.cores.destaque },
  nome: { ...tema.tipografia.h2, color: tema.cores.texto },
  detalhe: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
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
  itemTituloDestrutivo: { color: tema.cores.destrutiva },
  itemDescricao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  rodape: { marginTop: tema.espacamento.xl },
});
