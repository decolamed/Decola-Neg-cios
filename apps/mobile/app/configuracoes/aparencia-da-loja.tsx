/**
 * Configurações → Aparência da loja.
 *
 * Tela separada de "Loja virtual" de propósito. Lá se decide SE a loja existe
 * e como ela funciona — endereço, WhatsApp, publicar. Aqui se decide como ela
 * se PARECE. São momentos diferentes: o lojista publica uma vez e volta aqui
 * toda vez que muda a vitrine.
 *
 * A prévia no topo não é enfeite: escolher cor e logo olhando para campos de
 * formulário é escolher no escuro. Ela mostra a mesma composição que o cliente
 * vai ver, e é o que permite decidir em segundos.
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import type { BannerDaLoja } from '@decola/types';
import { AjustarImagem } from '@/componentes/AjustarImagem';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Checkbox } from '@/componentes/Checkbox';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { escolherImagem, medirImagem } from '@/dados/imagensProduto';
import {
  ALTURA_DO_BANNER,
  CORES_SUGERIDAS,
  LARGURA_DO_BANNER,
  MAXIMO_DE_BANNERS,
  PROPORCAO_DA_LOGO,
  PROPORCAO_DO_BANNER,
  apagarImagemDaLoja,
  corValida,
  enviarImagemDaLoja,
  extrairPersonalizacao,
  salvarPersonalizacao,
  textoSobre,
  urlDaImagemDaLoja,
} from '@/dados/loja';
import { Dialogo } from '@/lib/dialogo';
import { textoDoErro } from '@/lib/erros';
import type { AreaDeRecorte } from '@/lib/recorte';

/** A imagem escolhida, esperando o enquadramento antes de subir. */
type EmAjuste = {
  tipo: 'logo' | 'banners';
  uri: string;
  largura: number;
  altura: number;
};

export default function AparenciaDaLoja() {
  const { carregando, conta, podeEscrever, recarregar } = useSessao();

  const [nome, setNome] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [cor, setCor] = useState<string | null>(null);
  const [banners, setBanners] = useState<BannerDaLoja[]>([]);
  const [emAjuste, setEmAjuste] = useState<EmAjuste | null>(null);
  const [bannersAtivos, setBannersAtivos] = useState(true);

  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!conta) return;
    const atual = extrairPersonalizacao(conta.empresa);
    setNome(atual.loja_nome ?? '');
    setLogo(atual.logo_url);
    setCor(atual.loja_cor);
    setBanners(atual.loja_banners);
    setBannersAtivos(atual.loja_banners_ativos);
  }, [conta?.empresa.id]);

  const salvar = useCallback(
    async (parcial?: Partial<{ logo: string | null; banners: BannerDaLoja[] }>) => {
      if (!conta) return;
      setErro(null);
      setSucesso(null);
      setOcupado(true);
      try {
        await salvarPersonalizacao(conta.empresa.id, {
          loja_nome: nome.trim() || null,
          logo_url: parcial?.logo !== undefined ? parcial.logo : logo,
          loja_cor: cor,
          loja_banners: parcial?.banners ?? banners,
          loja_banners_ativos: bannersAtivos,
        });
        await recarregar();
        setSucesso('Aparência salva. Sua loja já mudou para quem abrir o link.');
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível salvar.'));
      } finally {
        setOcupado(false);
      }
    },
    [conta, nome, logo, cor, banners, bannersAtivos, recarregar],
  );

  /**
   * Escolher a imagem NÃO sobe nada ainda — abre o ajuste.
   *
   * A ordem importa: enquadrar antes de subir é o que faz a foto publicada ser
   * a que a pessoa viu. Subir primeiro e cortar depois traria de volta o
   * problema, só que com o arquivo errado já no bucket.
   */
  const escolher = useCallback(async (tipo: 'logo' | 'banners') => {
    setErro(null);
    try {
      const uri = await escolherImagem();
      if (!uri) return; // desistir não é erro

      const { largura, altura } = await medirImagem(uri);
      setEmAjuste({ tipo, uri, largura, altura });
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível abrir a imagem.'));
    }
  }, []);

  /** Sobe a imagem já enquadrada e grava na hora: o arquivo subiu, a lista segue. */
  const enviarAjustada = useCallback(
    async (recorte: AreaDeRecorte) => {
      if (!conta || !emAjuste) return;
      setErro(null);
      setOcupado(true);
      try {
        const caminho = await enviarImagemDaLoja({
          empresaId: conta.empresa.id,
          tipo: emAjuste.tipo,
          uriLocal: emAjuste.uri,
          recorte,
        });

        setEmAjuste(null);

        if (emAjuste.tipo === 'logo') {
          const anterior = logo;
          setLogo(caminho);
          await salvar({ logo: caminho });
          if (anterior) await apagarImagemDaLoja(anterior);
        } else {
          const novos = [...banners, { caminho }];
          setBanners(novos);
          await salvar({ banners: novos });
        }
      } catch (e) {
        setErro(textoDoErro(e, 'Não foi possível enviar a imagem.'));
      } finally {
        setOcupado(false);
      }
    },
    [conta, emAjuste, logo, banners, salvar],
  );

  const removerBanner = useCallback(
    (caminho: string) => {
      Dialogo.alert('Remover banner', 'Ele sai do carrossel da sua loja.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const novos = banners.filter((b) => b.caminho !== caminho);
              setBanners(novos);
              await salvar({ banners: novos });
              await apagarImagemDaLoja(caminho);
            })();
          },
        },
      ]);
    },
    [banners, salvar],
  );

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Sua conta não está disponível no momento." />;
  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Só o Gestor pode alterar a aparência da loja." />;
  }

  // Tela cheia de propósito: enquadrar é uma decisão que merece a tela inteira,
  // e voltar para o formulário no meio dela só confundiria.
  if (emAjuste) {
    const ehBanner = emAjuste.tipo === 'banners';
    return (
      <SafeAreaView style={estilos.tela}>
        <AjustarImagem
          uri={emAjuste.uri}
          larguraOriginal={emAjuste.largura}
          alturaOriginal={emAjuste.altura}
          proporcao={ehBanner ? PROPORCAO_DO_BANNER : PROPORCAO_DA_LOGO}
          titulo={ehBanner ? 'Enquadrar o banner' : 'Enquadrar a logo'}
          aoConfirmar={(area) => void enviarAjustada(area)}
          aoCancelar={() => {
            setEmAjuste(null);
            void escolher(emAjuste.tipo);
          }}
          ocupado={ocupado}
        />
      </SafeAreaView>
    );
  }

  const corEfetiva = cor ?? tema.cores.primaria;
  const corDoTexto = textoSobre(corEfetiva);
  const nomeExibido = nome.trim() || conta.empresa.nome;
  const podeAlterar = podeEscrever && !ocupado;
  const bannersCheios = banners.length >= MAXIMO_DE_BANNERS;

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Aparência da loja</Text>
        <Text style={estilos.descricao}>
          É assim que seu cliente vê a loja quando abre o link que você mandou.
        </Text>

        {erro ? <Aviso mensagem={erro} /> : null}
        {sucesso ? <Aviso tom="sucesso" mensagem={sucesso} /> : null}
        {!podeEscrever ? (
          <Aviso tom="alerta" mensagem="Sua conta está em modo de consulta." />
        ) : null}

        {/* ------------------------------------------------------- prévia */}
        <Text style={estilos.rotuloSecao}>Prévia</Text>
        <View style={estilos.previa}>
          <View style={[estilos.previaTopo, { backgroundColor: corEfetiva }]}>
            {logo ? (
              <Image source={{ uri: urlDaImagemDaLoja(logo) }} style={estilos.previaLogo} />
            ) : null}
            <Text style={[estilos.previaNome, { color: corDoTexto }]} numberOfLines={1}>
              {nomeExibido}
            </Text>
          </View>

          {bannersAtivos && banners.length > 0 ? (
            <Image
              source={{ uri: urlDaImagemDaLoja(banners[0].caminho) }}
              style={estilos.previaBanner}
              resizeMode="cover"
            />
          ) : null}

          <View style={estilos.previaCorpo}>
            <View style={estilos.previaProduto} />
            <View style={estilos.previaProduto} />
          </View>

          <View style={[estilos.previaBotao, { backgroundColor: corEfetiva }]}>
            <Text style={[estilos.previaBotaoTexto, { color: corDoTexto }]}>Adicionar ao carrinho</Text>
          </View>
        </View>

        {/* --------------------------------------------------------- nome */}
        <CampoTexto
          rotulo="Nome da loja"
          valor={nome}
          aoMudar={setNome}
          bloqueado={!podeAlterar}
          placeholder={conta.empresa.nome}
        />
        <Text style={estilos.dica}>
          Deixe vazio para usar “{conta.empresa.nome}”. Útil quando o nome na nota fiscal não é o
          nome pelo qual seus clientes conhecem você.
        </Text>

        {/* --------------------------------------------------------- logo */}
        <Text style={estilos.rotuloSecao}>Logo</Text>
        <View style={estilos.linhaLogo}>
          {logo ? (
            <Image source={{ uri: urlDaImagemDaLoja(logo) }} style={estilos.logo} />
          ) : (
            <View style={[estilos.logo, estilos.logoVazia]}>
              <Text style={estilos.logoVaziaTexto}>sem logo</Text>
            </View>
          )}
          <View style={estilos.acoesLogo}>
            <Botao
              titulo={logo ? 'Trocar' : 'Escolher logo'}
              variante="secundario"
              aoPressionar={() => void escolher('logo')}
              desabilitado={!podeAlterar}
            />
            {logo ? (
              <Botao
                titulo="Remover"
                variante="texto"
                aoPressionar={() => {
                  const anterior = logo;
                  setLogo(null);
                  void (async () => {
                    await salvar({ logo: null });
                    await apagarImagemDaLoja(anterior);
                  })();
                }}
                desabilitado={!podeAlterar}
              />
            ) : null}
          </View>
        </View>

        {/* ---------------------------------------------------------- cor */}
        <Text style={estilos.rotuloSecao}>Cor de destaque</Text>
        <View style={estilos.paleta}>
          {CORES_SUGERIDAS.map((opcao) => (
            <Pressable
              key={opcao.valor}
              accessibilityRole="button"
              accessibilityLabel={opcao.nome}
              disabled={!podeAlterar}
              onPress={() => setCor(opcao.valor)}
              style={[
                estilos.amostra,
                { backgroundColor: opcao.valor },
                corEfetiva.toUpperCase() === opcao.valor.toUpperCase() && estilos.amostraEscolhida,
              ]}
            />
          ))}
        </View>

        <CampoTexto
          rotulo="Ou digite a cor (#RRGGBB)"
          valor={cor ?? ''}
          aoMudar={(v) => setCor(v.trim() || null)}
          bloqueado={!podeAlterar}
          placeholder="#01395E"
        />
        {cor && !corValida(cor) ? (
          <Aviso mensagem="A cor precisa estar no formato #RRGGBB — por exemplo, #C0392B." />
        ) : null}
        <Text style={estilos.dica}>
          A cor pinta o topo e os botões. O texto sobre ela é escolhido sozinho para continuar
          legível, então nenhuma cor deixa sua loja ilegível.
        </Text>

        {/* ------------------------------------------------------ banners */}
        <Text style={estilos.rotuloSecao}>Banners</Text>
        <Text style={estilos.dica}>
          Aparecem em cima dos produtos, passando um a um. Bons para promoção, novidade ou horário
          de funcionamento.
        </Text>
        <Text style={estilos.dica}>
          O banner tem {LARGURA_DO_BANNER} × {ALTURA_DO_BANNER} pixels (deitado, 16:7). Não precisa
          preparar a imagem nesse tamanho: depois de escolher a foto você arrasta e aproxima até
          enquadrar do seu jeito, e o que ficar dentro da moldura é exatamente o que vai para a
          loja.
        </Text>

        <View style={estilos.espaco}>
          <Checkbox marcado={bannersAtivos} aoMudar={setBannersAtivos} bloqueado={!podeAlterar}>
            Mostrar o carrossel de banners
          </Checkbox>
          {!bannersAtivos && banners.length > 0 ? (
            <Text style={estilos.dica}>
              Seus {banners.length} banner(s) continuam guardados — desligar não apaga nada.
            </Text>
          ) : null}
        </View>

        {banners.map((banner, indice) => (
          <View style={estilos.cartaoBanner} key={banner.caminho}>
            <Image
              source={{ uri: urlDaImagemDaLoja(banner.caminho) }}
              style={estilos.banner}
              resizeMode="cover"
            />
            <View style={estilos.barraBanner}>
              <Text style={estilos.ordemBanner}>
                {indice === 0 ? 'Primeiro a aparecer' : `${indice + 1}º`}
              </Text>
              <Pressable onPress={() => removerBanner(banner.caminho)} disabled={!podeAlterar}>
                <Text style={[estilos.remover, !podeAlterar && estilos.inativo]}>Remover</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {bannersCheios ? (
          <Aviso
            tom="alerta"
            mensagem={`Você chegou ao limite de ${MAXIMO_DE_BANNERS} banners. Remova um para adicionar outro.`}
          />
        ) : (
          <Botao
            titulo="Adicionar banner"
            variante="secundario"
            aoPressionar={() => void escolher('banners')}
            carregando={ocupado}
            desabilitado={!podeAlterar}
          />
        )}

        <View style={estilos.espaco}>
          <Botao
            titulo="Salvar aparência"
            aoPressionar={() => void salvar()}
            carregando={ocupado}
            desabilitado={!podeAlterar || Boolean(cor && !corValida(cor))}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, gap: tema.espacamento.sm },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.corpo,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.md,
  },
  rotuloSecao: {
    ...tema.tipografia.rotulo,
    color: tema.cores.texto,
    marginTop: tema.espacamento.lg,
  },
  dica: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: -tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
  espaco: { marginTop: tema.espacamento.md, gap: tema.espacamento.sm },

  // ------------------------------------------------------------- prévia
  previa: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    overflow: 'hidden',
    ...tema.elevacao.card,
  },
  previaTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.sm,
    padding: tema.espacamento.md,
  },
  previaLogo: { width: 32, height: 32, borderRadius: tema.raio.sm, backgroundColor: '#FFF' },
  previaNome: { ...tema.tipografia.corpoDestacado, flex: 1 },
  previaBanner: { width: '100%', height: 90, backgroundColor: tema.cores.bordaSuave },
  previaCorpo: { flexDirection: 'row', gap: tema.espacamento.sm, padding: tema.espacamento.md },
  previaProduto: {
    flex: 1,
    height: 54,
    borderRadius: tema.raio.md,
    backgroundColor: tema.cores.fundoCampo,
  },
  previaBotao: {
    margin: tema.espacamento.md,
    marginTop: 0,
    paddingVertical: tema.espacamento.sm,
    borderRadius: tema.raio.md,
    alignItems: 'center',
  },
  previaBotaoTexto: { ...tema.tipografia.legenda, fontWeight: 'bold' },

  // --------------------------------------------------------------- logo
  linhaLogo: { flexDirection: 'row', gap: tema.espacamento.md, alignItems: 'center' },
  logo: {
    width: 76,
    height: 76,
    borderRadius: tema.raio.md,
    backgroundColor: tema.cores.fundoCampo,
  },
  logoVazia: { alignItems: 'center', justifyContent: 'center' },
  logoVaziaTexto: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  acoesLogo: { flex: 1, gap: tema.espacamento.xs },

  // ---------------------------------------------------------------- cor
  paleta: { flexDirection: 'row', flexWrap: 'wrap', gap: tema.espacamento.sm },
  amostra: {
    width: 44,
    height: 44,
    borderRadius: tema.raio.md,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  amostraEscolhida: { borderColor: tema.cores.texto },

  // ------------------------------------------------------------ banners
  cartaoBanner: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    overflow: 'hidden',
    marginTop: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  banner: { width: '100%', height: 110, backgroundColor: tema.cores.bordaSuave },
  barraBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tema.espacamento.md,
  },
  ordemBanner: { ...tema.tipografia.legenda, color: tema.cores.textoSuave },
  remover: { ...tema.tipografia.corpoDestacado, color: tema.cores.negativo },
  inativo: { opacity: 0.4 },
});
