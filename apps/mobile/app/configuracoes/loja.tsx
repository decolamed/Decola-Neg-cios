/**
 * Configurações → Loja virtual.
 *
 * É a tela que torna a vitrine possível: sem endereço definido e sem o
 * interruptor ligado, `vitrine_lojas` não devolve a loja e a página pública
 * responde "loja não encontrada".
 *
 * A loja nasce DESLIGADA de propósito. Ter uma página pública no ar é uma
 * decisão de negócio — não pode acontecer como efeito colateral de assinar o
 * sistema.
 *
 * Logo, endereço, telefone e chave Pix não se repetem aqui: já existem em
 * "Dados da empresa" e alimentam a vitrine de lá. Dois lugares para editar a
 * mesma coisa é como as duas versões passam a divergir.
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { Checkbox } from '@/componentes/Checkbox';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { compartilharTexto } from '@/lib/compartilhar';
import {
  BASE_DA_LOJA_VISIVEL,
  contarProdutosNaVitrine,
  enderecoCompleto,
  enderecoReservado,
  enderecoValido,
  extrairConfiguracao,
  instagramValido,
  normalizarInstagram,
  normalizarWhatsapp,
  salvarConfiguracaoDaLoja,
  sugerirEndereco,
} from '@/dados/loja';
import { textoDoErro } from '@/lib/erros';

export default function ConfiguracoesDaLoja() {
  const { carregando, conta, podeEscrever, recarregar } = useSessao();

  const [endereco, setEndereco] = useState('');
  const [ativa, setAtiva] = useState(false);
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [descricao, setDescricao] = useState('');

  const [naVitrine, setNaVitrine] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [avisoDoLink, setAvisoDoLink] = useState<string | null>(null);

  useEffect(() => {
    if (!conta) return;
    const atual = extrairConfiguracao(conta.empresa);
    setEndereco(atual.loja_slug ?? sugerirEndereco(conta.empresa.nome));
    setAtiva(atual.loja_ativa);
    setWhatsapp(atual.whatsapp ?? conta.empresa.telefone ?? '');
    setInstagram(atual.loja_instagram ?? '');
    setDescricao(atual.loja_descricao ?? '');

    void contarProdutosNaVitrine(conta.empresa.id)
      .then(setNaVitrine)
      .catch(() => setNaVitrine(null));
  }, [conta?.empresa.id]);

  const salvar = useCallback(async () => {
    if (!conta) return;
    setErro(null);
    setSucesso(null);

    const slug = endereco.trim().toLowerCase();

    // Reservado vem ANTES do formato: "planos" tem formato perfeito, e dizer
    // "aceita apenas letras minúsculas" para quem digitou exatamente isso é
    // mandar a pessoa procurar um erro que não existe.
    if (slug && enderecoReservado(slug)) {
      setErro(
        `"${slug}" é o endereço de uma página do próprio Decola Negócios e não pode ser o da ` +
          'sua loja. Escolha outro — acrescentar a cidade ou o sobrenome costuma resolver.',
      );
      return;
    }

    // Ligar sem endereço é recusado pelo banco (constraint
    // `empresas_loja_ativa_exige_slug`); dizer antes evita o erro técnico.
    if (ativa && !enderecoValido(slug)) {
      setErro(
        'Defina um endereço válido para a loja antes de publicá-la: apenas letras ' +
          'minúsculas, números e hífen.',
      );
      return;
    }
    if (slug && !enderecoValido(slug)) {
      setErro('O endereço aceita apenas letras minúsculas, números e hífen.');
      return;
    }
    if (ativa && !normalizarWhatsapp(whatsapp)) {
      setErro('Informe o WhatsApp: é por ele que o cliente combina a entrega.');
      return;
    }

    // Vale colar o link inteiro: o que sobra é o usuário, que é o que o banco
    // aceita. Só reclamamos do que nem assim vira um usuário válido.
    const usuario = normalizarInstagram(instagram);
    if (usuario && !instagramValido(usuario)) {
      setErro('O Instagram aceita apenas letras, números, ponto e sublinhado — sem espaços.');
      return;
    }

    setSalvando(true);
    try {
      await salvarConfiguracaoDaLoja(conta.empresa.id, {
        loja_slug: slug || null,
        loja_ativa: ativa,
        whatsapp: normalizarWhatsapp(whatsapp),
        loja_instagram: normalizarInstagram(instagram),
        loja_descricao: descricao.trim() || null,
        reserva_horas: conta.empresa.reserva_horas,
      });
      await recarregar();
      setSucesso(ativa ? 'Sua loja está no ar.' : 'Configurações salvas. A loja está desligada.');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível salvar.'));
    } finally {
      setSalvando(false);
    }
  }, [conta, endereco, ativa, whatsapp, instagram, descricao, recarregar]);

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Sua conta não está disponível no momento." />;

  const slugAtual = conta.empresa.loja_slug;
  const link = slugAtual ? enderecoCompleto(slugAtual) : null;

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Loja virtual</Text>
        <Text style={estilos.descricao}>
          Seus produtos marcados como visíveis viram uma página pública que você compartilha com
          seus clientes. É o mesmo produto do estoque — preço e disponibilidade acompanham sozinhos.
        </Text>

        {erro ? <Aviso mensagem={erro} /> : null}
        {sucesso ? <Aviso tom="sucesso" mensagem={sucesso} /> : null}

        {!podeEscrever ? (
          <Aviso
            tom="alerta"
            mensagem="Sua conta está em modo de consulta. As alterações ficam bloqueadas."
          />
        ) : null}

        <CampoTexto
          rotulo="Endereço da sua loja"
          valor={endereco}
          aoMudar={(v) => setEndereco(sugerirEndereco(v))}
          bloqueado={salvando || !podeEscrever}
          placeholder="minha-loja"
        />
        <Text style={estilos.dica}>
          Sua loja ficará em {'\n'}
          <Text style={estilos.link}>
            {BASE_DA_LOJA_VISIVEL}/{endereco || 'sua-loja'}
          </Text>
        </Text>

        <CampoTexto
          rotulo="WhatsApp para pedidos"
          valor={whatsapp}
          aoMudar={setWhatsapp}
          bloqueado={salvando || !podeEscrever}
          placeholder="(11) 98888-7777"
        />

        <CampoTexto
          rotulo="Instagram (opcional)"
          valor={instagram}
          aoMudar={setInstagram}
          bloqueado={salvando || !podeEscrever}
          placeholder="@sualoja"
        />
        <Text style={estilos.dica}>
          É por aqui que o cliente combina a entrega e o valor do frete com você.
        </Text>

        <CampoTexto
          rotulo="Descrição curta (opcional)"
          valor={descricao}
          aoMudar={setDescricao}
          bloqueado={salvando || !podeEscrever}
          placeholder="O que seu negócio vende"
        />

        <View style={estilos.espaco}>
          <Checkbox
            marcado={ativa}
            aoMudar={setAtiva}
            bloqueado={salvando || !podeEscrever}
          >
            Publicar minha loja
          </Checkbox>
        </View>

        {/* Dizer o número aqui responde a pergunta que vem logo depois de
            publicar: "liguei, e por que está vazia?" */}
        {naVitrine !== null ? (
          <Aviso
            tom={naVitrine === 0 ? 'alerta' : 'sucesso'}
            mensagem={
              naVitrine === 0
                ? 'Nenhum produto está marcado para aparecer na loja. Vá em Produtos, abra um produto e marque "Mostrar na loja virtual".'
                : `${naVitrine} ${naVitrine === 1 ? 'produto está' : 'produtos estão'} aparecendo na sua loja.`
            }
          />
        ) : null}

        <Botao
          titulo="Salvar"
          aoPressionar={salvar}
          carregando={salvando}
          desabilitado={!podeEscrever}
        />

        {link && conta.empresa.loja_ativa ? (
          <View style={estilos.espaco}>
            <Text style={estilos.rotuloLink}>Link da sua loja</Text>
            <Text style={estilos.link} selectable>
              {link}
            </Text>
            {/* No celular abre a folha do sistema, que leva direto ao WhatsApp.
                No computador não existe folha nenhuma — antes o botão dava erro
                e não fazia nada; agora copia o texto e DIZ que copiou. */}
            <Botao
              titulo="Enviar para um cliente"
              variante="secundario"
              aoPressionar={() => {
                void compartilharTexto(
                  `Confira os produtos da ${conta.empresa.nome}: ${link}`,
                  conta.empresa.nome,
                ).then((r) =>
                  setAvisoDoLink(
                    r === 'copiado'
                      ? 'Link copiado. Cole no WhatsApp do seu cliente.'
                      : r === 'nada'
                        ? 'Não foi possível compartilhar por aqui. O link está logo acima — segure para copiar.'
                        : null,
                  ),
                );
              }}
            />

            {avisoDoLink ? <Aviso tom="sucesso" mensagem={avisoDoLink} /> : null}
          </View>
        ) : null}
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
  dica: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: -tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
  },
  espaco: { marginTop: tema.espacamento.md, gap: tema.espacamento.sm },
  rotuloLink: { ...tema.tipografia.rotulo, color: tema.cores.texto },
  link: { ...tema.tipografia.corpoDestacado, color: tema.cores.primaria },
});
