/**
 * Integrações — Asaas, Resend, site público e Storage.
 *
 * A tela existe para responder uma pergunta que o código não responde: a
 * integração está funcionando AGORA? Ter função de checkout escrita não prova
 * que a chave do Asaas é aceita, e secret preenchido não prova que o domínio
 * do remetente foi verificado. Por isso o botão testa de verdade, chamando
 * cada serviço, em vez de conferir se a configuração existe.
 *
 * Nada é testado sozinho ao abrir: cada verificação é uma chamada a um
 * serviço externo, e o painel não deve gastá-las a cada navegação. Quem decide
 * quando testar é quem está olhando.
 */
import { useCallback, useEffect, useState } from 'react';
import { Aviso } from '@/componentes/Basicos';
import { carregarConfiguracoes, salvarConfiguracoes } from '@/dados/planos';
import { useSessaoAdmin } from '@/contexto/SessaoAdmin';
import {
  ROTULO_SITUACAO,
  diagnosticarIntegracoes,
  enviarEmailDeTeste,
  type Diagnostico,
  type SituacaoDaIntegracao,
  type Verificacao,
} from '@/dados/integracoes';
import { dataHoraBR } from '@/lib/formato';

/**
 * A paleta não tem verde — `positivo` (azul-claro) é o papel semântico de
 * "está bem" no projeto, o mesmo das entradas do financeiro. Inventar um verde
 * aqui seria a primeira cor fora do tema.
 */
const COR: Record<SituacaoDaIntegracao, string> = {
  ok: 'var(--cor-positivo)',
  atencao: 'var(--cor-alerta)',
  falha: 'var(--cor-erro)',
  ausente: 'var(--cor-textoSuave)',
};

function CartaoDeIntegracao({ verificacao }: { verificacao: Verificacao }) {
  const cor = COR[verificacao.situacao];

  return (
    <div className="card" style={{ borderLeft: `4px solid ${cor}` }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 'var(--espaco-md)',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0 }}>{verificacao.nome}</h2>
        <strong style={{ color: cor }}>{ROTULO_SITUACAO[verificacao.situacao]}</strong>
      </div>

      <p style={{ marginTop: 'var(--espaco-sm)' }}>{verificacao.resumo}</p>

      {verificacao.proximoPasso ? (
        <p className="legenda" style={{ marginTop: 'var(--espaco-sm)' }}>
          <strong>O que fazer: </strong>
          {verificacao.proximoPasso}
        </p>
      ) : null}

      {verificacao.detalhes && Object.keys(verificacao.detalhes).length > 0 ? (
        <dl
          className="legenda"
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px var(--espaco-md)',
            marginTop: 'var(--espaco-md)',
          }}
        >
          {Object.entries(verificacao.detalhes).map(([chave, valor]) => (
            <div key={chave} style={{ display: 'contents' }}>
              <dt style={{ opacity: 0.75 }}>{chave.replace(/_/g, ' ')}</dt>
              <dd style={{ margin: 0 }}>
                {typeof valor === 'boolean' ? (valor ? 'sim' : 'não') : String(valor)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function Integracoes() {
  const { administrador } = useSessaoAdmin();

  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [resultadoDoEmail, setResultadoDoEmail] = useState<
    { tom: 'sucesso' | 'erro'; texto: string } | null
  >(null);

  const testar = useCallback(async () => {
    setErro(null);
    setTestando(true);
    try {
      setDiagnostico(await diagnosticarIntegracoes());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível verificar as integrações.');
    } finally {
      setTestando(false);
    }
  }, []);

  /**
   * O teste que vale para e-mail. Conferir a chave não prova nada: a chave
   * restrita a envio — a certa para o nosso uso — não pode nem ser consultada.
   * Aqui ela é usada, e quem dá o veredito é a caixa de entrada.
   */
  const testarEmail = useCallback(async () => {
    if (!administrador) return;
    setResultadoDoEmail(null);
    setEnviando(true);
    try {
      await enviarEmailDeTeste(administrador.email);
      setResultadoDoEmail({
        tom: 'sucesso',
        texto:
          `O servidor aceitou o envio para ${administrador.email}. Confira sua caixa de ` +
          'entrada (e o spam) nos próximos minutos: se o e-mail chegar, o envio está ' +
          'funcionando de ponta a ponta.',
      });
    } catch (e) {
      setResultadoDoEmail({
        tom: 'erro',
        texto: e instanceof Error ? e.message : 'Não foi possível enviar o e-mail de teste.',
      });
    } finally {
      setEnviando(false);
    }
  }, [administrador]);

  /**
   * A CHAVE GERAL DA BUSCA POR CÓDIGO DE BARRAS.
   *
   * Mora aqui, e não em Configurações SaaS, porque o que ela controla é uma
   * dependência EXTERNA — e é nesta tela que se descobre que uma delas está
   * mal. Quem acabou de ver "falha" num serviço precisa poder desligá-lo no
   * mesmo lugar, não procurar outra tela.
   *
   * `null` enquanto carrega: assim o interruptor não pisca ligado antes de
   * saber como está, que seria dizer ao administrador algo que ainda não foi
   * conferido.
   */
  const [configId, setConfigId] = useState<string | null>(null);
  const [buscaAtiva, setBuscaAtiva] = useState<boolean | null>(null);
  const [trocandoChave, setTrocandoChave] = useState(false);
  const [avisoDaChave, setAvisoDaChave] = useState<
    { texto: string; tom: 'erro' | 'sucesso' } | null
  >(null);

  useEffect(() => {
    let vivo = true;
    void carregarConfiguracoes()
      .then((c) => {
        if (!vivo) return;
        setConfigId(c.id);
        setBuscaAtiva(c.busca_por_codigo_ativa);
      })
      .catch((e) => {
        if (!vivo) return;
        setAvisoDaChave({
          texto: e instanceof Error ? e.message : 'Não foi possível ler a chave da busca.',
          tom: 'erro',
        });
      });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * O estado só muda na tela DEPOIS de o banco confirmar.
   *
   * O contrário — mexer o interruptor na hora e corrigir se der erro — mostra
   * "desligada" numa busca que continua ligada. Numa chave que existe para
   * apagar incêndio, acreditar que se desligou algo que não desligou é pior do
   * que esperar meio segundo.
   */
  const trocarChave = useCallback(
    async (ligar: boolean) => {
      if (!configId) return;
      setAvisoDaChave(null);
      setTrocandoChave(true);
      try {
        await salvarConfiguracoes(configId, { busca_por_codigo_ativa: ligar });
        const confirmado = await carregarConfiguracoes();
        setBuscaAtiva(confirmado.busca_por_codigo_ativa);
        setAvisoDaChave({
          tom: 'sucesso',
          texto: confirmado.busca_por_codigo_ativa
            ? 'Busca por código LIGADA. Os lojistas voltam a receber nome e foto ao bipar.'
            : 'Busca por código DESLIGADA. O cadastro de produto segue normalmente, com o nome digitado à mão.',
        });
      } catch (e) {
        setAvisoDaChave({
          texto: e instanceof Error ? e.message : 'Não foi possível alterar a chave.',
          tom: 'erro',
        });
      } finally {
        setTrocandoChave(false);
      }
    },
    [configId],
  );

  const comProblema =
    diagnostico?.verificacoes.filter((v) => v.situacao !== 'ok').length ?? 0;

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Integrações</h1>
          <p className="legenda">
            Pagamentos, e-mails, site público e armazenamento de fotos. O teste chama cada serviço
            de verdade — o resultado é o estado atual, não o que está escrito na configuração.
          </p>
        </div>

        <button type="button" className="botao" onClick={testar} disabled={testando}>
          {testando ? 'Testando…' : 'Testar conexão'}
        </button>
      </div>

      {erro ? <Aviso mensagem={erro} /> : null}

      <div
        className="card"
        style={{
          borderLeft: `4px solid ${
            buscaAtiva === false ? 'var(--cor-alerta)' : 'var(--cor-positivo)'
          }`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 'var(--espaco-md)',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0 }}>Busca por código de barras</h2>
          <strong
            style={{
              color: buscaAtiva === false ? 'var(--cor-alerta)' : 'var(--cor-positivo)',
            }}
          >
            {buscaAtiva === null ? 'Lendo…' : buscaAtiva ? 'Ligada' : 'Desligada'}
          </strong>
        </div>

        <p style={{ marginTop: 'var(--espaco-sm)' }}>
          Ao bipar um código no cadastro de produto, o servidor procura no catálogo da Decola e,
          se não achar, nas bases externas (Open Food Facts e UPCitemdb). Se alguma delas ficar
          instável, desligue aqui: a consulta para na hora, sem publicar código.
        </p>

        <p className="legenda">
          Desligar <strong>não quebra o cadastro</strong> — o lojista continua cadastrando com o
          nome digitado à mão, e o reconhecimento de produto que já existe na loja dele (o que
          impede duplicado) continua valendo, porque não depende de API externa.
        </p>

        {avisoDaChave ? <Aviso mensagem={avisoDaChave.texto} tom={avisoDaChave.tom} /> : null}

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button
            type="button"
            className={buscaAtiva ? 'botao secundario' : 'botao'}
            onClick={() => void trocarChave(!buscaAtiva)}
            disabled={trocandoChave || buscaAtiva === null}
          >
            {trocandoChave
              ? 'Alterando…'
              : buscaAtiva
                ? 'Desligar a busca'
                : 'Ligar a busca'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: 0 }}>Enviar e-mail de teste</h2>
        <p style={{ marginTop: 'var(--espaco-sm)' }}>
          Manda um e-mail de acesso real para <strong>{administrador?.email}</strong>, pelo mesmo
          caminho que atende seus clientes. É o único teste que prova que o e-mail funciona —
          conferir a chave não prova, porque a chave que usamos só pode ser usada, não consultada.
        </p>

        {resultadoDoEmail ? (
          <Aviso mensagem={resultadoDoEmail.texto} tom={resultadoDoEmail.tom} />
        ) : null}

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button
            type="button"
            className="botao secundario"
            onClick={testarEmail}
            disabled={enviando || !administrador}
          >
            {enviando ? 'Enviando…' : 'Enviar e-mail de teste'}
          </button>
        </div>
      </div>

      {!diagnostico && !testando && !erro ? (
        <div className="card">
          <p>
            Nada é testado automaticamente ao abrir esta tela: cada verificação é uma chamada a um
            serviço externo. Toque em <strong>Testar conexão</strong> para saber como estão o
            Asaas, o Resend, o site público e o Storage agora.
          </p>
        </div>
      ) : null}

      {diagnostico ? (
        <>
          <p className="legenda" style={{ marginBottom: 'var(--espaco-md)' }}>
            Verificado em {dataHoraBR(diagnostico.verificado_em)} ·{' '}
            {comProblema === 0
              ? 'nenhuma pendência.'
              : `${comProblema} ${comProblema === 1 ? 'integração pede' : 'integrações pedem'} atenção.`}
          </p>

          {diagnostico.verificacoes.map((verificacao) => (
            <CartaoDeIntegracao key={verificacao.chave} verificacao={verificacao} />
          ))}
        </>
      ) : null}
    </>
  );
}
