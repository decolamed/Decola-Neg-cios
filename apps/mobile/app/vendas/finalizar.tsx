/**
 * Tela Finalizar Venda — Seção 7.4.
 *
 * Forma de pagamento (Pix, Dinheiro, Cartão, Outros), geração opcional do QR
 * Code Pix e o botão "Confirmar venda", que finaliza a operação: retira do
 * estoque, registra a movimentação financeira e salva a venda como confirmada,
 * com o usuário responsável.
 */
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone, type NomeDeIcone } from '@/componentes/Icone';
import { useCarrinho } from '@/contexto/CarrinhoContexto';
import { useSessao } from '@/contexto/SessaoContexto';
import { registrarVenda, type FormaPagamento } from '@/dados/vendas';
import { moeda } from '@/lib/formato';
import { gerarPayloadPix } from '@/lib/pix';

const FORMAS: { valor: FormaPagamento; rotulo: string; icone: NomeDeIcone }[] = [
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: 'dinheiro' },
  { valor: 'pix', rotulo: 'Pix', icone: 'pix' },
  { valor: 'cartao', rotulo: 'Cartão', icone: 'cartao' },
  { valor: 'outros', rotulo: 'Outros', icone: 'outros' },
];

export default function FinalizarVenda() {
  const { conta, podeEscrever } = useSessao();
  const carrinho = useCarrinho();

  const [forma, setForma] = useState<FormaPagamento>('dinheiro');
  const [pixGerado, setPixGerado] = useState<string | null>(null);
  const [erroPix, setErroPix] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const gerarPix = useCallback(() => {
    setErroPix(null);
    if (!conta) return;

    try {
      setPixGerado(
        gerarPayloadPix({
          chave: conta.empresa.chave_pix ?? '',
          valor: carrinho.total,
          nomeRecebedor: conta.empresa.nome,
          descricao: `Venda ${new Date().toLocaleDateString('pt-BR')}`,
        }),
      );
    } catch (e) {
      setPixGerado(null);
      setErroPix(e instanceof Error ? e.message : 'Não foi possível gerar o QR Code Pix.');
    }
  }, [conta, carrinho.total]);

  const confirmar = useCallback(async () => {
    setMensagem(null);
    setConfirmando(true);
    try {
      const resultado = await registrarVenda({
        itens: carrinho.itens.map((item) => ({
          produtoId: item.produtoId,
          quantidade: item.quantidade,
        })),
        formaPagamento: forma,
        descontoTipo: carrinho.descontoTipo,
        descontoValor: carrinho.descontoValor,
      });

      carrinho.limpar();
      router.replace(`/vendas/${resultado.venda_id}`);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Não foi possível registrar a venda.');
    } finally {
      setConfirmando(false);
    }
  }, [carrinho, forma]);

  const resumo = useMemo(
    () =>
      carrinho.itens.map((item) => (
        <View key={item.produtoId} style={estilos.linhaItem}>
          <Text style={estilos.itemNome} numberOfLines={1}>
            {item.quantidade}× {item.nome}
          </Text>
          <Text style={estilos.itemValor}>{moeda(item.precoUnitario * item.quantidade)}</Text>
        </View>
      )),
    [carrinho.itens],
  );

  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar sua conta." />;

  if (carrinho.itens.length === 0) {
    return (
      <TelaMensagem
        mensagem="Não há itens nesta venda."
        aoTentarNovamente={() => router.replace('/vendas/nova')}
      />
    );
  }

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Finalizar venda</Text>

        {mensagem ? <Aviso mensagem={mensagem} /> : null}

        {!podeEscrever ? (
          <Aviso
            tom="erro"
            mensagem="Sua conta está em modo de consulta. Não é possível registrar vendas."
          />
        ) : null}

        <View style={estilos.card}>
          {resumo}

          <View style={estilos.divisor} />

          <View style={estilos.linhaItem}>
            <Text style={estilos.rotulo}>Subtotal</Text>
            <Text style={estilos.itemValor}>{moeda(carrinho.subtotal)}</Text>
          </View>

          {carrinho.desconto > 0 ? (
            <View style={estilos.linhaItem}>
              <Text style={estilos.rotulo}>Desconto</Text>
              <Text style={estilos.desconto}>- {moeda(carrinho.desconto)}</Text>
            </View>
          ) : null}

          <View style={estilos.linhaItem}>
            <Text style={estilos.rotuloTotal}>Total</Text>
            <Text style={estilos.total}>{moeda(carrinho.total)}</Text>
          </View>
        </View>

        {/* Forma de pagamento — mesmas quatro opções da Seção 7.4, com ícone
            para reconhecimento imediato no balcão. */}
        <Text style={estilos.rotuloSecao}>Forma de pagamento</Text>
        <View style={estilos.formas}>
          {FORMAS.map((f) => {
            const ativa = forma === f.valor;
            return (
              <Pressable
                key={f.valor}
                onPress={() => {
                  setForma(f.valor);
                  setPixGerado(null);
                  setErroPix(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: ativa }}
                style={({ pressed }) => [
                  estilos.formaCartao,
                  ativa && estilos.formaAtiva,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Icone
                  nome={f.icone}
                  cor={ativa ? tema.cores.primaria : tema.cores.textoSuave}
                  tamanho={24}
                />
                <Text style={[estilos.formaRotulo, ativa && estilos.formaRotuloAtivo]}>
                  {f.rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Seção 7.4 — geração de cobrança Pix. NÃO há confirmação automática:
            o QR Code é só para o cliente pagar; quem confirma a venda é o
            usuário, no botão abaixo. */}
        {forma === 'pix' ? (
          <View style={estilos.card}>
            <Text style={estilos.tituloCard}>Cobrança Pix</Text>

            {erroPix ? <Aviso mensagem={erroPix} tom="alerta" /> : null}

            {pixGerado ? (
              <>
                <View style={estilos.qrcode}>
                  <QRCode value={pixGerado} size={200} />
                </View>
                <Text style={estilos.notaPix}>
                  Mostre o QR Code ao cliente. O pagamento não é confirmado automaticamente —
                  confira o recebimento e toque em "Confirmar venda".
                </Text>
                <Botao
                  titulo="Gerar novamente"
                  variante="texto"
                  aoPressionar={() => setPixGerado(null)}
                />
              </>
            ) : (
              <Botao titulo="Gerar QR Code Pix" variante="secundario" aoPressionar={gerarPix} />
            )}
          </View>
        ) : null}

        <Botao
          titulo="Confirmar venda"
          aoPressionar={confirmar}
          carregando={confirmando}
          desabilitado={!podeEscrever}
        />

        <Botao titulo="Voltar ao carrinho" variante="texto" aoPressionar={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  tituloCard: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.sm },
  rotuloSecao: {
    ...tema.tipografia.rotulo,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.sm,
  },
  formas: {
    flexDirection: 'row',
    gap: tema.espacamento.sm,
    marginBottom: tema.espacamento.md,
  },
  formaCartao: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tema.espacamento.xs,
    paddingVertical: tema.espacamento.md,
    borderRadius: tema.raio.md,
    borderWidth: 1,
    borderColor: tema.cores.bordaSuave,
    backgroundColor: tema.cores.fundoCard,
  },
  formaAtiva: {
    borderColor: tema.cores.secundaria,
    borderWidth: 1.5,
    backgroundColor: tema.tons.secundaria,
  },
  formaRotulo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  formaRotuloAtivo: { ...tema.tipografia.rotulo, color: tema.cores.primaria },
  linhaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tema.espacamento.xs,
    gap: tema.espacamento.sm,
  },
  itemNome: { ...tema.tipografia.corpo, color: tema.cores.texto, flex: 1 },
  itemValor: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  divisor: {
    height: 1,
    backgroundColor: tema.cores.borda,
    marginVertical: tema.espacamento.sm,
  },
  rotulo: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  rotuloTotal: { ...tema.tipografia.h2, color: tema.cores.texto },
  desconto: { ...tema.tipografia.corpoDestacado, color: tema.cores.negativo },
  total: { ...tema.tipografia.h2, color: tema.cores.primaria },
  qrcode: { alignItems: 'center', paddingVertical: tema.espacamento.md },
  notaPix: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginBottom: tema.espacamento.sm,
  },
});
