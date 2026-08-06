/**
 * Marca — logo e tagline (Seções 1.1 e 7.10).
 *
 * Usa os arquivos oficiais da marca em `assets/marca/`:
 *   simbolo.png ............... símbolo isolado (maleta), para ícone e avatar
 *   logo-nome-*.png ........... logo nome "DECOLA NEGÓCIOS", claro e escuro
 *   by-decola-*.png ........... assinatura "BY DECOLA", claro e escuro
 *
 * `escura` mantém o significado original: logo em azul-marinho, para fundos
 * claros. Sem `escura`, o logo é branco, para fundos azul-marinho.
 * Sem nenhum elemento interativo, conforme a Seção 7.10.
 */
import { Image, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';

const LOGO_CLARO = require('../../assets/marca/logo-nome-claro.png');
const LOGO_ESCURO = require('../../assets/marca/logo-nome-escuro.png');
const ASSINATURA_CLARA = require('../../assets/marca/by-decola-claro.png');
const ASSINATURA_ESCURA = require('../../assets/marca/by-decola-escuro.png');
export const SIMBOLO_DA_MARCA = require('../../assets/marca/simbolo.png');

type Props = {
  comTagline?: boolean;
  escura?: boolean;
  /** Símbolo (maleta) acima do logo nome — usado na Splash. */
  comSimbolo?: boolean;
  /** Assinatura "by Decola" abaixo da marca. */
  comAssinatura?: boolean;
  tamanho?: 'md' | 'lg';
};

export function Marca({
  comTagline = true,
  escura = false,
  comSimbolo = false,
  comAssinatura = false,
  tamanho = 'md',
}: Props) {
  const larguraLogo = tamanho === 'lg' ? 240 : 190;

  return (
    <View style={estilos.container}>
      {comSimbolo ? (
        <Image
          source={SIMBOLO_DA_MARCA}
          style={[estilos.simbolo, tamanho === 'lg' && estilos.simboloGrande]}
          resizeMode="contain"
          accessible={false}
        />
      ) : null}

      <Image
        source={escura ? LOGO_ESCURO : LOGO_CLARO}
        style={{ width: larguraLogo, height: larguraLogo * 0.313 }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Decola Negócios"
      />

      {comTagline ? (
        <Text style={estilos.tagline}>
          <Text style={{ color: escura ? tema.cores.primaria : tema.cores.textoInverso }}>
            Organize.{' '}
          </Text>
          <Text style={{ color: tema.cores.destrutiva }}>Venda. </Text>
          <Text style={{ color: escura ? tema.cores.primaria : tema.cores.secundaria }}>
            Cresça.
          </Text>
        </Text>
      ) : null}

      {comAssinatura ? (
        <Image
          source={escura ? ASSINATURA_ESCURA : ASSINATURA_CLARA}
          style={estilos.assinatura}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="by Decola"
        />
      ) : null}
    </View>
  );
}

/** Assinatura "by Decola" isolada — rodapé de telas e tela Sobre. */
export function AssinaturaDecola({ escura = true }: { escura?: boolean }) {
  return (
    <Image
      source={escura ? ASSINATURA_ESCURA : ASSINATURA_CLARA}
      style={estilos.assinaturaRodape}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="by Decola"
    />
  );
}

const estilos = StyleSheet.create({
  container: { alignItems: 'center' },
  simbolo: { width: 96, height: 71, marginBottom: tema.espacamento.md },
  simboloGrande: { width: 148, height: 109, marginBottom: tema.espacamento.lg },
  tagline: {
    ...tema.tipografia.h2,
    marginTop: tema.espacamento.md,
    textAlign: 'center',
  },
  assinatura: {
    width: 108,
    height: 19,
    marginTop: tema.espacamento.xl,
    opacity: 0.9,
  },
  /* Sobre o amarelo da marca, 0.55 lavava o azul-marinho: 0.75 mantém a
     assinatura discreta sem perder legibilidade. */
  assinaturaRodape: { width: 88, height: 15, alignSelf: 'center', opacity: 0.75 },
});
