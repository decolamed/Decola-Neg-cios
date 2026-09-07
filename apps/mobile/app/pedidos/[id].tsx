/**
 * Detalhe do pedido — onde o gestor atende.
 *
 * Cada ação daqui chama uma RPC que revalida papel, estado da conta e
 * transição. A tela só decide o que MOSTRAR; o que pode acontecer é decidido
 * no banco. Se as duas divergirem, o banco recusa — e é assim que se quer.
 *
 * Duas ações têm peso diferente das outras e por isso pedem confirmação:
 * confirmar pagamento (é dinheiro que ninguém automatizou) e finalizar (baixa
 * o estoque e lança o financeiro, sem volta pela tela).
 */
import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  PROXIMO_PASSO,
  ROTULO_STATUS,
  avancarStatus,
  cancelarPedido,
  carregarPedido,
  confirmarPagamento,
  finalizarPedido,
  whatsappDoCliente,
  type PedidoComItens,
} from '@/dados/pedidos';
import { moeda } from '@/lib/formato';
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';

export default function DetalheDoPedido() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { conta, podeEscrever: contaAtiva } = useSessao();

  // As quatro RPCs exigem `pode_escrever_como_gestor`. Aqui vale o mesmo par:
  // papel de Gestor E conta em dia. Faltando qualquer um, a tela vira consulta.
  const podeEscrever = contaAtiva && (conta?.ehGestor ?? false);

  const [pedido, setPedido] = useState<PedidoComItens | null | 'inexistente'>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const dados = await carregarPedido(id);
      setPedido(dados ?? 'inexistente');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar o pedido.'));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar]),
  );

  const executar = useCallback(
    async (acao: () => Promise<void>) => {
      setErro(null);
      setProcessando(true);
      try {
        await acao();
        await carregar();
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível concluir a ação.'));
      } finally {
        setProcessando(false);
      }
    },
    [carregar],
  );

  if (pedido === null) return <TelaCarregando />;
  if (pedido === 'inexistente') return <TelaMensagem mensagem="Pedido não encontrado." />;

  const entrega = pedido.modalidade === 'entrega';
  const encerrado = pedido.status === 'finalizado' || pedido.status === 'cancelado';
  const proximo = PROXIMO_PASSO[pedido.status];
  const podeFinalizar =
    !encerrado && pedido.status !== 'aguardando_pagamento' && podeEscrever;

  const confirmar = (titulo: string, mensagem: string, aoConfirmar: () => void) =>
    Dialogo.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: aoConfirmar },
    ]);

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.numero}>Pedido #{pedido.numero}</Text>
        <Text style={estilos.status}>{ROTULO_STATUS[pedido.status]}</Text>

        {erro ? <Aviso mensagem={erro} /> : null}

        {pedido.status === 'cancelado' && pedido.motivo_cancelamento ? (
          <Aviso tom="alerta" mensagem={`Cancelado: ${pedido.motivo_cancelamento}`} />
        ) : null}

        {/* --------------------------------------------------------- cliente */}
        <View style={estilos.bloco}>
          <Text style={estilos.rotuloBloco}>Cliente</Text>
          <Text style={estilos.destaque}>{pedido.cliente_nome}</Text>
          <Text style={estilos.texto}>{pedido.cliente_telefone}</Text>

          <Botao
            titulo="Falar no WhatsApp"
            variante="secundario"
            aoPressionar={() =>
              Linking.openURL(whatsappDoCliente(pedido.cliente_telefone, pedido.numero))
            }
          />
        </View>

        {/* ------------------------------------------------------ modalidade */}
        <View style={estilos.bloco}>
          <Text style={estilos.rotuloBloco}>{entrega ? 'Entrega' : 'Retirada na loja'}</Text>

          {entrega ? (
            <>
              <Text style={estilos.texto}>{pedido.endereco_entrega}</Text>
              <Text style={estilos.aviso}>
                O frete não está incluso no valor e é combinado com o cliente.
              </Text>
            </>
          ) : (
            <Text style={estilos.texto}>
              {pedido.pagamento === 'pix_online'
                ? 'Cliente escolheu pagar por Pix antes de retirar.'
                : 'Cliente paga no balcão, na hora de retirar.'}
            </Text>
          )}

          {pedido.observacao ? (
            <Text style={estilos.observacao}>Observação: {pedido.observacao}</Text>
          ) : null}
        </View>

        {/* ------------------------------------------------------------ itens */}
        <View style={estilos.bloco}>
          <Text style={estilos.rotuloBloco}>Itens</Text>
          {pedido.itens.map((item) => (
            <View style={estilos.item} key={item.id}>
              <Text style={estilos.texto}>
                {item.quantidade}× {item.nome_produto}
              </Text>
              <Text style={estilos.texto}>{moeda(Number(item.subtotal))}</Text>
            </View>
          ))}
          <View style={estilos.total}>
            <Text style={estilos.destaque}>Total dos produtos</Text>
            <Text style={estilos.valorTotal}>{moeda(Number(pedido.subtotal))}</Text>
          </View>
        </View>

        {/* ----------------------------------------------------------- ações */}
        {!podeEscrever ? (
          <Aviso
            tom="alerta"
            mensagem={
              contaAtiva
                ? 'Somente o Gestor pode atender pedidos da loja.'
                : 'Sua conta está em modo de consulta.'
            }
          />
        ) : null}

        {pedido.status === 'aguardando_pagamento' ? (
          <View style={estilos.bloco}>
            <Text style={estilos.rotuloBloco}>Pagamento por Pix</Text>
            <Text style={estilos.texto}>
              O cliente declarou que pagou. Confira o recebimento na sua conta antes de confirmar —
              o sistema não verifica isso sozinho.
            </Text>
            <Botao
              titulo="Confirmar recebimento"
              aoPressionar={() =>
                confirmar(
                  'Confirmar pagamento',
                  `Você confirma que recebeu ${moeda(Number(pedido.subtotal))} referente ao pedido #${pedido.numero}?`,
                  () => void executar(() => confirmarPagamento(pedido.id)),
                )
              }
              carregando={processando}
              desabilitado={!podeEscrever}
            />
          </View>
        ) : null}

        {proximo && podeEscrever ? (
          <Botao
            titulo={proximo.rotulo}
            aoPressionar={() => void executar(() => avancarStatus(pedido.id, proximo.status))}
            carregando={processando}
          />
        ) : null}

        {podeFinalizar ? (
          <Botao
            titulo="Finalizar pedido"
            aoPressionar={() =>
              confirmar(
                'Finalizar pedido',
                'O estoque será baixado e a venda entra no financeiro. Isso não pode ser desfeito por aqui.',
                () => void executar(() => finalizarPedido(pedido.id)),
              )
            }
            carregando={processando}
          />
        ) : null}

        {!encerrado && podeEscrever ? (
          <Botao
            titulo="Cancelar pedido"
            variante="texto"
            aoPressionar={() =>
              confirmar(
                'Cancelar pedido',
                'As unidades reservadas voltam para o estoque disponível.',
                () => void executar(() => cancelarPedido(pedido.id, 'Cancelado pela loja')),
              )
            }
          />
        ) : null}

        {pedido.status === 'finalizado' ? (
          <Aviso
            tom="sucesso"
            mensagem="Pedido finalizado. A venda já está no seu financeiro e o estoque foi baixado."
          />
        ) : null}

        <Botao titulo="Voltar" variante="texto" aoPressionar={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, gap: tema.espacamento.md },
  numero: { ...tema.tipografia.h1, color: tema.cores.texto },
  status: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
  bloco: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    gap: tema.espacamento.xs,
    ...tema.elevacao.card,
  },
  rotuloBloco: { ...tema.tipografia.rotulo, color: tema.cores.textoSuave },
  destaque: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  texto: { ...tema.tipografia.corpo, color: tema.cores.texto },
  observacao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  aviso: { ...tema.tipografia.legenda, color: tema.cores.alerta },
  item: { flexDirection: 'row', justifyContent: 'space-between', gap: tema.espacamento.md },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: tema.cores.bordaSuave,
    marginTop: tema.espacamento.xs,
    paddingTop: tema.espacamento.sm,
  },
  valorTotal: { ...tema.tipografia.numero, color: tema.cores.primaria },
});
