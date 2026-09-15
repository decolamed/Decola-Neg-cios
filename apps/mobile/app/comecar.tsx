/**
 * Primeiro acesso — o roteiro que deixa a loja pronta para vender.
 *
 * O QUE ESTAVA ERRADO. Quem entrava pela primeira vez caía no Início, que
 * mostrava zeros, e o que faltava para a loja funcionar estava espalhado dentro
 * de Configurações — quatro telas diferentes, nenhuma delas óbvia. A pessoa
 * descobria a chave Pix que faltava no dia em que tentou cobrar um cliente, e o
 * endereço da loja no dia em que foi mandar o link e não tinha link.
 *
 * ELE MANDA PARA AS TELAS DE VERDADE, e não reimplementa formulário nenhum. Um
 * campo de chave Pix aqui e outro em Configurações são duas validações que vão
 * divergir — e a primeira coisa que diverge num formulário duplicado é
 * justamente a validação, que é a parte que ninguém copia junto. Cada etapa
 * abre a tela que já existe, salva por lá, e a volta cai aqui de novo com a
 * etapa marcada.
 *
 * O QUE ESTÁ FEITO É LIDO DOS DADOS, não de uma anotação — ver
 * `@/dados/primeiraConfiguracao`. É o que faz quem já configurou pelo caminho
 * normal nunca ver este roteiro, e quem apagar a chave Pix amanhã voltar a
 * ver a etapa como pendente se vier aqui de novo.
 *
 * "CONFIGURAR DEPOIS" É PARA SEMPRE, e de propósito. Um roteiro que reaparece a
 * cada abertura vira a tela que a pessoa aprende a fechar sem ler — e aí ele
 * não serve nem para quem queria configurar. O que falta continua acessível em
 * Configurações, que é onde ela vai procurar.
 */
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone } from '@/componentes/Icone';
import { useSessao } from '@/contexto/SessaoContexto';
import { dispensarConfiguracaoInicial } from '@/dados/configuracoesEmpresa';
import { etapasDaPrimeiraConfiguracao } from '@/dados/primeiraConfiguracao';
import { textoDoErro } from '@/lib/erros';

export default function Comecar() {
  const { carregando, conta, recarregar } = useSessao();
  const [saindo, setSaindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const etapas = useMemo(
    () => (conta ? etapasDaPrimeiraConfiguracao(conta.empresa) : []),
    [conta],
  );

  const prontas = etapas.filter((e) => e.concluida).length;
  const tudoPronto = etapas.length > 0 && prontas === etapas.length;

  /**
   * Sair do roteiro.
   *
   * Grava a dispensa TAMBÉM quando tudo está pronto. Sem isso, um lojista que
   * completasse as quatro etapas e depois apagasse a chave Pix voltaria a cair
   * aqui na abertura seguinte — resolvendo de novo um problema que ele já sabe
   * que tem e escolheu deixar assim.
   */
  const sair = useCallback(async () => {
    if (!conta) return;
    setErro(null);
    setSaindo(true);
    try {
      await dispensarConfiguracaoInicial(conta.empresa.id);
      await recarregar();
      router.replace('/dashboard');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível continuar. Tente novamente.'));
      setSaindo(false);
    }
  }, [conta, recarregar]);

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar sua empresa." />;
  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Só o Gestor faz a configuração inicial da loja." />;
  }

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text style={estilos.saudacao}>Bem-vindo, {conta.empresa.nome}</Text>
        <Text style={estilos.titulo}>
          {tudoPronto ? 'Sua loja está pronta' : 'Vamos deixar sua loja pronta'}
        </Text>
        <Text style={estilos.subtitulo}>
          {tudoPronto
            ? 'Está tudo configurado. Você pode mudar qualquer uma dessas coisas depois, em Configurações.'
            : 'Quatro coisas rápidas. Você pode fazer agora ou deixar para depois — tudo isso também ' +
              'fica em Configurações.'}
        </Text>

        {erro ? <Aviso mensagem={erro} /> : null}

        {/* O progresso em número, e não em barra: "2 de 4" diz quanto falta;
            uma barra pela metade só diz "mais ou menos". */}
        <Text style={estilos.progresso}>
          {prontas} de {etapas.length} {prontas === 1 ? 'concluída' : 'concluídas'}
        </Text>

        {etapas.map((etapa) => (
          <Pressable
            key={etapa.chave}
            onPress={() => router.push(etapa.destino)}
            style={({ pressed }) => [
              estilos.etapa,
              etapa.concluida && estilos.etapaPronta,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={[estilos.marca, etapa.concluida && estilos.marcaPronta]}>
              {/* Um "✓" de texto, e não mais um ícone no conjunto: é o único
                  lugar do aplicativo que precisa dele. */}
              {etapa.concluida ? <Text style={estilos.visto}>✓</Text> : null}
            </View>

            <View style={estilos.etapaTexto}>
              <Text style={[estilos.etapaTitulo, etapa.concluida && estilos.etapaTituloPronta]}>
                {etapa.titulo}
              </Text>
              <Text style={estilos.etapaPorque}>{etapa.porque}</Text>
            </View>

            <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} />
          </Pressable>
        ))}

        <View style={estilos.acoes}>
          <Botao
            titulo={tudoPronto ? 'Ir para o início' : 'Configurar depois'}
            variante={tudoPronto ? 'primario' : 'secundario'}
            aoPressionar={sair}
            carregando={saindo}
          />
          {tudoPronto ? null : (
            <Text style={estilos.nota}>
              Nada se perde: o que faltar continua em Mais → Configurações, a qualquer momento.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl },
  saudacao: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto, marginTop: 2 },
  subtitulo: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.sm,
    marginBottom: tema.espacamento.lg,
    lineHeight: 22,
  },
  progresso: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.sm,
  },
  etapa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  /* Etapa pronta fica discreta, e não invisível: some do caminho sem sumir da
     lista — é o que mostra à pessoa o quanto ela já andou. */
  etapaPronta: { opacity: 0.72 },
  marca: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: tema.cores.borda,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaPronta: {
    backgroundColor: tema.cores.secundaria,
    borderColor: tema.cores.secundaria,
  },
  visto: {
    color: tema.cores.textoInverso,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  etapaTexto: { flex: 1 },
  etapaTitulo: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  etapaTituloPronta: { textDecorationLine: 'line-through' },
  etapaPorque: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: 2,
    lineHeight: 18,
  },
  acoes: { marginTop: tema.espacamento.lg, gap: tema.espacamento.sm },
  nota: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    textAlign: 'center',
    lineHeight: 18,
  },
});
