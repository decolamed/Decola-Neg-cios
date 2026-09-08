/**
 * Detalhes da Venda — Seções 7.1 e 8.5.
 *
 * "Com permissão `cancelar_venda`: opção de cancelar diretamente; sem a
 * permissão: opção de solicitar cancelamento ao Gestor."
 *
 * O cancelamento é sempre INTEGRAL (não há cancelamento parcial na V1) e sem
 * prazo limite. A venda nunca é apagada: fica marcada como cancelada e
 * continua no histórico.
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Badge } from '@/componentes/BadgeStatus';
import { Icone } from '@/componentes/Icone';
import { voltar } from '@/componentes/Cabecalho';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  buscarVenda,
  cancelarVenda,
  solicitacaoPendenteDaVenda,
  solicitarCancelamento,
  type VendaDetalhada,
} from '@/dados/vendas';
import { moeda } from '@/lib/formato';
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';

const ROTULO_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao: 'Cartão',
  outros: 'Outros',
};

/** Ícone da forma de pagamento — aparência apenas. */
const ICONE_PAGAMENTO: Record<string, 'dinheiro' | 'pix' | 'cartao' | 'outros'> = {
  dinheiro: 'dinheiro',
  pix: 'pix',
  cartao: 'cartao',
  outros: 'outros',
};

export default function DetalhesDaVenda() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { temPermissao, podeEscrever } = useSessao();

  const [venda, setVenda] = useState<VendaDetalhada | null>(null);
  const [temSolicitacaoPendente, setTemSolicitacaoPendente] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  const [painelAberto, setPainelAberto] = useState(false);
  const [motivo, setMotivo] = useState('');

  const carregar = useCallback(async () => {
    if (!id) return;
    try {
      const [encontrada, pendente] = await Promise.all([
        buscarVenda(id),
        solicitacaoPendenteDaVenda(id),
      ]);
      setVenda(encontrada);
      setTemSolicitacaoPendente(pendente);
      setErro(encontrada ? null : 'Venda não encontrada.');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar a venda.'));
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const podeCancelarDireto = temPermissao('cancelar_venda') && podeEscrever;

  const confirmarCancelamento = useCallback(() => {
    if (!venda) return;

    Dialogo.alert(
      'Cancelar venda',
      `A venda de ${moeda(venda.total)} será cancelada.\n\n` +
        'Os produtos voltam ao estoque e um lançamento de estorno é gerado no financeiro. ' +
        'A venda permanece no histórico, marcada como cancelada.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Cancelar venda',
          style: 'destructive',
          onPress: async () => {
            setProcessando(true);
            setMensagem(null);
            try {
              await cancelarVenda(venda.id, motivo || null);
              setMotivo('');
              setPainelAberto(false);
              await carregar();
              setSucesso('Venda cancelada. Estoque e financeiro foram revertidos.');
            } catch (e) {
              setMensagem(textoDoErro(e, 'Não foi possível cancelar a venda.'));
            } finally {
              setProcessando(false);
            }
          },
        },
      ],
    );
  }, [venda, motivo, carregar]);

  const enviarSolicitacao = useCallback(async () => {
    if (!venda) return;
    setProcessando(true);
    setMensagem(null);
    try {
      await solicitarCancelamento(venda.id, motivo || null);
      setMotivo('');
      setPainelAberto(false);
      await carregar();
      setSucesso('Solicitação enviada. O Gestor vai avaliar o cancelamento.');
    } catch (e) {
      setMensagem(textoDoErro(e, 'Não foi possível enviar a solicitação.'));
    } finally {
      setProcessando(false);
    }
  }, [venda, motivo, carregar]);

  if (carregando) return <TelaCarregando />;
  if (erro || !venda) {
    return <TelaMensagem mensagem={erro ?? 'Venda não encontrada.'} aoTentarNovamente={carregar} />;
  }

  const cancelada = venda.status === 'cancelada';

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <View style={estilos.cabecalho}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.rotuloTotal}>Total da venda</Text>
            <Text style={[estilos.titulo, cancelada && estilos.tituloCancelado]}>
              {moeda(venda.total)}
            </Text>
            <Text style={estilos.subtitulo}>
              {new Date(venda.criado_em).toLocaleString('pt-BR')}
            </Text>
          </View>

          <Icone
            nome={ICONE_PAGAMENTO[venda.forma_pagamento] ?? 'outros'}
            cor={cancelada ? tema.cores.textoSuave : tema.cores.secundaria}
            tamanho={32}
          />
        </View>

        {cancelada ? (
          <Aviso
            tom="erro"
            mensagem={
              `Venda cancelada em ${new Date(venda.cancelada_em!).toLocaleString('pt-BR')}` +
              (venda.cancelada_por_nome ? ` por ${venda.cancelada_por_nome}.` : '.')
            }
          />
        ) : null}

        {sucesso ? <Aviso tom="sucesso" mensagem={sucesso} /> : null}
        {mensagem ? <Aviso mensagem={mensagem} /> : null}

        {temSolicitacaoPendente && !cancelada ? (
          <Aviso
            tom="alerta"
            mensagem="Há uma solicitação de cancelamento pendente para esta venda."
          />
        ) : null}

        <View style={estilos.card}>
          <Linha rotulo="Vendedor" valor={venda.vendedor ?? 'Usuário removido'} />
          <Linha
            rotulo="Pagamento"
            valor={ROTULO_PAGAMENTO[venda.forma_pagamento] ?? venda.forma_pagamento}
          />

          <View style={estilos.linha}>
            <Text style={estilos.linhaRotulo}>Status</Text>
            <Badge
              rotulo={cancelada ? 'Cancelada' : 'Confirmada'}
              cor={cancelada ? tema.cores.negativo : tema.cores.secundaria}
            />
          </View>
        </View>

        <Text style={estilos.secao}>Itens</Text>
        <View style={estilos.card}>
          {venda.itens.map((item) => (
            <View key={item.id} style={estilos.linhaItem}>
              <Text style={estilos.itemNome} numberOfLines={1}>
                {item.quantidade}× {item.produto_nome}
              </Text>
              <Text style={estilos.itemValor}>{moeda(item.subtotal)}</Text>
            </View>
          ))}

          <View style={estilos.divisor} />

          <Linha rotulo="Subtotal" valor={moeda(venda.subtotal)} />
          {venda.desconto > 0 ? (
            <Linha
              rotulo={`Desconto${venda.desconto_tipo === 'percentual' ? ' (percentual)' : ''}`}
              valor={`- ${moeda(venda.desconto)}`}
            />
          ) : null}
          <Linha rotulo="Total" valor={moeda(venda.total)} destaque />
        </View>

        {/* Seção 8.5 — dois caminhos, conforme a permissão. */}
        {!cancelada ? (
          painelAberto ? (
            <View style={estilos.card}>
              <Text style={estilos.tituloCard}>
                {podeCancelarDireto ? 'Cancelar venda' : 'Solicitar cancelamento'}
              </Text>

              <CampoTexto
                rotulo="Motivo (opcional)"
                valor={motivo}
                aoMudar={setMotivo}
                bloqueado={processando}
                placeholder="Ex.: cliente desistiu, item trocado"
              />

              <Botao
                titulo={podeCancelarDireto ? 'Confirmar cancelamento' : 'Enviar solicitação'}
                variante={podeCancelarDireto ? 'destrutivo' : 'primario'}
                aoPressionar={podeCancelarDireto ? confirmarCancelamento : enviarSolicitacao}
                carregando={processando}
              />
              <Botao
                titulo="Voltar"
                variante="texto"
                aoPressionar={() => setPainelAberto(false)}
              />
            </View>
          ) : (
            <Botao
              titulo={podeCancelarDireto ? 'Cancelar venda' : 'Solicitar cancelamento ao Gestor'}
              variante={podeCancelarDireto ? 'destrutivo' : 'contorno'}
              aoPressionar={() => setPainelAberto(true)}
              desabilitado={!podeEscrever || temSolicitacaoPendente}
            />
          )
        ) : null}

        {!podeEscrever ? (
          <Aviso
            tom="alerta"
            mensagem="Sua conta está em modo de consulta. Não é possível cancelar vendas."
          />
        ) : null}

        <Botao titulo="Voltar às vendas" variante="texto" aoPressionar={() => voltar('/vendas')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Linha({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <View style={estilos.linha}>
      <Text style={destaque ? estilos.linhaRotuloDestaque : estilos.linhaRotulo}>{rotulo}</Text>
      <Text style={destaque ? estilos.linhaValorDestaque : estilos.linhaValor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    marginBottom: tema.espacamento.lg,
  },
  rotuloTotal: { ...tema.tipografia.rotulo, color: tema.cores.textoSuave },
  titulo: { ...tema.tipografia.numero, color: tema.cores.primaria },
  tituloCancelado: { color: tema.cores.textoSuave, textDecorationLine: 'line-through' },
  subtitulo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
  },
  secao: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  tituloCard: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tema.espacamento.xs,
    gap: tema.espacamento.sm,
  },
  linhaRotulo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  linhaValor: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  linhaRotuloDestaque: { ...tema.tipografia.h2, color: tema.cores.texto },
  linhaValorDestaque: { ...tema.tipografia.numero, color: tema.cores.primaria },
  linhaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: tema.espacamento.xs,
    gap: tema.espacamento.sm,
  },
  itemNome: { ...tema.tipografia.corpo, color: tema.cores.texto, flex: 1 },
  itemValor: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  divisor: {
    height: 1,
    backgroundColor: tema.cores.bordaSuave,
    marginVertical: tema.espacamento.sm,
  },
});
