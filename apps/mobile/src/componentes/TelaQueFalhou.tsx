/**
 * O que aparece quando uma tela quebra.
 *
 * POR QUE ISTO PRECISA EXISTIR. Sem uma rede de segurança, um erro de
 * programação em UMA tela derruba a árvore inteira do React: o aplicativo
 * some, sobra a cor de fundo, e a pessoa fica olhando para um retângulo sem
 * texto e sem botão. Foi assim que chegaram as queixas de "abre uma tela
 * branca" e "fica uma tela amarela" — a tela não estava carregando coisa
 * alguma, ela tinha morrido, e nada dizia isso.
 *
 * O Expo Router adota como limite de erro qualquer `ErrorBoundary` exportado
 * de um arquivo de layout. Exportando um no layout raiz, QUALQUER tela do
 * aplicativo passa a cair aqui em vez de sumir.
 *
 * O que esta tela promete: dizer que quebrou, dar um caminho de volta e
 * mostrar o detalhe técnico para quem for relatar. O que ela não faz é fingir
 * que está carregando.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Botao } from '@/componentes/Botao';

export type PropsDeFalha = {
  error: Error;
  /** O Expo Router injeta esta função: tenta montar a tela de novo. */
  retry: () => Promise<void>;
};

export function TelaQueFalhou({ error, retry }: PropsDeFalha) {
  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.titulo}>Esta tela não abriu</Text>

        <Text style={estilos.texto}>
          Alguma coisa quebrou aqui dentro — não foi a sua internet e não foi você. Você pode tentar
          de novo ou voltar ao início; o que você já tinha salvo está a salvo.
        </Text>

        <View style={estilos.acoes}>
          <Botao titulo="Tentar de novo" aoPressionar={() => void retry()} />
          <Botao
            titulo="Voltar ao início"
            variante="secundario"
            aoPressionar={() => {
              // `replace` na raiz, e não `back`: a tela anterior pode ser
              // justamente a que quebrou.
              void retry().then(() => {
                if (typeof window !== 'undefined') window.location.assign('/app/dashboard');
              });
            }}
          />
        </View>

        {/* O detalhe fica visível de propósito: é o que faz uma queixa virar
            um conserto em vez de uma caça ao tesouro. */}
        <Text style={estilos.rotuloDetalhe}>Detalhe técnico</Text>
        <Text style={estilos.detalhe} selectable>
          {error?.message ?? 'sem mensagem'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: {
    padding: tema.espacamento.lg,
    gap: tema.espacamento.sm,
    flexGrow: 1,
    justifyContent: 'center',
  },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  texto: { ...tema.tipografia.corpo, color: tema.cores.textoSuave },
  acoes: { gap: tema.espacamento.sm, marginTop: tema.espacamento.lg },
  rotuloDetalhe: {
    ...tema.tipografia.rotulo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xl,
  },
  detalhe: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    backgroundColor: tema.cores.fundoCampo,
    borderRadius: tema.raio.sm,
    padding: tema.espacamento.sm,
  },
});
