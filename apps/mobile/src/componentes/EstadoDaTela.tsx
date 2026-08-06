/**
 * Estados de tela cheia — carregando, erro, vazio e sem conexão.
 *
 * As Seções 7.10 a 7.13 especificam esses quatro estados para praticamente
 * toda tela, sempre com mensagem clara e, quando aplicável, "Tentar
 * novamente". Centralizar aqui evita que uma tela esqueça um deles ou invente
 * um texto diferente.
 *
 * Sobre a marca (Splash e afins) o fundo é o amarelo da marca, com o logo em
 * azul-marinho — a mesma composição da abertura do app.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import { Botao } from './Botao';
import { Marca } from './Marca';

export function TelaCarregando({ comMarca = false }: { comMarca?: boolean }) {
  return (
    <View style={[estilos.centro, comMarca && estilos.sobreMarca]}>
      {comMarca ? <Marca escura comSimbolo tamanho="lg" /> : null}
      <ActivityIndicator
        size="large"
        color={tema.cores.primaria}
        style={{ marginTop: tema.espacamento.lg }}
      />
    </View>
  );
}

type MensagemProps = {
  mensagem: string;
  aoTentarNovamente?: () => void;
  /** Texto auxiliar abaixo da mensagem principal (ex.: contato de suporte). */
  complemento?: string;
  sobreMarca?: boolean;
};

export function TelaMensagem({
  mensagem,
  aoTentarNovamente,
  complemento,
  sobreMarca = false,
}: MensagemProps) {
  return (
    <View style={[estilos.centro, sobreMarca && estilos.sobreMarca]}>
      {sobreMarca ? <Marca escura comSimbolo tamanho="lg" /> : null}

      <Text style={estilos.mensagem}>{mensagem}</Text>

      {complemento ? <Text style={estilos.complemento}>{complemento}</Text> : null}

      {aoTentarNovamente ? (
        <Botao
          titulo="Tentar novamente"
          aoPressionar={aoTentarNovamente}
          variante={sobreMarca ? 'secundario' : 'primario'}
          estilo={{ marginTop: tema.espacamento.lg, minWidth: 220 }}
        />
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tema.espacamento.xl,
    backgroundColor: tema.cores.fundo,
  },
  sobreMarca: { backgroundColor: tema.cores.destaque },
  mensagem: {
    ...tema.tipografia.corpo,
    color: tema.cores.texto,
    textAlign: 'center',
    marginTop: tema.espacamento.lg,
  },
  complemento: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    marginTop: tema.espacamento.sm,
  },
});
