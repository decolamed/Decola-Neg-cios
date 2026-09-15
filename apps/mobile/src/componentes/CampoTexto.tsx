/**
 * Campo de formulário — estado de erro conforme a Seção 2.3:
 * borda vermelha e mensagem abaixo do campo, no mesmo tom.
 *
 * `senha` habilita o mostrar/ocultar exigido pela tela de Login (Seção 7.11).
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import tema from '@decola/theme';

type Props = {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string | null;
  senha?: boolean;
  bloqueado?: boolean;
  placeholder?: string;
  /**
   * `number-pad` para campos que só recebem dígitos — CPF/CNPJ, telefone.
   * Num celular, oferecer o teclado alfabético para digitar um documento é
   * pedir que a pessoa troque de teclado antes de cada número.
   */
  tipoTeclado?: 'default' | 'email-address' | 'number-pad';
  autoCompletar?: 'email' | 'password' | 'name' | 'off';
  /** Ajuste de layout do campo no contexto da tela (largura, margem). */
  estilo?: ViewStyle;
  /** Texto centralizado — usado em campos curtos, como quantidade. */
  centralizado?: boolean;
  /**
   * Muda de valor e o campo recebe o foco.
   *
   * Um NÚMERO, e não um booleano: no cadastro rápido o foco volta para o mesmo
   * campo depois de cada produto salvo, e um booleano que já é `true` não tem
   * como pedir de novo. Contar é o que deixa o pedido acontecer toda vez.
   */
  focarQuando?: number;
  /**
   * O valor foi dado por encerrado.
   *
   * Dispara na tecla de confirmação do teclado E AO SAIR DO CAMPO. O segundo
   * caso não é detalhe: quase ninguém aperta "ok" — digita o código e toca no
   * campo seguinte. Sem o `blur`, quem não apertasse a tecla ficaria sem a
   * busca e concluiria que ela não funciona.
   */
  aoConfirmar?: () => void;
};

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  erro,
  senha = false,
  bloqueado = false,
  placeholder,
  tipoTeclado = 'default',
  autoCompletar = 'off',
  estilo,
  centralizado = false,
  focarQuando,
  aoConfirmar,
}: Props) {
  const campo = useRef<TextInput>(null);

  useEffect(() => {
    if (focarQuando === undefined) return;
    // Um quadro de espera: em cadastro rápido o formulário é limpo no mesmo
    // instante, e pedir foco a um campo que está remontando não pega.
    const relogio = setTimeout(() => campo.current?.focus(), 60);
    return () => clearTimeout(relogio);
  }, [focarQuando]);

  const [oculto, setOculto] = useState(senha);

  return (
    <View style={[estilos.container, estilo]}>
      {/* Sem rótulo, o espaço dele também não existe — campos embutidos numa
          linha de controles ficam alinhados com os botões ao lado. */}
      {rotulo ? <Text style={estilos.rotulo}>{rotulo}</Text> : null}

      <View
        style={[
          estilos.caixa,
          Boolean(erro) && estilos.caixaErro,
          bloqueado && { opacity: tema.estados.disabledOpacidade },
        ]}
      >
        <TextInput
          ref={campo}
          value={valor}
          onChangeText={aoMudar}
          returnKeyType={aoConfirmar ? 'done' : undefined}
          onSubmitEditing={aoConfirmar}
          onBlur={aoConfirmar}
          editable={!bloqueado}
          placeholder={placeholder}
          placeholderTextColor={tema.cores.textoSuave}
          secureTextEntry={oculto}
          keyboardType={tipoTeclado}
          autoCapitalize={tipoTeclado === 'default' ? 'sentences' : 'none'}
          autoCorrect={false}
          autoComplete={autoCompletar}
          style={[estilos.input, centralizado && estilos.inputCentralizado]}
          accessibilityLabel={rotulo}
        />

        {senha ? (
          <Pressable
            onPress={() => setOculto((atual) => !atual)}
            disabled={bloqueado}
            accessibilityRole="button"
            accessibilityLabel={oculto ? 'Mostrar senha' : 'Ocultar senha'}
            hitSlop={8}
          >
            <Text style={estilos.alternar}>{oculto ? 'Mostrar' : 'Ocultar'}</Text>
          </Pressable>
        ) : null}
      </View>

      {erro ? <Text style={estilos.mensagemErro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { marginBottom: tema.espacamento.md },
  rotulo: {
    ...tema.tipografia.rotulo,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.sm,
  },
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.fundoCampo,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.md,
    paddingHorizontal: tema.espacamento.md,
    height: tema.alturas.controle,
  },
  caixaErro: {
    borderColor: tema.cores.bordaErro,
    borderWidth: tema.estados.larguraBordaErro,
  },
  input: {
    flex: 1,
    ...tema.tipografia.corpo,
    color: tema.cores.texto,
    paddingVertical: 0,
  },
  inputCentralizado: { ...tema.tipografia.corpoDestacado, textAlign: 'center' },
  alternar: {
    ...tema.tipografia.rotulo,
    color: tema.cores.secundaria,
  },
  mensagemErro: {
    ...tema.tipografia.legenda,
    color: tema.cores.erro,
    marginTop: tema.espacamento.xs,
  },
});
