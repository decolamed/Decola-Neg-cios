/**
 * Formulário de produto — campos padrão + personalizados (Seção 7.5).
 *
 * Compartilhado entre cadastro e edição. A quantidade inicial só aparece no
 * cadastro: depois disso, mexer em estoque exige `gerenciar_estoque` e passa
 * pela ação "Adicionar estoque" (Seções 7.5 e 8.3).
 */
import { useMemo, useState , type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import type { CampoConfigurado } from '@/dados/camposProduto';
import type { Categoria } from '@/dados/categorias';
import { Botao } from './Botao';
import { CampoPersonalizado } from './CampoPersonalizado';
import { Checkbox } from './Checkbox';
import { CampoTexto } from './CampoTexto';
import { LeitorDeCodigo } from './LeitorDeCodigo';
import { Seletor } from './Seletor';

export type ValoresDoProduto = {
  nome: string;
  codigo: string;
  categoriaId: string | null;
  preco: string;
  quantidadeInicial: string;
  atributos: Record<string, unknown>;
  /** Vitrine: o que o cliente lê na página pública. */
  descricao: string;
  /** Vitrine: o produto aparece na loja. Nasce desmarcado. */
  visivelNaLoja: boolean;
  destaque: boolean;
};

export const VALORES_INICIAIS: ValoresDoProduto = {
  nome: '',
  codigo: '',
  categoriaId: null,
  preco: '',
  quantidadeInicial: '0',
  atributos: {},
  descricao: '',
  // Desmarcado por padrão: publicar um produto é decisão de quem cadastra,
  // não consequência de cadastrar.
  visivelNaLoja: false,
  destaque: false,
};

type Props = {
  valores: ValoresDoProduto;
  aoMudar: (valores: ValoresDoProduto) => void;
  categorias: Categoria[];
  camposAtivos: CampoConfigurado[];
  /** Cadastro exibe a quantidade inicial; edição, não. */
  modo: 'cadastro' | 'edicao';
  bloqueado?: boolean;
  aoSalvar: () => void;
  salvando?: boolean;
  rotuloSalvar?: string;
  /** Erros por campo, vindos da validação local. */
  erros?: Record<string, string | null>;

  /**
   * O código foi confirmado — lido pela câmera ou digitado e confirmado.
   *
   * É AQUI que a busca acontece, e não a cada letra digitada: um código de
   * barras tem treze dígitos, e procurar em todos os treze estados
   * intermediários seria treze consultas para uma resposta.
   */
  aoConfirmarCodigo?: (codigo: string) => void;
  /** Muda de valor e o campo do código recebe o foco. */
  focarCodigoQuando?: number;
  /** O código vem primeiro — é a ordem do cadastro rápido. */
  codigoPrimeiro?: boolean;
  /** Mensagem sobre o que a busca do código encontrou. */
  avisoDoCodigo?: ReactNode;
};

export function precoParaNumero(texto: string): number | null {
  const limpo = texto.replace(/\./g, '').replace(',', '.').trim();
  if (limpo === '') return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function FormularioDeProduto({
  valores,
  aoMudar,
  categorias,
  camposAtivos,
  modo,
  bloqueado = false,
  aoSalvar,
  salvando = false,
  rotuloSalvar = 'Salvar produto',
  erros = {},
  aoConfirmarCodigo,
  focarCodigoQuando,
  codigoPrimeiro = false,
  avisoDoCodigo,
}: Props) {
  const [lendoCodigo, setLendoCodigo] = useState(false);

  const [tocado, setTocado] = useState(false);

  const opcoesDeCategoria = useMemo(
    () => categorias.map((c) => ({ valor: c.id, rotulo: c.nome })),
    [categorias],
  );

  const definir = <C extends keyof ValoresDoProduto>(campo: C, valor: ValoresDoProduto[C]) => {
    setTocado(true);
    aoMudar({ ...valores, [campo]: valor });
  };

  const definirAtributo = (chave: string, valor: unknown) => {
    setTocado(true);
    const proximos = { ...valores.atributos };
    if (valor === null || valor === undefined || valor === '') {
      delete proximos[chave];
    } else {
      proximos[chave] = valor;
    }
    aoMudar({ ...valores, atributos: proximos });
  };

  // Campos obrigatórios do sistema + os que a empresa marcou como obrigatórios.
  const completo =
    valores.nome.trim().length > 0 &&
    precoParaNumero(valores.preco) !== null &&
    camposAtivos
      .filter((campo) => campo.obrigatorio)
      .every((campo) => {
        const valor = valores.atributos[campo.chave];
        return valor !== undefined && valor !== null && String(valor).trim() !== '';
      });

  // Enquanto lê, o leitor toma a tela: uma câmera espremida entre campos não
  // dá enquadramento para a etiqueta e ainda esconde o que foi lido.
  if (lendoCodigo) {
    return (
      <LeitorDeCodigo
        instrucao="Aponte para o código de barras da etiqueta do produto."
        aoLer={(codigo) => {
          definir('codigo', codigo);
          setLendoCodigo(false);
          // Bipou: procura na hora. É o gesto inteiro do cadastro rápido —
          // apontar a câmera e o resto aparecer.
          aoConfirmarCodigo?.(codigo);
        }}
        aoCancelar={() => setLendoCodigo(false)}
      />
    );
  }

  const campoDoNome = (
    <CampoTexto
      rotulo="Nome do produto *"
      valor={valores.nome}
      aoMudar={(v) => definir('nome', v)}
      erro={erros.nome}
      bloqueado={bloqueado}
    />
  );

  const campoDoCodigo = (
    <View>
      {/* Ler o código com a câmera era o que faltava aqui: digitar treze
          dígitos de uma etiqueta é onde o cadastro trava e onde o erro
          encontra. O leitor é o MESMO da tela de venda. */}
      <CampoTexto
        rotulo="Código de barras"
        valor={valores.codigo}
        aoMudar={(v) => definir('codigo', v)}
        erro={erros.codigo}
        bloqueado={bloqueado}
        /* "Opcional" era verdade quando o código era só um apelido do produto.
           Agora ele é o que identifica: é por ele que a tela reconhece um
           produto que já existe e é por ele que o catálogo responde. Continua
           dando para cadastrar sem — mas dizer "opcional" a quem tem o leitor
           na mão é convidar a pular o campo que faz o resto funcionar. */
        placeholder={aoConfirmarCodigo ? 'Bipe ou digite o código' : 'Opcional'}
        tipoTeclado="number-pad"
        focarQuando={focarCodigoQuando}
        aoConfirmar={() => aoConfirmarCodigo?.(valores.codigo)}
      />
      <Botao
        titulo={valores.codigo ? 'Ler outro código' : 'Ler código de barras'}
        variante="contorno"
        aoPressionar={() => setLendoCodigo(true)}
        desabilitado={bloqueado}
        estilo={{ marginBottom: avisoDoCodigo ? tema.espacamento.sm : tema.espacamento.md }}
      />
      {avisoDoCodigo}
    </View>
  );

  return (
    <View>
      {/* A ORDEM DOS DOIS PRIMEIROS CAMPOS depende do modo.
          No cadastro rápido o código vem primeiro: é ele que preenche o resto,
          e quem está com o leitor na mão bipa antes de olhar para a tela. No
          cadastro normal o nome continua abrindo o formulário. */}
      {codigoPrimeiro ? campoDoCodigo : campoDoNome}
      {codigoPrimeiro ? campoDoNome : campoDoCodigo}

      <CampoTexto
        rotulo="Preço de venda *"
        valor={valores.preco}
        aoMudar={(v) => definir('preco', v)}
        erro={erros.preco}
        bloqueado={bloqueado}
        placeholder="0,00"
      />

      {modo === 'cadastro' ? (
        <CampoTexto
          rotulo="Quantidade inicial em estoque"
          valor={valores.quantidadeInicial}
          aoMudar={(v) => definir('quantidadeInicial', v.replace(/[^0-9]/g, ''))}
          tipoTeclado="number-pad"
          erro={erros.quantidadeInicial}
          bloqueado={bloqueado}
        />
      ) : null}

      {opcoesDeCategoria.length > 0 ? (
        <Seletor
          rotulo="Categoria"
          opcoes={opcoesDeCategoria}
          selecionado={valores.categoriaId}
          aoSelecionar={(v) => definir('categoriaId', v)}
          permiteLimpar
          rotuloLimpar="Sem categoria"
          bloqueado={bloqueado}
          erro={erros.categoria}
        />
      ) : null}

      {/* Campos personalizados ativados pela empresa, na ordem configurada
          (Seção 4.6). Se nenhum estiver ativo, a seção simplesmente não
          aparece — nada de campo fantasma. */}
      {camposAtivos.length > 0 ? (
        <>
          <Text style={estilos.secao}>Detalhes do produto</Text>
          {camposAtivos.map((campo) => (
            <CampoPersonalizado
              key={campo.id}
              campo={campo}
              valor={valores.atributos[campo.chave]}
              aoMudar={(valor) => definirAtributo(campo.chave, valor)}
              erro={erros[`atributo:${campo.chave}`]}
              bloqueado={bloqueado}
            />
          ))}
        </>
      ) : null}

      {/* --------------------------------------------------------- vitrine --
          Fica no fim porque é opcional: quem não usa a loja virtual chega ao
          botão de salvar sem precisar decidir nada aqui. */}
      <Text style={estilos.secao}>Loja virtual</Text>

      <Checkbox
        marcado={valores.visivelNaLoja}
        aoMudar={(v) => definir('visivelNaLoja', v)}
        bloqueado={bloqueado}
      >
        Mostrar este produto na loja virtual
      </Checkbox>

      {valores.visivelNaLoja ? (
        <>
          <CampoTexto
            rotulo="Descrição para o cliente"
            valor={valores.descricao}
            aoMudar={(v) => definir('descricao', v)}
            bloqueado={bloqueado}
            placeholder="O que o cliente precisa saber sobre o produto"
          />

          {/* A faixa "Produtos em destaque" é a primeira coisa que o cliente
              vê depois do banner. Destacar tudo é o mesmo que não destacar
              nada, então isto é uma escolha, não um padrão. */}
          <Checkbox
            marcado={valores.destaque}
            aoMudar={(v) => definir('destaque', v)}
            bloqueado={bloqueado}
          >
            Mostrar em "Produtos em destaque"
          </Checkbox>
        </>
      ) : null}

      <Botao
        titulo={rotuloSalvar}
        aoPressionar={aoSalvar}
        carregando={salvando}
        desabilitado={!completo && tocado ? true : !completo}
        estilo={{ marginTop: tema.espacamento.md }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  secao: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    marginTop: tema.espacamento.sm,
    marginBottom: tema.espacamento.md,
  },
});
