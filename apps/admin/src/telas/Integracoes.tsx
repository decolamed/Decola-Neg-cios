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
import { useCallback, useState } from 'react';
import { Aviso } from '@/componentes/Basicos';
import {
  ROTULO_SITUACAO,
  diagnosticarIntegracoes,
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
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

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
