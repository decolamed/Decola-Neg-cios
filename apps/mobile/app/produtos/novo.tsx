/**
 * Cadastro de Produto — Seção 7.5 ("Adicionar produto": cadastro completo,
 * campos padrão + personalizados). Exige `cadastrar_produto`.
 *
 * O CÓDIGO DE BARRAS PASSOU A SER O COMEÇO DO CADASTRO, e não mais um campo
 * opcional no meio do formulário. Bipar (ou digitar e confirmar) dispara duas
 * perguntas, nesta ordem:
 *
 *   1. ESTE CÓDIGO JÁ É DE UM PRODUTO MEU? Se for, a tela carrega aquele
 *      produto e passa a EDITÁ-LO. Antes, o cadastro seguia como se fosse novo
 *      e o banco recusava no fim — o índice único de (empresa, código) existe
 *      desde a migração 0003 — depois de a pessoa ter digitado tudo. Ou pior,
 *      ela mudava um dígito para "resolver" e ficava com dois produtos iguais.
 *
 *   2. ALGUÉM SABE O QUE É ISSO? Aí entra o catálogo (`buscar-codigo`):
 *      primeiro o banco interno da Decola, depois as bases abertas. O que vier
 *      preenche nome e foto, e o lojista corrige o que quiser antes de salvar.
 *      O PREÇO nunca vem de lá: é dele.
 *
 * CADASTRO RÁPIDO (`?rapido=1`): depois de salvar, a tela não vai para o
 * produto — ela se limpa e devolve o foco ao campo do código, para o próximo.
 * É a diferença entre cadastrar trinta produtos e desistir no oitavo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { Checkbox } from '@/componentes/Checkbox';
import { listarCategorias, type Categoria } from '@/dados/categorias';
import {
  consultarCatalogo,
  ehOMesmoProduto,
  type ProdutoDoCatalogo,
} from '@/dados/catalogoDeCodigos';
import { salvarImagensDoProduto } from '@/dados/imagensProduto';
import {
  buscarProdutoPorCodigoParaCadastro,
  criarProduto,
  editarProduto,
  type ProdutoComStatus,
} from '@/dados/produtos';
import { textoDoErro } from '@/lib/erros';

export default function NovoProduto() {
  const { conta, temPermissao, podeEscrever } = useSessao();
  const { rapido } = useLocalSearchParams<{ rapido?: string }>();

  const [valores, setValores] = useState<ValoresDoProduto>(VALORES_INICIAIS);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [campos, setCampos] = useState<CampoConfigurado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);
  /**
   * O RECADO CARREGA O PRÓPRIO TOM.
   *
   * Guardar só o texto obrigava a tela a mostrá-lo sempre do mesmo jeito, e o
   * `Aviso` começa em vermelho. "Nescau cadastrado." saía com cara de falha —
   * quem cadastra trinta produtos seguidos via trinta caixas vermelhas
   * confirmando que deu tudo certo. Vermelho é para erro; confirmação é verde.
   */
  const [recado, setRecado] = useState<{ texto: string; tom: 'erro' | 'sucesso' } | null>(null);
  const falhar = useCallback((texto: string) => setRecado({ texto, tom: 'erro' }), []);
  const [erros, setErros] = useState<Record<string, string | null>>({});

  /** Cadastro rápido: salva e já abre o próximo, sem sair da tela. */
  const [emSerie, setEmSerie] = useState(rapido === '1');

  /**
   * O produto que JÁ EXISTE com este código, quando existe.
   *
   * Enquanto ele estiver preenchido, esta tela não cadastra: ela edita. É o que
   * impede o duplicado — e impede ANTES, e não com uma recusa do banco depois
   * de a pessoa ter preenchido tudo.
   */
  const [existente, setExistente] = useState<ProdutoComStatus | null>(null);
  const [doCatalogo, setDoCatalogo] = useState<ProdutoDoCatalogo | null>(null);
  /**
   * `'nao_achei'` e `'desligada'` são respostas DIFERENTES.
   *
   * Dizer "não encontramos este código em base nenhuma" quando a chave geral
   * está desligada e ninguém chegou a procurar manda o lojista conferir um
   * código que está certo.
   */
  const [semResultado, setSemResultado] = useState<'nao_achei' | 'desligada' | null>(null);
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);

  /** Muda para devolver o foco ao campo do código. */
  const [foco, setFoco] = useState(0);

  /** O último código já consultado — evita repetir a busca por nada. */
  const ultimoBuscado = useRef<string | null>(null);

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
      setErroDeCarga(textoDoErro(e, 'Não foi possível carregar o formulário.'));
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * O código foi confirmado: procurar.
   *
   * PRIMEIRO NA LOJA, depois no catálogo. A ordem não é preferência — é o que
   * distingue "atualizar o que já tenho" de "cadastrar o que ainda não tenho",
   * e essa é a decisão que muda o que o botão de salvar vai fazer.
   */
  const procurarCodigo = useCallback(
    async (codigo: string) => {
      const limpo = codigo.replace(/\D/g, '');

      // Campo esvaziado: a tela volta a ser um cadastro comum.
      if (limpo === '') {
        ultimoBuscado.current = null;
        setExistente(null);
        setDoCatalogo(null);
        setSemResultado(null);
        return;
      }

      if (limpo === ultimoBuscado.current) return;
      ultimoBuscado.current = limpo;

      setBuscandoCodigo(true);
      setDoCatalogo(null);
      setSemResultado(null);
      try {
        const meu = await buscarProdutoPorCodigoParaCadastro(limpo);
        if (meu) {
          setExistente(meu);
          // Carrega o que já está cadastrado para a pessoa CONFERIR e corrigir,
          // em vez de redigitar. A quantidade fica de fora: estoque não se
          // mexe por aqui (é `ajustarEstoque` quem faz, com permissão própria).
          setValores((atual) => ({
            ...atual,
            nome: meu.nome,
            codigo: limpo,
            categoriaId: meu.categoria_id,
            preco: String(meu.preco).replace('.', ','),
            descricao: meu.descricao ?? '',
            visivelNaLoja: meu.visivel_na_loja,
            destaque: meu.destaque,
            atributos: (meu.atributos ?? {}) as Record<string, unknown>,
          }));
          setErros({});
          return;
        }

        setExistente(null);
        const achado = await consultarCatalogo(limpo);
        if (achado === 'desligada') {
          setSemResultado('desligada');
          return;
        }
        if (!achado) {
          // NADA INVENTADO: o nome fica como está (vazio, se estava vazio).
          setSemResultado('nao_achei');
          return;
        }

        setDoCatalogo(achado);

        /**
         * O QUE O CATÁLOGO SABE PREVALECE — quando é o mesmo produto.
         *
         * Campo vazio é fácil: preenche. O caso que importa é o outro: quem
         * digitou "Creatina" e bipou a Integral Médica escreveu o mesmo
         * produto com menos palavras, e o nome completo é melhor do que o dele
         * em todo lugar que importa (etiqueta, busca do estoque, vitrine).
         *
         * MAS SÓ QUANDO BATE. Se o que ele escreveu não aparece no nome do
         * catálogo, o texto dele fica — trocar seria apagar trabalho por conta
         * própria, e a tela oferece a troca num botão logo abaixo.
         *
         * A DESCRIÇÃO só é preenchida se estiver vazia: ela é dele, e é o campo
         * onde o lojista escreve o que quer que o cliente leia.
         */
        setValores((atual) => {
          const meu = atual.nome.trim();
          const trocarNome = meu === '' || ehOMesmoProduto(meu, achado.nome);
          return {
            ...atual,
            nome: trocarNome ? achado.nome : atual.nome,
            descricao: atual.descricao.trim() ? atual.descricao : (achado.descricao ?? ''),
          };
        });
        setErros((atual) => ({ ...atual, nome: null }));
      } catch (e) {
        // Procurar é conveniência: falhar aqui não pode impedir o cadastro.
        falhar(textoDoErro(e, 'Não foi possível consultar este código.'));
      } finally {
        setBuscandoCodigo(false);
      }
    },
    [falhar],
  );

  /**
   * Limpa a tela para o próximo produto, no cadastro rápido.
   *
   * A CATEGORIA FICA. Quem cadastra trinta itens seguidos está quase sempre
   * cadastrando trinta itens da MESMA seção, e reescolher a categoria a cada
   * produto é o tipo de repetição que faz a pessoa desistir na metade.
   */
  const proximo = useCallback(
    (aviso: string) => {
      setValores((atual) => ({
        ...VALORES_INICIAIS,
        categoriaId: atual.categoriaId,
        visivelNaLoja: atual.visivelNaLoja,
      }));
      setErros({});
      setExistente(null);
      setDoCatalogo(null);
      setSemResultado(null);
      ultimoBuscado.current = null;
      setRecado({ texto: aviso, tom: 'sucesso' });
      setFoco((n) => n + 1);
    },
    [],
  );

  const aoSalvar = useCallback(async () => {
    if (!conta) return;

    setRecado(null);
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
      const dados = {
        nome: valores.nome,
        codigo: valores.codigo,
        categoriaId: valores.categoriaId,
        preco: preco!,
        atributos: valores.atributos,
        descricao: valores.descricao,
        visivelNaLoja: valores.visivelNaLoja,
        destaque: valores.destaque,
      };

      /**
       * CÓDIGO CONHECIDO ATUALIZA, não duplica.
       *
       * O estoque não entra aqui de propósito: mexer em quantidade exige
       * `gerenciar_estoque` e passa por `ajustarEstoque`. Somar a "quantidade
       * inicial" a um produto que já existe seria uma entrada de estoque
       * disfarçada de cadastro — e sem registro de movimentação.
       */
      if (existente) {
        await editarProduto(existente.id, dados);
        if (emSerie) {
          proximo(`${valores.nome.trim()} atualizado.`);
        } else {
          router.replace(`/produtos/${existente.id}`);
        }
        return;
      }

      const id = await criarProduto({
        ...dados,
        empresaId: conta.empresa.id,
        criadoPor: conta.vinculo.usuario_id!,
        quantidadeInicial: Number(valores.quantidadeInicial || '0'),
      });

      /**
       * A foto do catálogo entra como imagem do produto.
       *
       * É uma URL do nosso próprio armazenamento (a função já copiou para lá), e
       * `urlDaImagem` deixa URL completa passar direto — então ela funciona
       * igual a uma foto que o lojista tivesse enviado, na loja e no aplicativo.
       *
       * Falhar aqui não desfaz o cadastro: o produto existe, e a foto pode ser
       * posta depois pela tela de fotos.
       */
      if (doCatalogo?.imagem) {
        try {
          await salvarImagensDoProduto(id, [doCatalogo.imagem]);
        } catch (e) {
          console.warn('[produto] foto do catálogo não anexada:', e);
        }
      }

      if (emSerie) proximo(`${valores.nome.trim()} cadastrado.`);
      else router.replace(`/produtos/${id}`);
    } catch (e) {
      falhar(textoDoErro(e, 'Não foi possível salvar o produto.'));
    } finally {
      setSalvando(false);
    }
  }, [conta, valores, campos, existente, emSerie, doCatalogo, proximo]);

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

  /**
   * A faixa abaixo do código: o que a busca respondeu.
   *
   * São quatro respostas possíveis e elas levam a ações diferentes, então cada
   * uma diz explicitamente o que vai acontecer ao salvar. A quarta — "não
   * achei" — é a mais importante de escrever bem: é ela que impede a pessoa de
   * achar que a tela travou e ficar esperando um nome que nunca vem.
   */
  const avisoDoCodigo = buscandoCodigo ? (
    <View style={estilos.faixa}>
      <Text style={estilos.faixaTexto}>Procurando este código…</Text>
    </View>
  ) : existente ? (
    <View style={[estilos.faixa, estilos.faixaConhecida]}>
      <Text style={estilos.faixaTitulo}>
        {existente.ciclo_vida === 'arquivado'
          ? 'Este código é de um produto arquivado'
          : 'Este produto já existe na sua loja'}
      </Text>
      <Text style={estilos.faixaTexto}>
        {existente.nome} — os dados abaixo são os dele. Ao salvar, este produto é
        atualizado; nenhum duplicado é criado.
      </Text>
      {existente.ciclo_vida === 'arquivado' ? (
        <Text style={estilos.faixaTexto}>
          Ele continua arquivado depois de salvar. Para voltar a vendê-lo, abra o
          produto e restaure.
        </Text>
      ) : null}
      <Pressable onPress={() => router.push(`/produtos/${existente.id}`)}>
        <Text style={estilos.faixaLink}>Abrir o produto →</Text>
      </Pressable>
    </View>
  ) : doCatalogo ? (
    <View style={[estilos.faixa, estilos.faixaCatalogo]}>
      {doCatalogo.imagem ? (
        <Image source={{ uri: doCatalogo.imagem }} style={estilos.miniatura} />
      ) : null}
      <View style={estilos.faixaCorpo}>
        <Text style={estilos.faixaTitulo}>Encontrado pelo código</Text>
        <Text style={estilos.faixaTexto}>{doCatalogo.nome}</Text>
        {/* O nome do catálogo não entrou porque o que estava escrito é outro
            produto. A troca fica à mão, mas é decisão de quem digitou — a tela
            não apaga o trabalho de ninguém por conta própria. */}
        {valores.nome.trim() !== doCatalogo.nome ? (
          <Pressable
            onPress={() =>
              setValores((atual) => ({
                ...atual,
                nome: doCatalogo.nome,
                descricao: atual.descricao.trim() ? atual.descricao : (doCatalogo.descricao ?? ''),
              }))
            }
          >
            <Text style={estilos.faixaLink}>Usar este nome</Text>
          </Pressable>
        ) : null}
        <Text style={estilos.faixaTexto}>
          {doCatalogo.descricao
            ? 'Nome e descrição vieram daqui. Confira e informe o preço — o preço é sempre seu.'
            : 'Confira o nome e informe o preço — o preço é sempre seu.'}
        </Text>
      </View>
    </View>
  ) : semResultado === 'desligada' ? (
    <View style={estilos.faixa}>
      <Text style={estilos.faixaTexto}>
        A busca automática por código está temporariamente desligada. O código fica
        guardado no produto normalmente — só o nome precisa ser digitado.
      </Text>
    </View>
  ) : semResultado === 'nao_achei' ? (
    <View style={estilos.faixa}>
      <Text style={estilos.faixaTexto}>
        Não encontramos este código nem na sua loja nem no catálogo. Escreva o nome
        do produto — nada é preenchido por adivinhação.
      </Text>
    </View>
  ) : null;

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>{existente ? 'Atualizar produto' : 'Novo produto'}</Text>

          {recado ? <Aviso mensagem={recado.texto} tom={recado.tom} /> : null}

          <Checkbox marcado={emSerie} aoMudar={setEmSerie} bloqueado={salvando}>
            <Text style={estilos.opcaoTitulo}>Cadastrar vários seguidos</Text>
            <Text style={estilos.opcaoTexto}>
              O código de barras vem primeiro e, ao salvar, a tela já fica pronta
              para o próximo produto — mantendo a categoria.
            </Text>
          </Checkbox>

          <FormularioDeProduto
            valores={valores}
            aoMudar={setValores}
            categorias={categorias}
            camposAtivos={campos}
            /* Produto que já existe não recebe "quantidade inicial": estoque se
               mexe em `ajustarEstoque`, com permissão e movimentação próprias. */
            modo={existente ? 'edicao' : 'cadastro'}
            aoSalvar={aoSalvar}
            salvando={salvando}
            bloqueado={salvando}
            rotuloSalvar={existente ? 'Atualizar produto' : 'Cadastrar produto'}
            erros={erros}
            aoConfirmarCodigo={procurarCodigo}
            focarCodigoQuando={foco}
            codigoPrimeiro={emSerie}
            avisoDoCodigo={avisoDoCodigo}
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

  opcaoTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  opcaoTexto: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },

  faixa: {
    backgroundColor: tema.tons.primaria,
    borderRadius: tema.raio.md,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    gap: tema.espacamento.xs,
  },
  faixaConhecida: { backgroundColor: tema.tons.destaque },
  faixaCatalogo: {
    backgroundColor: tema.tons.secundaria,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.sm,
  },
  faixaCorpo: { flex: 1, gap: tema.espacamento.xs },
  faixaTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  faixaTexto: { ...tema.tipografia.legenda, color: tema.cores.texto },
  faixaLink: { ...tema.tipografia.legenda, color: tema.cores.primaria, fontWeight: '600' },
  miniatura: {
    width: 56,
    height: 56,
    borderRadius: tema.raio.sm,
    backgroundColor: tema.cores.superficie,
  },
});
