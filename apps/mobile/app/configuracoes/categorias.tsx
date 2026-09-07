/**
 * Configurações → Categorias — Seções 4.7 e 8.4.
 *
 * Categorias seguem o mesmo modelo de 3 estados dos produtos: arquivar é
 * reversível, excluir não é, e nenhum dos dois apaga o registro do banco —
 * elas podem estar referenciadas em produtos com histórico de vendas.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  alterarCicloDeVidaCategoria,
  criarCategoria,
  listarCategorias,
  renomearCategoria,
  type Categoria,
} from '@/dados/categorias';
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';

export default function Categorias() {
  const { conta, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [nova, setNova] = useState('');
  const [criando, setCriando] = useState(false);
  const [erroNova, setErroNova] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      setCategorias(await listarCategorias(empresaId, true));
      setErro(null);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar as categorias.'));
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criar = useCallback(async () => {
    if (!empresaId) return;
    setErroNova(null);
    setMensagem(null);

    if (nova.trim().length === 0) {
      setErroNova('Informe o nome da categoria.');
      return;
    }

    setCriando(true);
    try {
      await criarCategoria(empresaId, nova);
      setNova('');
      await carregar();
    } catch (e) {
      setErroNova(textoDoErro(e, 'Não foi possível criar a categoria.'));
    } finally {
      setCriando(false);
    }
  }, [empresaId, nova, carregar]);

  const salvarNome = useCallback(
    async (categoria: Categoria) => {
      if (nomeEditado.trim().length === 0) return;
      setProcessando(true);
      try {
        await renomearCategoria(categoria.id, nomeEditado);
        setEditandoId(null);
        await carregar();
      } catch (e) {
        setMensagem(textoDoErro(e, 'Não foi possível renomear.'));
      } finally {
        setProcessando(false);
      }
    },
    [nomeEditado, carregar],
  );

  const alterarCiclo = useCallback(
    async (categoria: Categoria, destino: 'ativo' | 'arquivado' | 'excluido') => {
      setProcessando(true);
      setMensagem(null);
      try {
        await alterarCicloDeVidaCategoria(categoria.id, destino);
        await carregar();
      } catch (e) {
        setMensagem(textoDoErro(e, 'Não foi possível alterar a categoria.'));
      } finally {
        setProcessando(false);
      }
    },
    [carregar],
  );

  if (!conta || carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Apenas o Gestor pode gerenciar as categorias." />;
  }

  const ativas = categorias.filter((c) => c.ciclo_vida === 'ativo');
  const arquivadas = categorias.filter((c) => c.ciclo_vida === 'arquivado');

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Categorias</Text>

        {mensagem ? <Aviso mensagem={mensagem} /> : null}
        {!podeEscrever ? (
          <Aviso tom="alerta" mensagem="Sua conta está em modo de consulta. As alterações estão bloqueadas." />
        ) : null}

        <View style={estilos.card}>
          <CampoTexto
            rotulo="Nova categoria"
            valor={nova}
            aoMudar={setNova}
            erro={erroNova}
            bloqueado={criando || !podeEscrever}
            placeholder="Ex.: Acessórios, Bebidas, Papelaria"
          />
          <Botao
            titulo="Adicionar categoria"
            aoPressionar={criar}
            carregando={criando}
            desabilitado={!podeEscrever || nova.trim().length === 0}
            variante="secundario"
          />
        </View>

        <Text style={estilos.secao}>Ativas</Text>
        {ativas.length === 0 ? (
          <Text style={estilos.vazio}>Nenhuma categoria cadastrada.</Text>
        ) : (
          ativas.map((categoria) => (
            <View key={categoria.id} style={estilos.card}>
              {editandoId === categoria.id ? (
                <>
                  <CampoTexto
                    rotulo="Nome"
                    valor={nomeEditado}
                    aoMudar={setNomeEditado}
                    bloqueado={processando}
                  />
                  <Botao
                    titulo="Salvar"
                    variante="secundario"
                    carregando={processando}
                    aoPressionar={() => void salvarNome(categoria)}
                  />
                  <Botao titulo="Cancelar" variante="texto" aoPressionar={() => setEditandoId(null)} />
                </>
              ) : (
                <>
                  <Text style={estilos.nome}>{categoria.nome}</Text>
                  <View style={estilos.acoes}>
                    <Botao
                      titulo="Renomear"
                      variante="texto"
                      aoPressionar={() => {
                        setEditandoId(categoria.id);
                        setNomeEditado(categoria.nome);
                      }}
                    />
                    <Botao
                      titulo="Arquivar"
                      variante="texto"
                      aoPressionar={() => void alterarCiclo(categoria, 'arquivado')}
                    />
                  </View>
                </>
              )}
            </View>
          ))
        )}

        {arquivadas.length > 0 ? (
          <>
            <Text style={estilos.secao}>Arquivadas</Text>
            {arquivadas.map((categoria) => (
              <View key={categoria.id} style={estilos.card}>
                <Text style={[estilos.nome, estilos.nomeArquivado]}>{categoria.nome}</Text>
                <View style={estilos.acoes}>
                  <Botao
                    titulo="Restaurar"
                    variante="texto"
                    aoPressionar={() => void alterarCiclo(categoria, 'ativo')}
                  />
                  <Botao
                    titulo="Excluir"
                    variante="texto"
                    aoPressionar={() =>
                      Dialogo.alert(
                        'Excluir categoria',
                        `"${categoria.nome}" sairá de todas as listas e não poderá ser restaurada pelo aplicativo.\n\n` +
                          'Os produtos que a usavam continuam existindo, sem categoria.',
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          {
                            text: 'Excluir',
                            style: 'destructive',
                            onPress: () => void alterarCiclo(categoria, 'excluido'),
                          },
                        ],
                      )
                    }
                  />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  secao: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    marginTop: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
  },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  nome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  nomeArquivado: { color: tema.cores.textoSuave },
  acoes: { flexDirection: 'row', gap: tema.espacamento.md, marginTop: tema.espacamento.xs },
  vazio: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
});
