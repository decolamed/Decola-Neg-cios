/**
 * Campo de formulário — estado de erro conforme a Seção 2.3:
 * borda vermelha e mensagem abaixo do campo, no mesmo tom.
 *
 * `senha` habilita o mostrar/ocultar exigido pela tela de Login (Seção 7.11).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import tema from '@decola/theme';

type Props = {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string | null;
  senha?: boolean;
  bloqueado?: boolean;
  placeholder?: string;
  tipoTeclado?: 'default' | 'email-address';
  autoCompletar?: 'email' | 'password' | 'name' | 'off';
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
}: Props) {
  const [oculto, setOculto] = useState(senha);

  return (
    <View style={estilos.container}>
      <Text style={estilos.rotulo}>{rotulo}</Text>

      <View
        style={[
          estilos.caixa,
          Boolean(erro) && estilos.caixaErro,
          bloqueado && { opacity: tema.estados.disabledOpacidade },
        ]}
      >
        <TextInput
          value={valor}
          onChangeText={aoMudar}
          editable={!bloqueado}
          placeholder={placeholder}
          placeholderTextColor={tema.cores.textoSuave}
          secureTextEntry={oculto}
          keyboardType={tipoTeclado}
          autoCapitalize={tipoTeclado === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={false}
          autoComplete={autoCompletar}
          style={estilos.input}
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
    ...tema.tipografia.legenda,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.xs,
  },
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tema.cores.superficie,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.md,
    paddingHorizontal: tema.espacamento.md,
    height: 48,
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
  alternar: {
    ...tema.tipografia.legenda,
    color: tema.cores.primaria,
  },
  mensagemErro: {
    ...tema.tipografia.legenda,
    color: tema.cores.erro,
    marginTop: tema.espacamento.xs,
  },
});
