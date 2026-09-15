/**
 * Cobrança Pix avulsa — um QR Code sem venda por trás.
 *
 * POR QUE ELA EXISTE. Até aqui só dava para gerar um Pix DENTRO de uma venda:
 * era preciso montar um carrinho, chegar em "Finalizar" e escolher Pix. Mas
 * parte do que um balcão recebe não é uma venda de produto — é um serviço, um
 * conserto, um acerto de conta, uma entrega combinada. Quem precisava disso
 * abria o aplicativo do banco no outro celular, ou pedia ao cliente que
 * digitasse o valor à mão na chave copiada. As duas saídas custam tempo com o
 * cliente esperando, e a segunda é onde nasce o pagamento de R$ 3,29 numa
 * cobrança de R$ 32,90.
 *
 * O QUE ELA NÃO FAZ, e é de propósito: não registra venda, não mexe em estoque
 * e não gera lançamento financeiro. É uma ferramenta de cobrança, não um
 * atalho para vender sem passar pelo caixa — o valor recebido aqui entra no
 * financeiro pelo caminho normal, como lançamento manual, se for o caso. Se ela
 * criasse movimentação sozinha, o mesmo dinheiro poderia ser contado duas
 * vezes, uma pelo QR e outra pela venda registrada depois.
 *
 * O QR em si é o mesmo componente da venda e do pedido da loja (`CobrancaPix`),
 * que monta o BR Code em `@decola/pix`. Um payload errado é o pior erro que
 * este aplicativo pode cometer: abre bonito no banco do cliente, parece certo,
 * e o dinheiro não chega em ninguém. Por isso essa montagem não ganha uma
 * segunda implementação aqui.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Cabecalho } from '@/componentes/Cabecalho';
import { CampoTexto } from '@/componentes/CampoTexto';
import { CobrancaPix } from '@/componentes/CobrancaPix';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { precoParaNumero } from '@/componentes/FormularioDeProduto';
import { useSessao } from '@/contexto/SessaoContexto';
import { moeda } from '@/lib/formato';

/**
 * Teto de sanidade para o valor digitado.
 *
 * Não é uma regra de negócio — é proteção contra o dedo escorregando. Um zero a
 * mais num campo de dinheiro passa despercebido na tela e vira um QR Code que o
 * cliente pode simplesmente pagar.
 */
const VALOR_MAXIMO = 1_000_000;

export default function CobrancaPixAvulsa() {
  const { carregando, conta } = useSessao();

  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  /** O valor já conferido. Enquanto for nulo, ninguém vê QR nenhum. */
  const [gerado, setGerado] = useState<{ valor: number; descricao: string } | null>(null);

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar sua empresa." />;

  const gerar = () => {
    const numero = precoParaNumero(valor);

    if (numero === null || numero <= 0) {
      setErro('Informe o valor da cobrança. Exemplo: 32,90');
      return;
    }
    if (numero > VALOR_MAXIMO) {
      setErro(`Valor muito alto. O limite desta tela é ${moeda(VALOR_MAXIMO)}.`);
      return;
    }

    setErro(null);
    setGerado({ valor: numero, descricao: descricao.trim() });
  };

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <Cabecalho />

      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Cobrança Pix</Text>
        <Text style={estilos.subtitulo}>
          Gere um QR Code com o valor já dentro, sem precisar registrar uma venda.
        </Text>

        {/**
          * ENQUANTO NÃO HÁ QR, só o formulário; depois, só o QR.
          *
          * Deixar os dois na tela ao mesmo tempo criaria a pior confusão
          * possível num balcão: o campo mostrando um valor e o QR carregando
          * outro, com o cliente já com a câmera apontada. Para mudar o valor,
          * volta-se ao formulário por um botão explícito.
          */}
        {gerado === null ? (
          <View style={estilos.card}>
            <CampoTexto
              rotulo="Valor da cobrança (R$)"
              valor={valor}
              aoMudar={(v) => {
                setValor(v);
                if (erro) setErro(null);
              }}
              erro={erro}
              tipoTeclado="number-pad"
              placeholder="0,00"
            />

            <CampoTexto
              rotulo="Do que se trata (opcional)"
              valor={descricao}
              aoMudar={setDescricao}
              placeholder="Conserto de tela"
            />
            <Text style={estilos.ajuda}>
              Aparece para o cliente no aplicativo do banco. Ajuda quem paga a reconhecer a
              cobrança depois.
            </Text>

            <Botao titulo="Gerar QR Code" aoPressionar={gerar} />
          </View>
        ) : (
          <View style={estilos.card}>
            <Text style={estilos.valorGerado}>{moeda(gerado.valor)}</Text>
            {gerado.descricao ? (
              <Text style={estilos.descricaoGerada}>{gerado.descricao}</Text>
            ) : null}

            <CobrancaPix
              chave={conta.empresa.chave_pix}
              valor={gerado.valor}
              nomeRecebedor={conta.empresa.nome}
              descricao={gerado.descricao || undefined}
              nota={
                `Cobrança de ${moeda(gerado.valor)} — o valor já vai dentro do código, ` +
                'o cliente não digita nada. O pagamento não é confirmado aqui: confira o ' +
                'recebimento no seu banco.'
              }
            />

            {/* A mesma saída que a tela de venda oferece: sem chave, o QR não
                existe, e quem pode resolver isso é o Gestor. */}
            {!conta.empresa.chave_pix && conta.ehGestor ? (
              <Botao
                titulo="Cadastrar chave Pix"
                variante="secundario"
                aoPressionar={() => router.push('/configuracoes/empresa')}
              />
            ) : null}

            <Botao
              titulo="Gerar outra cobrança"
              variante="contorno"
              aoPressionar={() => {
                setGerado(null);
                setValor('');
                setDescricao('');
              }}
            />
          </View>
        )}

        {/* Dito ANTES de a pessoa precisar descobrir sozinha: esta tela não
            movimenta nada no sistema. */}
        <Aviso
          tom="alerta"
          mensagem={
            'Esta cobrança não registra venda nem movimenta o estoque. Para vender produtos e ' +
            'dar baixa no estoque, use "Nova venda".'
          }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  subtitulo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    marginBottom: tema.espacamento.md,
    gap: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  ajuda: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: -tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
  valorGerado: {
    ...tema.tipografia.numero,
    color: tema.cores.primaria,
    textAlign: 'center',
  },
  descricaoGerada: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: -tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
});
