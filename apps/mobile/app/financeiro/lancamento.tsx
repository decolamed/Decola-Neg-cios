/**
 * Lançamento manual — Seção 8.6.
 *
 * "O Gestor pode lançar movimentações manuais (despesas, entradas avulsas)
 * através de um formulário simples: tipo (entrada/saída), valor, descrição,
 * categoria (opcional) e data."
 *
 * A mesma tela edita e exclui, porque a Seção 8.6 permite as duas coisas em
 * lançamento manual — diferente de vendas, que nunca são apagadas. Toda edição
 * e exclusão gera registro em `logs_auditoria`.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Seletor } from '@/componentes/Seletor';
import { precoParaNumero } from '@/componentes/FormularioDeProduto';
import { voltar } from '@/componentes/Cabecalho';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  buscarLancamento,
  criarLancamento,
  editarLancamento,
  excluirLancamento,
  sugestoesDeCategoria,
  type TipoMovimentacao,
} from '@/dados/financeiro';
import { dataDeTexto } from '@/lib/periodo';
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Lancamento() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { conta, podeEscrever } = useSessao();
  const editando = Boolean(id);

  const [tipo, setTipo] = useState<TipoMovimentacao>('saida');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [data, setData] = useState(hojeIso());

  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string | null>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [categorias, existente] = await Promise.all([
        sugestoesDeCategoria(),
        id ? buscarLancamento(id) : Promise.resolve(null),
      ]);

      setSugestoes(categorias);

      if (existente) {
        if (existente.origem !== 'manual') {
          setMensagem('Lançamentos gerados por venda não podem ser editados.');
        }
        setTipo(existente.tipo);
        setValor(String(existente.valor).replace('.', ','));
        setDescricao(existente.descricao);
        setCategoria(existente.categoria ?? '');
        setData(existente.data_movimentacao);
      }
    } catch (e) {
      setMensagem(textoDoErro(e, 'Não foi possível carregar o lançamento.'));
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = useCallback(async () => {
    if (!conta) return;

    setMensagem(null);
    const novosErros: Record<string, string | null> = {};

    const valorNumero = precoParaNumero(valor);
    if (valorNumero === null || valorNumero <= 0) {
      novosErros.valor = 'Informe um valor maior que zero.';
    }

    if (descricao.trim().length === 0) {
      novosErros.descricao = 'Descreva o lançamento.';
    }

    if (!dataDeTexto(data)) {
      novosErros.data = 'Informe uma data no formato AAAA-MM-DD.';
    }

    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return;

    setSalvando(true);
    try {
      const dados = {
        tipo,
        valor: valorNumero!,
        descricao,
        categoria: categoria || null,
        data,
      };

      if (id) {
        await editarLancamento(id, dados);
      } else {
        await criarLancamento(conta.empresa.id, dados);
      }

      voltar('/financeiro');
    } catch (e) {
      setMensagem(textoDoErro(e, 'Não foi possível salvar o lançamento.'));
    } finally {
      setSalvando(false);
    }
  }, [conta, id, tipo, valor, descricao, categoria, data]);

  const confirmarExclusao = useCallback(() => {
    if (!id) return;
    Dialogo.alert(
      'Excluir lançamento',
      'Este lançamento será removido do financeiro. A exclusão fica registrada na auditoria.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setSalvando(true);
            try {
              await excluirLancamento(id);
              voltar('/financeiro');
            } catch (e) {
              setMensagem(textoDoErro(e, 'Não foi possível excluir.'));
              setSalvando(false);
            }
          },
        },
      ],
    );
  }, [id]);

  if (!conta || carregando) return <TelaCarregando />;

  // Seção 8.6 — lançar movimentação manual é ação do Gestor.
  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Apenas o Gestor pode criar lançamentos manuais." />;
  }

  if (!podeEscrever) {
    return (
      <TelaMensagem mensagem="Sua conta está em modo de consulta. Não é possível criar ou editar lançamentos." />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>{editando ? 'Editar lançamento' : 'Novo lançamento'}</Text>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          <Seletor
            rotulo="Tipo"
            opcoes={[
              { valor: 'entrada', rotulo: 'Entrada' },
              { valor: 'saida', rotulo: 'Saída' },
            ]}
            selecionado={tipo}
            aoSelecionar={(v) => setTipo((v as TipoMovimentacao) ?? 'saida')}
            bloqueado={salvando}
          />

          <CampoTexto
            rotulo="Valor *"
            valor={valor}
            aoMudar={setValor}
            erro={erros.valor}
            bloqueado={salvando}
            placeholder="0,00"
          />

          <CampoTexto
            rotulo="Descrição *"
            valor={descricao}
            aoMudar={setDescricao}
            erro={erros.descricao}
            bloqueado={salvando}
            placeholder="Ex.: aluguel do ponto, compra de mercadoria"
          />

          <CampoTexto
            rotulo="Categoria"
            valor={categoria}
            aoMudar={setCategoria}
            bloqueado={salvando}
            placeholder="Opcional"
          />

          {/* Seção 8.6 — sugestões das categorias que a empresa já usou, em
              vez de uma lista fixa do sistema. */}
          {sugestoes.length > 0 ? (
            <View style={estilos.sugestoes}>
              <Text style={estilos.rotuloSugestoes}>Já usadas</Text>
              <Seletor
                opcoes={sugestoes.map((c) => ({ valor: c, rotulo: c }))}
                selecionado={categoria || null}
                aoSelecionar={(v) => setCategoria(v ?? '')}
                bloqueado={salvando}
                horizontal
              />
            </View>
          ) : null}

          <CampoTexto
            rotulo="Data *"
            valor={data}
            aoMudar={setData}
            erro={erros.data}
            bloqueado={salvando}
            placeholder="AAAA-MM-DD"
          />

          <Botao
            titulo={editando ? 'Salvar alterações' : 'Registrar lançamento'}
            aoPressionar={salvar}
            carregando={salvando}
          />

          {editando ? (
            <Botao titulo="Excluir lançamento" variante="texto" aoPressionar={confirmarExclusao} />
          ) : null}

          <Botao titulo="Cancelar" variante="texto" aoPressionar={() => voltar('/financeiro')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  sugestoes: { marginBottom: tema.espacamento.sm },
  rotuloSugestoes: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.xs,
  },
});
