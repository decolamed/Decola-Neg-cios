/**
 * Edição de Produto — ação "Editar" da tela de detalhes (Seção 7.5).
 * Exige `editar_produto`.
 *
 * O estoque não é editável aqui: alterar quantidade exige `gerenciar_estoque`
 * e passa pela ação "Adicionar/Reduzir estoque". Essa separação é imposta pelo
 * trigger de permissão por coluna no banco (migration 0008), não só pela tela.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { voltar } from '@/componentes/Cabecalho';
import {
  FormularioDeProduto,
  precoParaNumero,
  VALORES_INICIAIS,
  type ValoresDoProduto,
} from '@/componentes/FormularioDeProduto';
import { useSessao } from '@/contexto/SessaoContexto';
import { listarCamposAtivos, type CampoConfigurado } from '@/dados/camposProduto';
import { listarCategorias, type Categoria } from '@/dados/categorias';
import { buscarProduto, editarProduto } from '@/dados/produtos';
import { textoDoErro } from '@/lib/erros';

export default function EditarProduto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conta, temPermissao, podeEscrever } = useSessao();

  const [valores, setValores] = useState<ValoresDoProduto>(VALORES_INICIAIS);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [campos, setCampos] = useState<CampoConfigurado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string | null>>({});

  const carregar = useCallback(async () => {
    if (!id || !conta) return;
    setCarregando(true);
    try {
      const [produto, cats, ativos] = await Promise.all([
        buscarProduto(id),
        listarCategorias(conta.empresa.id),
        listarCamposAtivos(conta.empresa.id),
      ]);

      if (!produto) {
        setErroDeCarga('Produto não encontrado.');
        return;
      }

      setValores({
        nome: produto.nome,
        codigo: produto.codigo ?? '',
        categoriaId: produto.categoria_id,
        preco: String(produto.preco).replace('.', ','),
        quantidadeInicial: String(produto.estoque_atual),
        atributos: (produto.atributos ?? {}) as Record<string, unknown>,
        descricao: produto.descricao ?? '',
        visivelNaLoja: produto.visivel_na_loja,
        destaque: produto.destaque,
      });
      setCategorias(cats);
      setCampos(ativos);
      setErroDeCarga(null);
    } catch (e) {
      setErroDeCarga(textoDoErro(e, 'Não foi possível carregar o produto.'));
    } finally {
      setCarregando(false);
    }
  }, [id, conta]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aoSalvar = useCallback(async () => {
    if (!id) return;

    setMensagem(null);
    const novosErros: Record<string, string | null> = {};

    if (valores.nome.trim().length === 0) novosErros.nome = 'Informe o nome do produto.';

    const preco = precoParaNumero(valores.preco);
    if (preco === null) novosErros.preco = 'Informe um preço válido.';

    for (const campo of campos) {
      if (!campo.obrigatorio) continue;
      const valor = valores.atributos[campo.chave];
      if (valor === undefined || valor === null || String(valor).trim() === '') {
        novosErros[`atributo:${campo.chave}`] = `${campo.nome_exibicao} é obrigatório.`;
      }
    }

    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;

    setSalvando(true);
    try {
      await editarProduto(id, {
        nome: valores.nome,
        codigo: valores.codigo,
        categoriaId: valores.categoriaId,
        preco: preco!,
        atributos: valores.atributos,
        descricao: valores.descricao,
        visivelNaLoja: valores.visivelNaLoja,
        destaque: valores.destaque,
      });
      voltar('/produtos');
    } catch (e) {
      setMensagem(textoDoErro(e, 'Não foi possível salvar as alterações.'));
    } finally {
      setSalvando(false);
    }
  }, [id, valores, campos]);

  if (carregando) return <TelaCarregando />;

  if (erroDeCarga) {
    return <TelaMensagem mensagem={erroDeCarga} aoTentarNovamente={carregar} />;
  }

  if (!temPermissao('editar_produto')) {
    return <TelaMensagem mensagem="Você não tem permissão para editar produtos." />;
  }

  if (!podeEscrever) {
    return (
      <TelaMensagem mensagem="Sua conta está em modo de consulta. Não é possível editar produtos." />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>Editar produto</Text>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          <FormularioDeProduto
            valores={valores}
            aoMudar={setValores}
            categorias={categorias}
            camposAtivos={campos}
            modo="edicao"
            aoSalvar={aoSalvar}
            salvando={salvando}
            bloqueado={salvando}
            rotuloSalvar="Salvar alterações"
            erros={erros}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
});
