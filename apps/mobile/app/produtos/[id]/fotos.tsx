/**
 * Fotos do produto.
 *
 * Tela própria, e não mais uma seção do formulário de cadastro, por um motivo
 * concreto: o caminho do arquivo no bucket inclui o `produto_id`, que só
 * existe depois que o produto foi salvo. Fotografar vem depois de cadastrar.
 *
 * A ordem é o conteúdo: a primeira foto é a capa que o cliente vê na vitrine.
 * Por isso "Tornar capa" está em cada foto que não é a primeira, em vez de um
 * modo de arrastar-e-soltar que em lista pequena atrapalha mais do que ajuda.
 *
 * Gravar em `produtos.imagens` acontece a cada mudança, não num botão
 * "Salvar": a foto já subiu para o bucket: deixar a lista dessincronizada do
 * que existe lá é o que produz produto com foto fantasma.
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  MAXIMO_DE_IMAGENS,
  apagarImagem,
  carregarImagensDoProduto,
  enviarImagem,
  escolherImagem,
  salvarImagensDoProduto,
  tirarFoto,
  urlDaImagem,
} from '@/dados/imagensProduto';
import { buscarProduto, type ProdutoComStatus } from '@/dados/produtos';
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';

export default function FotosDoProduto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conta, temPermissao, podeEscrever } = useSessao();

  const [produto, setProduto] = useState<ProdutoComStatus | null | 'inexistente'>(null);
  const [imagens, setImagens] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const [dados, caminhos] = await Promise.all([
        buscarProduto(id),
        carregarImagensDoProduto(id),
      ]);
      setProduto(dados ?? 'inexistente');
      setImagens(caminhos);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar as fotos.'));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  /** Grava a nova ordem/lista e só então atualiza a tela. */
  const aplicar = useCallback(
    async (novas: string[]) => {
      if (!id) return;
      setErro(null);
      setOcupado(true);
      try {
        await salvarImagensDoProduto(id, novas);
        setImagens(novas);
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível salvar a alteração.'));
      } finally {
        setOcupado(false);
      }
    },
    [id],
  );

  const adicionar = useCallback(
    async (origem: 'galeria' | 'camera') => {
      if (!conta || !id) return;
      setErro(null);

      try {
        const uri = origem === 'galeria' ? await escolherImagem() : await tirarFoto();
        if (!uri) return; // desistir não é erro

        setOcupado(true);
        const caminho = await enviarImagem({
          empresaId: conta.empresa.id,
          produtoId: id,
          uriLocal: uri,
        });
        await aplicar([...imagens, caminho]);
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível adicionar a foto.'));
      } finally {
        setOcupado(false);
      }
    },
    [conta, id, imagens, aplicar],
  );

  const remover = useCallback(
    (caminho: string) => {
      Dialogo.alert('Remover foto', 'A foto sai da loja e do cadastro do produto.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await aplicar(imagens.filter((c) => c !== caminho));
              // Depois de a lista já estar salva: se apagar o arquivo falhar,
              // o produto já não mostra mais a foto.
              await apagarImagem(caminho);
            })();
          },
        },
      ]);
    },
    [imagens, aplicar],
  );

  const tornarCapa = useCallback(
    (caminho: string) => {
      void aplicar([caminho, ...imagens.filter((c) => c !== caminho)]);
    },
    [imagens, aplicar],
  );

  if (produto === null) return <TelaCarregando />;
  if (produto === 'inexistente') return <TelaMensagem mensagem="Produto não encontrado." />;

  if (!temPermissao('editar_produto')) {
    return <TelaMensagem mensagem="Você não tem permissão para alterar este produto." />;
  }

  const podeAlterar = podeEscrever && !ocupado;
  const cheio = imagens.length >= MAXIMO_DE_IMAGENS;

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Fotos</Text>
        <Text style={estilos.subtitulo}>{produto.nome}</Text>

        {erro ? <Aviso mensagem={erro} /> : null}

        {!podeEscrever ? (
          <Aviso tom="alerta" mensagem="Sua conta está em modo de consulta." />
        ) : null}

        {!produto.visivel_na_loja ? (
          <Aviso
            tom="alerta"
            mensagem={
              'Este produto ainda não aparece na loja virtual. As fotos ficam salvas, mas só ' +
              'serão vistas depois que você marcar "Mostrar na loja virtual" ao editar o produto.'
            }
          />
        ) : null}

        {imagens.length === 0 ? (
          <View style={estilos.vazio}>
            <Text style={estilos.textoVazio}>
              Nenhuma foto ainda. Produto com foto é o que faz alguém parar para olhar.
            </Text>
          </View>
        ) : (
          imagens.map((caminho, indice) => (
            <View style={estilos.cartao} key={caminho}>
              <Image
                source={{ uri: urlDaImagem(caminho) }}
                style={estilos.foto}
                resizeMode="cover"
              />

              <View style={estilos.barra}>
                {indice === 0 ? (
                  <Text style={estilos.selo}>Capa da vitrine</Text>
                ) : (
                  <Pressable onPress={() => tornarCapa(caminho)} disabled={!podeAlterar}>
                    <Text style={[estilos.acao, !podeAlterar && estilos.acaoInativa]}>
                      Tornar capa
                    </Text>
                  </Pressable>
                )}

                <Pressable onPress={() => remover(caminho)} disabled={!podeAlterar}>
                  <Text style={[estilos.acaoRemover, !podeAlterar && estilos.acaoInativa]}>
                    Remover
                  </Text>
                </Pressable>
              </View>
            </View>
          ))
        )}

        {cheio ? (
          <Aviso
            tom="alerta"
            mensagem={`Você chegou ao limite de ${MAXIMO_DE_IMAGENS} fotos por produto. Remova uma para adicionar outra.`}
          />
        ) : (
          <View style={estilos.acoes}>
            <Botao
              titulo="Escolher da galeria"
              aoPressionar={() => void adicionar('galeria')}
              carregando={ocupado}
              desabilitado={!podeAlterar}
            />
            <Botao
              titulo="Tirar foto"
              variante="secundario"
              aoPressionar={() => void adicionar('camera')}
              desabilitado={!podeAlterar}
            />
          </View>
        )}

        <Botao titulo="Voltar" variante="texto" aoPressionar={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, gap: tema.espacamento.md },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  subtitulo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  vazio: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
  },
  textoVazio: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, textAlign: 'center' },
  cartao: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    overflow: 'hidden',
    ...tema.elevacao.card,
  },
  foto: { width: '100%', height: 220, backgroundColor: tema.cores.bordaSuave },
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tema.espacamento.md,
  },
  selo: { ...tema.tipografia.legenda, color: tema.cores.primaria, fontWeight: 'bold' },
  acao: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  acaoRemover: { ...tema.tipografia.corpoDestacado, color: tema.cores.negativo },
  acaoInativa: { opacity: 0.4 },
  acoes: { gap: tema.espacamento.sm },
});
