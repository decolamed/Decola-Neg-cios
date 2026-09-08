/**
 * Cobrança Pix — QR Code com o valor dentro, e o código para colar.
 *
 * POR QUE UM COMPONENTE. O Pix aparece em mais de um lugar (a venda no balcão
 * e o pedido da loja virtual), e um BR Code errado é o pior tipo de erro que
 * este aplicativo pode cometer: ele abre bonito no banco do cliente, parece
 * certo, e o dinheiro não chega em ninguém. Isso não pode ter duas
 * implementações que podem divergir. A montagem do payload é a mesma do site,
 * em `@decola/pix`.
 *
 * O "copia e cola" não é acessório. Nem todo cliente consegue apontar a
 * câmera: muitos pagam pelo mesmo celular em que estão vendo a tela, e nesses
 * o caminho é copiar o código e colar no banco. E o que se copia é o CÓDIGO
 * COMPLETO — que já leva o valor —, nunca a chave crua, porque copiar a chave
 * devolve ao cliente a tarefa de digitar o valor à mão, que é exatamente onde
 * nasce o pagamento de R$ 3,29 numa venda de R$ 32,90.
 *
 * Sem chave válida NÃO existe "gerar mesmo assim". A tela diz o que falta.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import tema from '@decola/theme';
import { gerarPayloadPix, normalizarChavePix } from '@decola/pix';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { copiar } from '@/lib/areaDeTransferencia';

type Props = {
  /** A chave como está cadastrada em `empresas.chave_pix`. */
  chave: string | null;
  valor: number;
  nomeRecebedor: string;
  descricao?: string;
  /** Aparece abaixo do QR: o que a pessoa da loja deve fazer em seguida. */
  nota?: string;
};

export function CobrancaPix({ chave, valor, nomeRecebedor, descricao, nota }: Props) {
  const [copiado, setCopiado] = useState<'sim' | 'nao' | null>(null);

  const resultado = useMemo(() => {
    if (!chave) return { erro: 'sem_chave' as const };
    try {
      const normalizada = normalizarChavePix(chave);
      if (!normalizada) return { erro: 'chave_invalida' as const };
      return {
        payload: gerarPayloadPix({
          chave: normalizada.valor,
          valor,
          nomeRecebedor,
          descricao,
        }),
      };
    } catch {
      return { erro: 'chave_invalida' as const };
    }
  }, [chave, valor, nomeRecebedor, descricao]);

  if ('erro' in resultado) {
    return (
      <Aviso
        tom="alerta"
        mensagem={
          resultado.erro === 'sem_chave'
            ? 'Esta empresa ainda não cadastrou uma chave Pix. Sem ela o QR Code geraria uma ' +
              'cobrança que ninguém recebe. Cadastre em Configurações → Dados da empresa.'
            : 'A chave Pix cadastrada não está em um formato válido, então o QR Code geraria uma ' +
              'cobrança que ninguém recebe. Corrija a chave em Configurações → Dados da empresa.'
        }
      />
    );
  }

  return (
    <View style={estilos.bloco}>
      <View style={estilos.moldura}>
        <QRCode value={resultado.payload} size={200} />
      </View>

      <Text style={estilos.nota}>
        {nota ?? 'Mostre o QR Code ao cliente. O valor já vem preenchido — ele não digita nada.'}
      </Text>

      <Botao
        titulo={copiado === 'sim' ? 'Código copiado' : 'Copiar código Pix'}
        variante="contorno"
        aoPressionar={() => {
          void copiar(resultado.payload).then((deu) => {
            setCopiado(deu ? 'sim' : 'nao');
            if (deu) setTimeout(() => setCopiado(null), 2500);
          });
        }}
      />

      {copiado === 'nao' ? (
        <Text style={estilos.nota}>
          Este aparelho não deixou copiar. O código está abaixo — segure para selecionar.
        </Text>
      ) : null}

      {/* Sempre visível e selecionável: é a saída quando copiar falha e quando
          o cliente prefere colar no banco pelo próprio celular. */}
      <Text style={estilos.codigo} selectable>
        {resultado.payload}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { gap: tema.espacamento.sm },
  moldura: {
    alignItems: 'center',
    paddingVertical: tema.espacamento.md,
    backgroundColor: '#FFFFFF',
    borderRadius: tema.raio.md,
  },
  nota: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  codigo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    backgroundColor: tema.cores.fundoCampo,
    borderRadius: tema.raio.sm,
    padding: tema.espacamento.sm,
  },
});
