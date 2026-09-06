/**
 * Formulário de produto — campos padrão + personalizados (Seção 7.5).
 *
 * Compartilhado entre cadastro e edição. A quantidade inicial só aparece no
 * cadastro: depois disso, mexer em estoque exige `gerenciar_estoque` e passa
 * pela ação "Adicionar estoque" (Seções 7.5 e 8.3).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import type { CampoConfigurado } from '@/dados/camposProduto';
import type { Categoria } from '@/dados/categorias';
import { Botao } from './Botao';
import { CampoPersonalizado } from './CampoPersonalizado';
import { Checkbox } from './Checkbox';
import { CampoTexto } from './CampoTexto';
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
}: Props) {
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

  return (
    <View>
      <CampoTexto
        rotulo="Nome do produto *"
        valor={valores.nome}
        aoMudar={(v) => definir('nome', v)}
        erro={erros.nome}
        bloqueado={bloqueado}
      />

      <CampoTexto
        rotulo="Código / código de barras"
        valor={valores.codigo}
        aoMudar={(v) => definir('codigo', v)}
        erro={erros.codigo}
        bloqueado={bloqueado}
        placeholder="Opcional"
      />

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
        <CampoTexto
          rotulo="Descrição para o cliente"
          valor={valores.descricao}
          aoMudar={(v) => definir('descricao', v)}
          bloqueado={bloqueado}
          placeholder="O que o cliente precisa saber sobre o produto"
        />
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
