/**
 * Divergência de Estoque — Seção 8.1.
 *
 * "O sistema não permite estoque negativo como comportamento padrão, mas
 * reconhece que o estoque virtual pode divergir do estoque físico real da
 * loja — e não deve travar a operação de venda por causa disso."
 *
 * Duas saídas, conforme a especificação:
 *   Cancelar a venda ......... nenhuma alteração é feita
 *   Atualizar e continuar .... o usuário informa quantas unidades encontrou a
 *                              mais; o sistema SOMA ao estoque_atual e a venda
 *                              prossegue
 *
 * Sem a permissão `gerenciar_estoque`, o usuário só pode cancelar.
 */
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import { Aviso } from './Aviso';
import { Botao } from './Botao';
import { CampoTexto } from './CampoTexto';
import { AVISO_ESTOQUE_INSUFICIENTE } from '@/dados/vendas';
import { ajustarEstoque } from '@/dados/produtos';
import { textoDoErro } from '@/lib/erros';

type Props = {
  produtoId: string;
  nome: string;
  disponivel: number;
  solicitado: number;
  podeAjustar: boolean;
  aoCancelar: () => void;
  /** Recebe o novo estoque total após o ajuste. */
  aoAjustar: (novoEstoque: number) => void;
};

export function PainelDeDivergencia({
  produtoId,
  nome,
  disponivel,
  solicitado,
  podeAjustar,
  aoCancelar,
  aoAjustar,
}: Props) {
  const faltando = Math.max(solicitado - disponivel, 0);

  const [quantidade, setQuantidade] = useState(String(faltando));
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    setErro(null);
    setMensagem(null);

    const numero = Number(quantidade);
    if (!Number.isInteger(numero) || numero <= 0) {
      setErro('Informe quantas unidades você encontrou.');
      return;
    }

    setSalvando(true);
    try {
      const resultado = await ajustarEstoque({
        produtoId,
        quantidade: numero,
        tipo: 'divergencia',
        motivo: 'Divergência identificada durante a venda',
      });
      aoAjustar(resultado.estoque_atual);
    } catch (e) {
      setMensagem(textoDoErro(e, 'Não foi possível ajustar o estoque.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={aoCancelar}>
      <View style={estilos.fundo}>
        <View style={estilos.painel}>
          <Text style={estilos.titulo}>{AVISO_ESTOQUE_INSUFICIENTE}</Text>

          <Text style={estilos.detalhe}>
            {nome}: há {disponivel} unidade(s) no estoque e você tentou vender {solicitado}.
          </Text>

          {mensagem ? <Aviso mensagem={mensagem} /> : null}

          {podeAjustar ? (
            <>
              <Text style={estilos.explicacao}>
                Se você encontrou unidades a mais na loja, informe quantas para atualizar o estoque
                e continuar a venda.
              </Text>

              <CampoTexto
                rotulo="Unidades encontradas a mais"
                valor={quantidade}
                aoMudar={(v) => setQuantidade(v.replace(/[^0-9]/g, ''))}
                erro={erro}
                bloqueado={salvando}
              />

              <Botao
                titulo="Atualizar estoque e continuar"
                aoPressionar={confirmar}
                carregando={salvando}
                variante="secundario"
              />
            </>
          ) : (
            // Seção 8.1 — sem `gerenciar_estoque`, só resta cancelar.
            <Text style={estilos.explicacao}>
              Você não tem permissão para ajustar o estoque. Peça ao Gestor para corrigir a
              quantidade, ou cancele esta venda.
            </Text>
          )}

          <Botao
            titulo={podeAjustar ? 'Cancelar a venda' : 'Entendi'}
            variante="texto"
            aoPressionar={aoCancelar}
          />
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(1, 57, 94, 0.45)',
    justifyContent: 'center',
    padding: tema.espacamento.lg,
  },
  painel: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
  },
  titulo: { ...tema.tipografia.h2, color: tema.cores.erro, marginBottom: tema.espacamento.sm },
  detalhe: { ...tema.tipografia.corpo, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  explicacao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.md,
  },
});
