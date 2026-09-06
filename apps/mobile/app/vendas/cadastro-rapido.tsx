/**
 * Cadastro rápido durante a venda — Seção 8.2.
 *
 * "Permitir que o usuário continue o atendimento sem abandonar o cliente para
 * fazer um cadastro completo."
 *
 * Cadastro simplificado: nome, categoria (se a empresa usa esse campo),
 * quantidade inicial, preço de venda, e os demais campos marcados como
 * OBRIGATÓRIOS pela empresa. Ao confirmar, o produto é criado, a quantidade
 * inicial entra como reposição inicial e o usuário volta ao carrinho com o
 * produto já adicionado.
 *
 * Exige `cadastrar_produto`, a mesma permissão do cadastro normal.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoPersonalizado } from '@/componentes/CampoPersonalizado';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Seletor } from '@/componentes/Seletor';
import { precoParaNumero } from '@/componentes/FormularioDeProduto';
import { useCarrinho } from '@/contexto/CarrinhoContexto';
import { useSessao } from '@/contexto/SessaoContexto';
import { listarCamposAtivos, type CampoConfigurado } from '@/dados/camposProduto';
import { listarCategorias, type Categoria } from '@/dados/categorias';
import { buscarProduto, criarProduto } from '@/dados/produtos';

export default function CadastroRapido() {
  // `termo` vem da busca por nome; `codigo`, do scanner.
  const { termo, codigo } = useLocalSearchParams<{ termo?: string; codigo?: string }>();
  const { conta, temPermissao, podeEscrever } = useSessao();
  const carrinho = useCarrinho();

  const [nome, setNome] = useState(termo ?? '');
  const [codigoBarras, setCodigoBarras] = useState(codigo ?? '');
  const [preco, setPreco] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [atributos, setAtributos] = useState<Record<string, unknown>>({});

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [obrigatorios, setObrigatorios] = useState<CampoConfigurado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string | null>>({});

  const empresaId = conta?.empresa.id;

  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;

    (async () => {
      try {
        const [cats, ativos] = await Promise.all([
          listarCategorias(empresaId),
          listarCamposAtivos(empresaId),
        ]);
        if (cancelado) return;
        setCategorias(cats);
        // Seção 8.2 — no cadastro rápido só entram os campos OBRIGATÓRIOS.
        setObrigatorios(ativos.filter((campo) => campo.obrigatorio));
      } catch (e) {
        if (!cancelado) {
          setMensagem(e instanceof Error ? e.message : 'Não foi possível carregar o formulário.');
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [empresaId]);

  const salvar = useCallback(async () => {
    if (!conta) return;

    setMensagem(null);
    const novosErros: Record<string, string | null> = {};

    if (nome.trim().length === 0) novosErros.nome = 'Informe o nome do produto.';

    const precoNumero = precoParaNumero(preco);
    if (precoNumero === null) novosErros.preco = 'Informe um preço válido.';

    const quantidadeInicial = Number(quantidade || '0');
    if (!Number.isInteger(quantidadeInicial) || quantidadeInicial <= 0) {
      novosErros.quantidade = 'Informe a quantidade que você tem em mãos.';
    }

    for (const campo of obrigatorios) {
      const valor = atributos[campo.chave];
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
        nome,
        codigo: codigoBarras,
        categoriaId,
        preco: precoNumero!,
        quantidadeInicial,
        atributos,
        // Cadastro no meio de uma venda resolve o balcão. Publicar na vitrine é
        // outra decisão, tomada com calma na tela do produto.
        descricao: null,
        visivelNaLoja: false,
      });

      // Volta ao carrinho já com o produto adicionado (Seção 8.2, item 6).
      const criado = await buscarProduto(id);
      if (criado) carrinho.adicionar(criado, 1);

      router.replace('/vendas/nova');
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível cadastrar o produto.');
    } finally {
      setSalvando(false);
    }
  }, [conta, nome, codigoBarras, preco, quantidade, categoriaId, atributos, obrigatorios, carrinho]);

  if (!conta || carregando) return <TelaCarregando />;

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
          <Text style={estilos.titulo}>Cadastrar e vender</Text>
          <Text style={estilos.descricao}>
            Cadastro rápido para não interromper o atendimento. Você pode completar os demais dados
            depois, em Estoque.
          </Text>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          <CampoTexto
            rotulo="Nome do produto *"
            valor={nome}
            aoMudar={setNome}
            erro={erros.nome}
            bloqueado={salvando}
          />

          <CampoTexto
            rotulo="Código de barras"
            valor={codigoBarras}
            aoMudar={setCodigoBarras}
            bloqueado={salvando}
            placeholder="Opcional"
          />

          <CampoTexto
            rotulo="Preço de venda *"
            valor={preco}
            aoMudar={setPreco}
            erro={erros.preco}
            bloqueado={salvando}
            placeholder="0,00"
          />

          <CampoTexto
            rotulo="Quantidade em estoque *"
            valor={quantidade}
            aoMudar={(v) => setQuantidade(v.replace(/[^0-9]/g, ''))}
            erro={erros.quantidade}
            bloqueado={salvando}
          />

          {categorias.length > 0 ? (
            <Seletor
              rotulo="Categoria"
              opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              selecionado={categoriaId}
              aoSelecionar={setCategoriaId}
              permiteLimpar
              rotuloLimpar="Sem categoria"
              bloqueado={salvando}
            />
          ) : null}

          {obrigatorios.map((campo) => (
            <CampoPersonalizado
              key={campo.id}
              campo={campo}
              valor={atributos[campo.chave]}
              aoMudar={(valor) =>
                setAtributos((atual) => {
                  const proximos = { ...atual };
                  if (valor === null || valor === undefined || valor === '') {
                    delete proximos[campo.chave];
                  } else {
                    proximos[campo.chave] = valor;
                  }
                  return proximos;
                })
              }
              erro={erros[`atributo:${campo.chave}`]}
              bloqueado={salvando}
            />
          ))}

          <Botao titulo="Cadastrar e adicionar à venda" aoPressionar={salvar} carregando={salvando} />
          <Botao titulo="Cancelar" variante="texto" aoPressionar={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
});
