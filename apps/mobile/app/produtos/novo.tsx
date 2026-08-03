/**
 * Cadastro de Produto — Seção 7.5 ("Adicionar produto": cadastro completo,
 * campos padrão + personalizados). Exige `cadastrar_produto`.
 */
import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import {
  FormularioDeProduto,
  precoParaNumero,
  VALORES_INICIAIS,
  type ValoresDoProduto,
} from '@/componentes/FormularioDeProduto';
import { useSessao } from '@/contexto/SessaoContexto';
import { listarCamposAtivos, type CampoConfigurado } from '@/dados/camposProduto';
import { listarCategorias, type Categoria } from '@/dados/categorias';
import { criarProduto } from '@/dados/produtos';

export default function NovoProduto() {
  const { conta, temPermissao, podeEscrever } = useSessao();

  const [valores, setValores] = useState<ValoresDoProduto>(VALORES_INICIAIS);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [campos, setCampos] = useState<CampoConfigurado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string | null>>({});

  const empresaId = conta?.empresa.id;

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    try {
      const [cats, ativos] = await Promise.all([
        listarCategorias(empresaId),
        listarCamposAtivos(empresaId),
      ]);
      setCategorias(cats);
      setCampos(ativos);
      setErroDeCarga(null);
    } catch (e) {
      setErroDeCarga(e instanceof Error ? e.message : 'Não foi possível carregar o formulário.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aoSalvar = useCallback(async () => {
    if (!conta) return;

    setMensagem(null);
    const novosErros: Record<string, string | null> = {};

    if (valores.nome.trim().length === 0) novosErros.nome = 'Informe o nome do produto.';

    const preco = precoParaNumero(valores.preco);
    if (preco === null) novosErros.preco = 'Informe um preço válido.';

    // Campos que a empresa marcou como obrigatórios (Seção 4.6). O banco
    // revalida isso — aqui só antecipamos a mensagem.
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
      const id = await criarProduto({
        empresaId: conta.empresa.id,
        criadoPor: conta.vinculo.usuario_id!,
        nome: valores.nome,
        codigo: valores.codigo,
        categoriaId: valores.categoriaId,
        preco: preco!,
        quantidadeInicial: Number(valores.quantidadeInicial || '0'),
        atributos: valores.atributos,
      });
      router.replace(`/produtos/${id}`);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível salvar o produto.');
    } finally {
      setSalvando(false);
    }
  }, [conta, valores, campos]);

  if (!conta || carregando) return <TelaCarregando />;

  if (erroDeCarga) {
    return <TelaMensagem mensagem={erroDeCarga} aoTentarNovamente={carregar} />;
  }

  if (!temPermissao('cadastrar_produto')) {
    return <TelaMensagem mensagem="Você não tem permissão para cadastrar produtos." />;
  }

  if (!podeEscrever) {
    return (
      <TelaMensagem mensagem="Sua conta está em modo de consulta. Não é possível cadastrar produtos." />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>Novo produto</Text>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          <FormularioDeProduto
            valores={valores}
            aoMudar={setValores}
            categorias={categorias}
            camposAtivos={campos}
            modo="cadastro"
            aoSalvar={aoSalvar}
            salvando={salvando}
            bloqueado={salvando}
            rotuloSalvar="Cadastrar produto"
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
