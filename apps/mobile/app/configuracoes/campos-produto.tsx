/**
 * Configurações → Cadastro de produtos — Seção 4.6.
 *
 * O Gestor vê todos os campos disponíveis e ativa/desativa conforme a
 * necessidade do negócio. Campos ativados passam a aparecer no cadastro e na
 * edição de produto para todos os usuários da empresa; campos desativados
 * somem para todos, imediatamente.
 *
 * O Gestor também cria campos personalizados simples (texto, número, seleção,
 * sim/não, data).
 */
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { CampoTexto } from '@/componentes/CampoTexto';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Seletor } from '@/componentes/Seletor';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  configurarCampo,
  criarCampoPersonalizado,
  listarCamposConfiguraveis,
  type CampoConfigurado,
  type TipoCampo,
} from '@/dados/camposProduto';
import { textoDoErro } from '@/lib/erros';

const TIPOS: { valor: TipoCampo; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto' },
  { valor: 'numero', rotulo: 'Número' },
  { valor: 'selecao', rotulo: 'Lista de opções' },
  { valor: 'booleano', rotulo: 'Sim/Não' },
  { valor: 'data', rotulo: 'Data' },
];

export default function CamposDeProduto() {
  const { conta, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [campos, setCampos] = useState<CampoConfigurado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [criandoNovo, setCriandoNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState('');
  const [tipoNovo, setTipoNovo] = useState<TipoCampo>('texto');
  const [opcoesNovas, setOpcoesNovas] = useState('');
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      setCampos(await listarCamposConfiguraveis(empresaId));
      setErro(null);
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível carregar os campos.'));
    } finally {
      setCarregando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alternar = useCallback(
    async (campo: CampoConfigurado, mudanca: { ativo?: boolean; obrigatorio?: boolean }) => {
      if (!empresaId) return;
      setMensagem(null);
      setSalvando(campo.id);

      const ativo = mudanca.ativo ?? campo.ativo;
      const obrigatorio = mudanca.obrigatorio ?? campo.obrigatorio;

      // Reflete na hora e reverte se o servidor recusar.
      setCampos((atual) =>
        atual.map((c) =>
          c.id === campo.id ? { ...c, ativo, obrigatorio: ativo ? obrigatorio : false } : c,
        ),
      );

      try {
        await configurarCampo({
          empresaId,
          campoId: campo.id,
          ativo,
          obrigatorio,
          ordem: campo.ordem === 999 ? campos.filter((c) => c.ativo).length + 1 : campo.ordem,
        });
        await carregar();
      } catch (e) {
        setMensagem(textoDoErro(e, 'Não foi possível salvar a alteração.'));
        await carregar();
      } finally {
        setSalvando(null);
      }
    },
    [empresaId, campos, carregar],
  );

  const criar = useCallback(async () => {
    setErroNovo(null);
    setMensagem(null);

    if (nomeNovo.trim().length === 0) {
      setErroNovo('Informe o nome do campo.');
      return;
    }

    const opcoes = opcoesNovas
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    if (tipoNovo === 'selecao' && opcoes.length === 0) {
      setErroNovo('Informe ao menos uma opção, separadas por vírgula.');
      return;
    }

    setCriando(true);
    try {
      await criarCampoPersonalizado({ nomeExibicao: nomeNovo, tipo: tipoNovo, opcoes });
      setCriandoNovo(false);
      setNomeNovo('');
      setOpcoesNovas('');
      setTipoNovo('texto');
      await carregar();
    } catch (e) {
      setErroNovo(textoDoErro(e, 'Não foi possível criar o campo.'));
    } finally {
      setCriando(false);
    }
  }, [nomeNovo, tipoNovo, opcoesNovas, carregar]);

  if (!conta || carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Apenas o Gestor pode configurar o cadastro de produtos." />;
  }

  // Com mais de vinte campos no catálogo, rolar a lista inteira para achar
  // "Numeração (calçado)" é pior do que digitar "cal".
  const termo = busca
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const combina = (campo: CampoConfigurado) => {
    if (termo === '') return true;
    const alvo = [campo.nome_exibicao, ...(campo.opcoes ?? [])]
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return alvo.includes(termo);
  };

  const visiveis = campos.filter(combina);
  const doSistema = visiveis.filter((c) => c.empresa_id === null);
  const daEmpresa = visiveis.filter((c) => c.empresa_id !== null);

  return (
    <SafeAreaView style={estilos.tela}>
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Cadastro de produtos</Text>
        <Text style={estilos.descricao}>
          Escolha quais informações aparecem ao cadastrar um produto. Um campo desativado some do
          formulário para todos os usuários da empresa.
        </Text>

        {mensagem ? <Aviso mensagem={mensagem} /> : null}
        {!podeEscrever ? (
          <Aviso tom="alerta" mensagem="Sua conta está em modo de consulta. As alterações estão bloqueadas." />
        ) : null}

        <CampoTexto
          rotulo="Procurar campo"
          valor={busca}
          aoMudar={setBusca}
          placeholder="Ex.: tamanho, cor, garantia"
        />

        {visiveis.length === 0 ? (
          <Aviso
            tom="alerta"
            mensagem={`Nenhum campo encontrado para "${busca.trim()}". Você pode criar um campo personalizado abaixo.`}
          />
        ) : null}

        {doSistema.length > 0 ? <Text style={estilos.secao}>Campos disponíveis</Text> : null}
        {doSistema.map((campo) => (
          <LinhaDeCampo
            key={campo.id}
            campo={campo}
            salvando={salvando === campo.id}
            bloqueado={!podeEscrever}
            aoAlternar={alternar}
          />
        ))}

        {daEmpresa.length > 0 ? (
          <>
            <Text style={estilos.secao}>Campos criados por você</Text>
            {daEmpresa.map((campo) => (
              <LinhaDeCampo
                key={campo.id}
                campo={campo}
                salvando={salvando === campo.id}
                bloqueado={!podeEscrever}
                aoAlternar={alternar}
              />
            ))}
          </>
        ) : null}

        <Text style={estilos.secao}>Criar campo personalizado</Text>

        {criandoNovo ? (
          <View style={estilos.card}>
            {erroNovo ? <Aviso mensagem={erroNovo} /> : null}

            <CampoTexto
              rotulo="Nome do campo"
              valor={nomeNovo}
              aoMudar={setNomeNovo}
              bloqueado={criando}
              placeholder="Ex.: Voltagem, Sabor, Garantia"
            />

            <Seletor
              rotulo="Tipo"
              opcoes={TIPOS.map((t) => ({ valor: t.valor, rotulo: t.rotulo }))}
              selecionado={tipoNovo}
              aoSelecionar={(v) => setTipoNovo((v as TipoCampo) ?? 'texto')}
              bloqueado={criando}
            />

            {tipoNovo === 'selecao' ? (
              <CampoTexto
                rotulo="Opções (separadas por vírgula)"
                valor={opcoesNovas}
                aoMudar={setOpcoesNovas}
                bloqueado={criando}
                placeholder="Ex.: 110V, 220V, Bivolt"
              />
            ) : null}

            <Botao titulo="Criar campo" aoPressionar={criar} carregando={criando} />
            <Botao
              titulo="Cancelar"
              variante="texto"
              aoPressionar={() => {
                setCriandoNovo(false);
                setErroNovo(null);
              }}
            />
          </View>
        ) : (
          <Botao
            titulo="Criar campo personalizado"
            variante="secundario"
            aoPressionar={() => setCriandoNovo(true)}
            desabilitado={!podeEscrever}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LinhaDeCampo({
  campo,
  salvando,
  bloqueado,
  aoAlternar,
}: {
  campo: CampoConfigurado;
  salvando: boolean;
  bloqueado: boolean;
  aoAlternar: (
    campo: CampoConfigurado,
    mudanca: { ativo?: boolean; obrigatorio?: boolean },
  ) => void;
}) {
  const tipo = TIPOS.find((t) => t.valor === campo.tipo_campo)?.rotulo ?? campo.tipo_campo;

  return (
    <View style={estilos.card}>
      <View style={estilos.linha}>
        <View style={estilos.linhaTexto}>
          <Text style={estilos.campoNome}>{campo.nome_exibicao}</Text>
          <Text style={estilos.campoTipo}>{tipo}</Text>
          {/* Sem isto, saber o que tem dentro de "Tamanho (PP a XGG)" exigia
              ligar o campo e ir até o formulário de produto para olhar. */}
          {campo.opcoes && campo.opcoes.length > 0 ? (
            <Text style={estilos.campoOpcoes} numberOfLines={2}>
              {campo.opcoes.slice(0, 8).join(' · ')}
              {campo.opcoes.length > 8 ? ` · +${campo.opcoes.length - 8}` : ''}
            </Text>
          ) : null}
        </View>
        <Switch
          value={campo.ativo}
          disabled={bloqueado || salvando}
          onValueChange={(ativo) => aoAlternar(campo, { ativo })}
          trackColor={{ true: tema.cores.secundaria, false: tema.cores.borda }}
        />
      </View>

      {campo.ativo ? (
        <View style={estilos.linha}>
          <Text style={estilos.obrigatorioRotulo}>Obrigatório no cadastro</Text>
          <Switch
            value={campo.obrigatorio}
            disabled={bloqueado || salvando}
            onValueChange={(obrigatorio) => aoAlternar(campo, { obrigatorio })}
            trackColor={{ true: tema.cores.apoio, false: tema.cores.borda }}
          />
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  secao: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    marginTop: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
  },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  linhaTexto: { flex: 1, marginRight: tema.espacamento.sm },
  campoNome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  campoTipo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  campoOpcoes: { ...tema.tipografia.micro, color: tema.cores.textoSuave, marginTop: 4 },
  obrigatorioRotulo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    flex: 1,
    marginTop: tema.espacamento.sm,
  },
});
