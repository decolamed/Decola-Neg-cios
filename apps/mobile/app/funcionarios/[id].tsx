/**
 * Detalhes do funcionário — Seções 5.3, 5.6, 7.8.
 *
 * "Alterar permissão: promove Funcionário → Gestor, ou libera/revoga
 * permissões específicas; reflete em tempo real no dispositivo do usuário
 * afetado. Remover acesso: desativa o usuário, mantendo todo o histórico."
 *
 * O Gestor tem todas as permissões por definição do papel, então os
 * interruptores individuais só aparecem para Funcionário.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChavePermissao, MapaPermissoes } from '@decola/types';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  alterarPapel,
  buscarFuncionario,
  definirPermissoes,
  enviarEmailDeConvite,
  PERMISSOES_CONCEDIVEIS,
  reenviarConvite,
  removerFuncionario,
  ROTULO_PAPEL,
  type Funcionario,
} from '@/dados/funcionarios';

export default function DetalhesDoFuncionario() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conta, podeEscrever } = useSessao();

  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [permissoes, setPermissoes] = useState<MapaPermissoes>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const encontrado = await buscarFuncionario(id);
      setFuncionario(encontrado);
      setPermissoes(encontrado?.permissoes ?? {});
      setErro(encontrado ? null : 'Funcionário não encontrado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o funcionário.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = useCallback(
    async (acao: () => Promise<void>, textoSucesso: string) => {
      setProcessando(true);
      setMensagem(null);
      setSucesso(null);
      try {
        await acao();
        await carregar();
        setSucesso(textoSucesso);
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
      } finally {
        setProcessando(false);
      }
    },
    [carregar],
  );

  const alternarPermissao = useCallback(
    (chave: ChavePermissao, valor: boolean) => {
      if (!funcionario) return;
      const proximas = { ...permissoes, [chave]: valor };
      setPermissoes(proximas);
      void executar(
        () => definirPermissoes(funcionario.id, proximas),
        'Permissões atualizadas. A mudança já valeu no dispositivo dele.',
      );
    },
    [funcionario, permissoes, executar],
  );

  if (carregando) return <TelaCarregando />;
  if (erro || !funcionario || !conta) {
    return <TelaMensagem mensagem={erro ?? 'Funcionário não encontrado.'} aoTentarNovamente={carregar} />;
  }

  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="A gestão de funcionários é exclusiva do Gestor." />;
  }

  const ehEuMesmo = funcionario.usuario_id === conta.vinculo.usuario_id;
  const ehGestorPrincipal = funcionario.papel === 'gestor_principal';
  const bloqueado = processando || !podeEscrever;

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.nome}>{funcionario.nome}</Text>
        <Text style={estilos.email}>{funcionario.email}</Text>
        <Text style={estilos.papel}>{ROTULO_PAPEL[funcionario.papel]}</Text>

        {sucesso ? <Aviso tom="sucesso" mensagem={sucesso} /> : null}
        {mensagem ? <Aviso mensagem={mensagem} /> : null}

        {!podeEscrever ? (
          <Aviso tom="alerta" mensagem="Sua conta está em modo de consulta. As alterações estão bloqueadas." />
        ) : null}

        {/* Seção 4.3 — o Gestor Principal é imutável. */}
        {ehGestorPrincipal ? (
          <Aviso
            tom="informacao"
            mensagem="O Gestor Principal foi definido na criação da empresa e não pode ser rebaixado nem removido."
          />
        ) : null}

        {/* Convite pendente — Seção 5.2 */}
        {funcionario.status === 'convidado' ? (
          <View style={estilos.card}>
            <Text style={estilos.tituloCard}>Convite pendente</Text>
            <Text style={estilos.detalhe}>
              {funcionario.convite_expirado
                ? 'O convite expirou. Reenvie para gerar um novo prazo de 7 dias.'
                : `Válido até ${new Date(funcionario.convite_expira_em).toLocaleDateString('pt-BR')}.`}
            </Text>
            <Botao
              titulo="Reenviar convite"
              variante="secundario"
              carregando={processando}
              desabilitado={bloqueado}
              aoPressionar={() =>
                void executar(async () => {
                  await reenviarConvite(funcionario.id);
                  await enviarEmailDeConvite(funcionario.id);
                }, 'Convite reenviado. O link anterior deixou de valer.')
              }
            />
          </View>
        ) : null}

        {/* Seção 5.3 — permissões individuais só existem para Funcionário;
            o Gestor possui todas por definição do papel. */}
        {funcionario.papel === 'funcionario' && funcionario.status !== 'removido' ? (
          <View style={estilos.card}>
            <Text style={estilos.tituloCard}>Permissões</Text>
            <Text style={estilos.detalhe}>
              Registrar vendas, consultar estoque e solicitar cancelamento já são liberados por
              padrão.
            </Text>

            {PERMISSOES_CONCEDIVEIS.map((permissao) => (
              <View key={permissao.chave} style={estilos.linhaPermissao}>
                <View style={estilos.textoPermissao}>
                  <Text style={estilos.rotuloPermissao}>{permissao.rotulo}</Text>
                  <Text style={estilos.descricaoPermissao}>{permissao.descricao}</Text>
                </View>
                <Switch
                  value={permissoes[permissao.chave] === true}
                  disabled={bloqueado}
                  onValueChange={(valor) => alternarPermissao(permissao.chave, valor)}
                  trackColor={{ true: tema.cores.secundaria, false: tema.cores.borda }}
                />
              </View>
            ))}
          </View>
        ) : null}

        {/* Seção 7.8 — promover / rebaixar. */}
        {!ehGestorPrincipal && !ehEuMesmo && funcionario.status === 'ativo' ? (
          <View style={estilos.card}>
            <Text style={estilos.tituloCard}>Papel</Text>

            {funcionario.papel === 'funcionario' ? (
              <>
                <Text style={estilos.detalhe}>
                  Promover a Gestor dá acesso a todas as permissões, à gestão de funcionários e às
                  configurações da empresa.
                </Text>
                <Botao
                  titulo="Promover a Gestor"
                  variante="secundario"
                  carregando={processando}
                  desabilitado={bloqueado}
                  aoPressionar={() =>
                    Alert.alert('Promover a Gestor', `${funcionario.nome} passará a ter acesso total à empresa.`, [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Promover',
                        onPress: () =>
                          void executar(
                            () => alterarPapel(funcionario.id, 'gestor'),
                            `${funcionario.nome} agora é Gestor.`,
                          ),
                      },
                    ])
                  }
                />
              </>
            ) : (
              <>
                <Text style={estilos.detalhe}>
                  Rebaixar devolve as permissões ao padrão de Funcionário.
                </Text>
                <Botao
                  titulo="Rebaixar a Funcionário"
                  variante="texto"
                  carregando={processando}
                  desabilitado={bloqueado}
                  aoPressionar={() =>
                    Alert.alert(
                      'Rebaixar a Funcionário',
                      `${funcionario.nome} perderá o acesso de Gestor e voltará às permissões padrão.`,
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Rebaixar',
                          style: 'destructive',
                          onPress: () =>
                            void executar(
                              () => alterarPapel(funcionario.id, 'funcionario'),
                              `${funcionario.nome} voltou a ser Funcionário.`,
                            ),
                        },
                      ],
                    )
                  }
                />
              </>
            )}
          </View>
        ) : null}

        {/* Seção 5.6 — remover desativa o acesso, mantendo o histórico. */}
        {!ehGestorPrincipal && !ehEuMesmo && funcionario.status !== 'removido' ? (
          <Botao
            titulo="Remover acesso"
            carregando={processando}
            desabilitado={bloqueado}
            aoPressionar={() =>
              Alert.alert(
                'Remover acesso',
                `${funcionario.nome} não conseguirá mais entrar no ambiente da empresa.\n\n` +
                  'Todo o histórico dele é mantido: vendas antigas continuam identificadas com o nome dele.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Remover',
                    style: 'destructive',
                    onPress: () =>
                      void executar(
                        () => removerFuncionario(funcionario.id),
                        `${funcionario.nome} não tem mais acesso.`,
                      ),
                  },
                ],
              )
            }
          />
        ) : null}

        {ehEuMesmo && !ehGestorPrincipal ? (
          <Aviso
            tom="informacao"
            mensagem="Você não pode alterar o próprio papel nem remover o próprio acesso."
          />
        ) : null}

        <Botao titulo="Voltar" variante="texto" aoPressionar={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  nome: { ...tema.tipografia.h1, color: tema.cores.texto },
  email: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginTop: 2 },
  papel: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.primaria,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.md,
  },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  tituloCard: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.xs },
  detalhe: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.md,
  },
  linhaPermissao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: tema.espacamento.sm,
    gap: tema.espacamento.sm,
  },
  textoPermissao: { flex: 1 },
  rotuloPermissao: { ...tema.tipografia.corpo, color: tema.cores.texto },
  descricaoPermissao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
});
