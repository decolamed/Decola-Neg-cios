/**
 * Campo de quantidade — o número que a pessoa digita é o número que vale.
 *
 * O QUE ESTAVA ERRADO. A caixa de quantidade do carrinho era controlada pelo
 * número do carrinho (`valor={String(item.quantidade)}`) e gravava a cada
 * tecla. Isso produzia quatro defeitos somados, e o relato "digito o número e
 * vai uma quantidade aleatória" é a soma deles:
 *
 *   1. O DÍGITO ERA ACRESCENTADO, não substituído. A caixa mostra "1"; quem
 *      quer vender 3 toca e digita "3", e o campo vira "13". Quem quer 25
 *      digita "2" e "5" e termina com 125.
 *
 *   2. O CAMPO VOLTAVA SOZINHO. Passar do estoque não gravava nada, então o
 *      próximo render trazia de volta o número antigo — a digitação sumia no
 *      meio, e a tecla seguinte caía em cima de um número que a pessoa não
 *      tinha escrito.
 *
 *   3. APAGAR REMOVIA O PRODUTO. Limpar a caixa para digitar outro número dava
 *      `Number('')` = 0, e o carrinho trata 0 como "tire este item". O produto
 *      desaparecia da venda enquanto a pessoa ainda estava digitando.
 *
 *   4. ABRIA O TECLADO DE LETRAS num campo que só aceita dígitos.
 *
 * COMO FICA. Enquanto o campo está em foco, quem manda é o TEXTO DIGITADO: o
 * componente não deixa o valor de fora sobrescrever o que está sendo escrito.
 * Ao focar, o conteúdo é selecionado, então digitar substitui em vez de somar —
 * que é o que qualquer pessoa espera de uma caixa de quantidade. Ao sair, o
 * campo se reconcilia com o valor que realmente valeu.
 *
 * Apagar tudo é um estado LEGÍTIMO de digitação, não um pedido para remover:
 * a caixa fica vazia, nada é gravado, e ao sair ela volta ao último número
 * válido. Remover um item continua sendo o botão "Remover" — explícito.
 */
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import tema from '@decola/theme';

type Props = {
  /** A quantidade que vale hoje. */
  valor: number;
  /** Chamada quando a pessoa escreve um número utilizável. */
  aoMudar: (quantidade: number) => void;
  /** Ajuste de layout no contexto da tela. */
  estilo?: ViewStyle;
  rotuloAcessivel?: string;
  bloqueado?: boolean;
};

export function CampoQuantidade({
  valor,
  aoMudar,
  estilo,
  rotuloAcessivel = 'Quantidade',
  bloqueado = false,
}: Props) {
  // `null` = não está sendo editado, então a caixa mostra o valor de fora.
  // Uma string = está sendo editado, e ela tem precedência sobre o valor de
  // fora. É esta distinção que impede a digitação de ser sobrescrita.
  const [digitado, setDigitado] = useState<string | null>(null);
  const campo = useRef<TextInput>(null);


  const aoDigitar = useCallback(
    (texto: string) => {
      const somenteDigitos = texto.replace(/[^0-9]/g, '');
      setDigitado(somenteDigitos);

      // Vazio é passo de digitação, não zero: não grava e não remove nada.
      if (somenteDigitos === '') return;

      const numero = Number(somenteDigitos);
      // Zero também não grava — no carrinho ele significaria remover o produto,
      // e ninguém remove um item digitando.
      if (Number.isFinite(numero) && numero > 0) aoMudar(numero);
    },
    [aoMudar],
  );

  return (
    <View style={[estilos.caixa, bloqueado && { opacity: tema.estados.disabledOpacidade }, estilo]}>
      <TextInput
        ref={campo}
        value={digitado ?? String(valor)}
        onChangeText={aoDigitar}
        editable={!bloqueado}
        keyboardType="number-pad"
        inputMode="numeric"
        /**
         * A CAIXA ESVAZIA AO SER TOCADA, e o número atual vira a dica em cinza.
         *
         * Primeiro tentei selecionar o conteúdo ao focar (`selectTextOnFocus`,
         * e depois `select()` a cada toque). Funcionava no primeiro toque e
         * falhava no segundo: quem tocava de novo numa caixa JÁ em foco não
         * disparava foco nenhum, o cursor só se reposicionava, e a tecla
         * seguinte voltava a somar ao que estava lá. Medido no navegador: com
         * "3" na caixa, digitar "25" dava 325 — o mesmo defeito de antes,
         * mudado de lugar.
         *
         * Esvaziar não depende de a seleção pegar: não há o que concatenar.
         * Deixa de existir a classe inteira do problema, em vez de cobrir mais
         * um caso dela. O número não se perde — ele fica na dica, no subtotal
         * ao lado e nos botões − e +.
         */
        placeholder={String(valor)}
        placeholderTextColor={tema.cores.textoSuave}
        onFocus={() => setDigitado('')}
        // Ao sair, a caixa volta a espelhar o que realmente valeu — inclusive
        // quando a digitação foi recusada (estoque insuficiente) ou ficou vazia.
        onBlur={() => setDigitado(null)}
        returnKeyType="done"
        onSubmitEditing={() => campo.current?.blur()}
        autoCorrect={false}
        style={estilos.entrada}
        accessibilityLabel={rotuloAcessivel}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  caixa: {
    justifyContent: 'center',
    backgroundColor: tema.cores.fundoCampo,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.md,
    paddingHorizontal: tema.espacamento.sm,
    height: tema.alturas.controle,
  },
  entrada: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.texto,
    textAlign: 'center',
    paddingVertical: 0,
  },
});
