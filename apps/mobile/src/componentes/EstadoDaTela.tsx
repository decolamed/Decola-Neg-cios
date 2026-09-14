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
      {comMarca ? <Marca fundo="marca" comSimbolo tamanho="lg" /> : null}
      {/* Sobre o amarelo da marca o giro precisa de cor FIXA, pelo mesmo motivo
          da frase: `cores.primaria` acompanha o tema e clareava justamente onde
          o fundo não clareia nunca. Nas demais telas ele segue o tema, que é o
          certo — ali o fundo acompanha junto. */}
      <ActivityIndicator
        size="large"
        color={comMarca ? tema.paleta.azulMarinho : tema.cores.primaria}
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
      {sobreMarca ? <Marca fundo="marca" comSimbolo tamanho="lg" /> : null}

      {/* Sobre o amarelo da marca, o texto é fixo: aquele fundo não acompanha
          o tema, então nada por cima dele pode acompanhar. Fora dali, o texto
          segue o tema junto com o fundo da tela. */}
      <Text style={[estilos.mensagem, sobreMarca && estilos.sobreAmarelo]}>{mensagem}</Text>

      {complemento ? (
        <Text style={[estilos.complemento, sobreMarca && estilos.sobreAmarelo]}>
          {complemento}
        </Text>
      ) : null}

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
  /** Texto legível sobre o amarelo da marca, em qualquer tema. */
  sobreAmarelo: { color: tema.paleta.azulMarinho },
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
