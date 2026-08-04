/**
 * Preferências de notificação — Seção 7.14, botão "Notificações".
 *
 * "liga/desliga por categoria (estoque baixo, avisos de assinatura, avisos
 * administrativos)". Acessível a qualquer usuário autenticado: a preferência
 * é da própria conta, não da empresa.
 *
 * O que se desliga aqui é o PUSH, que a Seção 7.14 define como
 * "complementar/best-effort". O registro persistido continua sendo criado e
 * segue aparecendo no sino do Dashboard — é a fonte confiável.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  CATEGORIAS_NOTIFICACAO,
  carregarPreferencias,
  PREFERENCIAS_PADRAO,
  salvarPreferencias,
  type CategoriaNotificacao,
} from '@/dados/preferencias';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto' }
  | { nome: 'erro'; mensagem: string };

export default function PreferenciasDeNotificacao() {
  const { conta } = useSessao();
  const usuarioId = conta?.vinculo.usuario_id ?? null;

  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [preferencias, setPreferencias] =
    useState<Record<CategoriaNotificacao, boolean>>(PREFERENCIAS_PADRAO);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'erro' | 'sucesso' } | null>(null);

  const carregar = useCallback(async () => {
    if (!usuarioId) return;
    setEstado({ nome: 'carregando' });
    try {
      setPreferencias(await carregarPreferencias(usuarioId));
      setEstado({ nome: 'pronto' });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem:
          e instanceof Error ? e.message : 'Não foi possível carregar suas preferências.',
      });
    }
  }, [usuarioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!usuarioId) {
    return <TelaMensagem mensagem="Não foi possível identificar sua conta." />;
  }

  if (estado.nome === 'carregando') return <TelaCarregando />;

  if (estado.nome === 'erro') {
    return <TelaMensagem mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const alternar = async (chave: CategoriaNotificacao, ligado: boolean) => {
    const anterior = preferencias;
    const novas = { ...preferencias, [chave]: ligado };

    // Otimista no visual, mas revertido se a escrita falhar — a Seção 3.5 não
    // tolera fingir que salvou sem conexão.
    setPreferencias(novas);
    setAviso(null);

    try {
      await salvarPreferencias(usuarioId, novas);
      setAviso({ texto: 'Preferências salvas.', tom: 'sucesso' });
    } catch (e) {
      setPreferencias(anterior);
      setAviso({
        texto: e instanceof Error ? e.message : 'Não foi possível salvar suas preferências.',
        tom: 'erro',
      });
    }
  };

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Notificações</Text>
        <Text style={estilos.descricao}>
          Escolha sobre o que você quer ser avisado no aparelho. Os avisos continuam registrados
          no app mesmo com o envio desligado.
        </Text>

        {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}

        {CATEGORIAS_NOTIFICACAO.map((categoria) => (
          <View key={categoria.chave} style={estilos.item}>
            <View style={estilos.itemTexto}>
              <Text style={estilos.itemTitulo}>{categoria.rotulo}</Text>
              <Text style={estilos.itemDescricao}>{categoria.descricao}</Text>
            </View>
            <Switch
              value={preferencias[categoria.chave]}
              onValueChange={(ligado) => void alternar(categoria.chave, ligado)}
              trackColor={{ true: tema.cores.primaria, false: tema.cores.borda }}
              accessibilityLabel={categoria.rotulo}
            />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  itemTexto: { flex: 1, marginRight: tema.espacamento.sm },
  itemTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  itemDescricao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
});
