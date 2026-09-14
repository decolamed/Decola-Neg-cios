/**
 * Marca — logo e tagline (Seções 1.1 e 7.10).
 *
 * Usa os arquivos oficiais da marca em `assets/marca/`:
 *   simbolo.png ............... símbolo isolado (maleta), para ícone e avatar
 *   logo-nome-*.png ........... logo nome "DECOLA NEGÓCIOS", claro e escuro
 *   by-decola-*.png ........... assinatura "BY DECOLA", claro e escuro
 *
 * O QUE ESTAVA ERRADO. A escolha da arte vinha de uma propriedade `escura`
 * fixada em cada tela — e o tema escuro tirou o chão dessa decisão, porque o
 * fundo deixou de ser sempre o mesmo. O resultado apareceu de duas formas
 * opostas ao mesmo tempo:
 *
 *   na ABERTURA, que é amarela SEMPRE, a frase "Organize. Venda. Cresça." usava
 *   `cores.primaria`, que passou a acompanhar o tema: com o aparelho no escuro
 *   ela virou azul-claro sobre amarelo, quase ilegível;
 *
 *   no LOGIN, que acompanha o tema, a arte continuava sendo a azul-marinho —
 *   sobre o fundo escuro ela sumia.
 *
 * O DEFEITO ERA A PERGUNTA, não a resposta. "Que arte usar?" não é uma escolha
 * de cada tela: é uma consequência do fundo em que a marca está. Agora a tela
 * informa o FUNDO, e a marca decide o resto:
 *
 *   'marca' ..... o amarelo da marca (abertura e carregamento). Fixo, sempre.
 *   'tela' ...... o fundo das telas, que acompanha o tema.
 *   'primaria' .. preenchimento azul-marinho.
 *
 * Sem nenhum elemento interativo, conforme a Seção 7.10.
 */
import { Image, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import { useAparenciaOpcional } from '@/contexto/AparenciaContexto';

const LOGO_CLARO = require('../../assets/marca/logo-nome-claro.png');
const LOGO_ESCURO = require('../../assets/marca/logo-nome-escuro.png');
const ASSINATURA_CLARA = require('../../assets/marca/by-decola-claro.png');
const ASSINATURA_ESCURA = require('../../assets/marca/by-decola-escuro.png');
export const SIMBOLO_DA_MARCA = require('../../assets/marca/simbolo.png');

/** Sobre que fundo a marca está sendo desenhada. */
export type FundoDaMarca = 'marca' | 'tela' | 'primaria';

/**
 * O fundo é claro? É isto, e só isto, que decide a arte.
 *
 * O amarelo da marca é claro sempre. O fundo das telas depende do tema. O
 * azul-marinho é escuro sempre.
 */
function useFundoClaro(fundo: FundoDaMarca): boolean {
  const aparencia = useAparenciaOpcional();
  if (fundo === 'marca') return true;
  if (fundo === 'primaria') return false;
  return aparencia?.emVigor !== 'escuro';
}

type Props = {
  comTagline?: boolean;
  /** Sobre que fundo a marca aparece. Ver a nota no topo. */
  fundo?: FundoDaMarca;
  /** Símbolo (maleta) acima do logo nome — usado na Splash. */
  comSimbolo?: boolean;
  /** Assinatura "by Decola" abaixo da marca. */
  comAssinatura?: boolean;
  tamanho?: 'md' | 'lg';
};

export function Marca({
  comTagline = true,
  fundo = 'tela',
  comSimbolo = false,
  comAssinatura = false,
  tamanho = 'md',
}: Props) {
  const larguraLogo = tamanho === 'lg' ? 240 : 190;
  const fundoClaro = useFundoClaro(fundo);

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
        source={fundoClaro ? LOGO_ESCURO : LOGO_CLARO}
        style={{ width: larguraLogo, height: larguraLogo * 0.313 }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Decola Negócios"
      />

      {/**
        * AS CORES DA FRASE SÃO FIXAS, e não vêm dos papéis do tema.
        *
        * Ela só aparece sobre o amarelo da marca, que não muda nunca — então
        * nada aqui pode mudar junto com o tema. Usar `cores.primaria` foi
        * exatamente o que pintou "Organize." e "Cresça." de azul-claro sobre
        * amarelo quando o aparelho estava no escuro.
        */}
      {comTagline ? (
        <Text style={estilos.tagline}>
          <Text style={{ color: fundoClaro ? tema.paleta.azulMarinho : tema.paleta.branco }}>
            Organize.{' '}
          </Text>
          <Text style={{ color: tema.paleta.vermelho }}>Venda. </Text>
          <Text style={{ color: fundoClaro ? tema.paleta.azulMarinho : tema.paleta.azulClaro }}>
            Cresça.
          </Text>
        </Text>
      ) : null}

      {comAssinatura ? (
        <Image
          source={fundoClaro ? ASSINATURA_ESCURA : ASSINATURA_CLARA}
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
export function AssinaturaDecola({ fundo = 'tela' }: { fundo?: FundoDaMarca }) {
  const fundoClaro = useFundoClaro(fundo);

  return (
    <Image
      source={fundoClaro ? ASSINATURA_ESCURA : ASSINATURA_CLARA}
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
