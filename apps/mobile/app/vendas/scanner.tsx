/**
 * Scanner de código de barras — Seção 7.3.
 *
 * "Abre a câmera para leitura de código de barras. Identificado o produto,
 * adiciona automaticamente à venda; não identificado, aciona o mesmo fluxo de
 * 'Produto não cadastrado' (Seção 8.2)."
 */
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useCarrinho } from '@/contexto/CarrinhoContexto';
import { useSessao } from '@/contexto/SessaoContexto';
import { buscarProdutoPorCodigo } from '@/dados/produtos';
import { AVISO_PRODUTO_NAO_CADASTRADO } from '@/dados/vendas';

export default function Scanner() {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const { temPermissao, podeEscrever } = useSessao();
  const carrinho = useCarrinho();

  const [processando, setProcessando] = useState(false);
  const [naoEncontrado, setNaoEncontrado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const aoLer = useCallback(
    async ({ data }: { data: string }) => {
      // A câmera dispara em rajada: ignora leituras enquanto uma está em curso.
      if (processando || naoEncontrado) return;

      setProcessando(true);
      setErro(null);

      try {
        const produto = await buscarProdutoPorCodigo(data);

        if (!produto) {
          setNaoEncontrado(data);
          return;
        }

        const jaNoCarrinho = carrinho.quantidadeDe(produto.id);
        if (jaNoCarrinho + 1 > produto.estoque_atual) {
          // A divergência (Seção 8.1) é resolvida na tela de venda, que tem o
          // painel com as duas saídas. Aqui só devolvemos o usuário para lá.
          setErro(
            `${produto.nome} tem apenas ${produto.estoque_atual} unidade(s). ` +
              'Ajuste a quantidade na tela da venda.',
          );
          return;
        }

        carrinho.adicionar(produto, 1);
        router.back();
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível consultar o produto.');
      } finally {
        setProcessando(false);
      }
    },
    [processando, naoEncontrado, carrinho],
  );

  if (!permissao) return <TelaCarregando />;

  if (!permissao.granted) {
    return (
      <TelaMensagem
        mensagem="Precisamos da câmera para ler o código de barras dos produtos."
        aoTentarNovamente={pedirPermissao}
      />
    );
  }

  // Seção 8.2 — produto não cadastrado.
  if (naoEncontrado) {
    return (
      <SafeAreaView style={estilos.telaMensagem}>
        <Text style={estilos.titulo}>{AVISO_PRODUTO_NAO_CADASTRADO}</Text>
        <Text style={estilos.codigo}>Código lido: {naoEncontrado}</Text>

        {temPermissao('cadastrar_produto') && podeEscrever ? (
          <Botao
            titulo="Cadastrar e vender"
            aoPressionar={() =>
              router.replace({
                pathname: '/vendas/cadastro-rapido',
                params: { codigo: naoEncontrado },
              })
            }
          />
        ) : (
          <Text style={estilos.aviso}>Peça ao Gestor para cadastrar este produto.</Text>
        )}

        <Botao
          titulo="Escanear outro"
          variante="secundario"
          aoPressionar={() => setNaoEncontrado(null)}
        />
        <Botao titulo="Voltar" variante="texto" aoPressionar={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <View style={estilos.tela}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'],
        }}
        onBarcodeScanned={processando ? undefined : aoLer}
      />

      <SafeAreaView style={estilos.sobreposicao}>
        <View style={estilos.alvo} />

        <View style={estilos.rodape}>
          {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
          <Text style={estilos.instrucao}>
            Aponte a câmera para o código de barras do produto.
          </Text>
          <Botao titulo="Cancelar" variante="secundario" aoPressionar={() => router.back()} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.paleta.preto },
  telaMensagem: {
    flex: 1,
    backgroundColor: tema.cores.fundo,
    justifyContent: 'center',
    padding: tema.espacamento.lg,
  },
  sobreposicao: { flex: 1, justifyContent: 'space-between' },
  alvo: {
    alignSelf: 'center',
    marginTop: tema.espacamento.xxl,
    width: '80%',
    height: 180,
    borderWidth: 2,
    borderColor: tema.cores.destaque,
    borderRadius: tema.raio.md,
  },
  rodape: {
    padding: tema.espacamento.lg,
    backgroundColor: 'rgba(1, 57, 94, 0.85)',
  },
  instrucao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoInverso,
    textAlign: 'center',
    marginBottom: tema.espacamento.md,
  },
  erro: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.destaque,
    textAlign: 'center',
    marginBottom: tema.espacamento.sm,
  },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  codigo: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.lg,
  },
  aviso: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, marginBottom: tema.espacamento.md },
});
