/**
 * Configurações SaaS — Seções 6.5, 6.6, 6.9 e 7.15 D.
 *
 * Três controles globais, exatamente os da especificação: trial ligado ou
 * desligado, duração do trial e duração da carência. "tudo sem alteração de
 * código" — é a linha única de `configuracoes_plataforma` que manda.
 *
 * Valem para NOVAS contas: quem já está em trial ou em carência mantém a data
 * que foi gravada na própria assinatura.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ConfiguracaoPlataforma } from '@decola/types';
import { Aviso, Campo, CampoTexto, Carregando, ErroComRetry } from '@/componentes/Basicos';
import { carregarConfiguracoes, salvarConfiguracoes } from '@/dados/planos';
import { dataHoraBR } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; config: ConfiguracaoPlataforma }
  | { nome: 'erro'; mensagem: string };

export function Configuracoes() {
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [trialAtivo, setTrialAtivo] = useState(true);
  const [trialDias, setTrialDias] = useState('7');
  const [carenciaDias, setCarenciaDias] = useState('7');
  const [aviso, setAviso] = useState<{ texto: string; tom: 'erro' | 'sucesso' } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const config = await carregarConfiguracoes();
      setTrialAtivo(config.trial_ativo);
      setTrialDias(String(config.trial_dias));
      setCarenciaDias(String(config.carencia_dias));
      setEstado({ nome: 'pronto', config });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar as configurações.',
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.nome === 'carregando') return <Carregando />;
  if (estado.nome === 'erro') {
    return <ErroComRetry mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const trial = Number(trialDias);
  const carencia = Number(carenciaDias);
  const trialValido = Number.isInteger(trial) && trial > 0;
  const carenciaValida = Number.isInteger(carencia) && carencia > 0;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setAviso(null);
    setSalvando(true);

    try {
      await salvarConfiguracoes(estado.config.id, {
        trial_ativo: trialAtivo,
        trial_dias: trial,
        carencia_dias: carencia,
      });
      setAviso({ texto: 'Configurações salvas.', tom: 'sucesso' });
      await carregar();
    } catch (e) {
      setAviso({
        texto: e instanceof Error ? e.message : 'Não foi possível salvar as configurações.',
        tom: 'erro',
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="cabecalho">
        <h1>Configurações SaaS</h1>
      </div>

      {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}

      <form className="card" onSubmit={enviar}>
        <h2>Trial gratuito</h2>

        <Campo rotulo="Disponibilidade">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--espaco-sm)' }}>
            <input
              type="checkbox"
              checked={trialAtivo}
              disabled={salvando}
              onChange={(e) => setTrialAtivo(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Oferecer período de teste a novos clientes</span>
          </label>
        </Campo>

        <div className="linha-campos">
          <CampoTexto
            rotulo="Duração do teste (dias)"
            valor={trialDias}
            aoMudar={setTrialDias}
            tipo="number"
            desabilitado={salvando || !trialAtivo}
            erro={trialValido ? null : 'Informe um número inteiro maior que zero.'}
          />
          <CampoTexto
            rotulo="Duração da carência (dias)"
            valor={carenciaDias}
            aoMudar={setCarenciaDias}
            tipo="number"
            desabilitado={salvando}
            erro={carenciaValida ? null : 'Informe um número inteiro maior que zero.'}
          />
        </div>

        <p className="legenda">
          Com o teste desligado, novos clientes não veem a opção e a conta nasce aguardando
          pagamento. A carência é o prazo depois de um pagamento não identificado, em que a empresa
          continua com todas as funcionalidades antes de entrar em modo limitado.
        </p>

        <p className="legenda">
          As duas durações valem para contas NOVAS: quem já está em teste ou em carência mantém a
          data gravada na própria assinatura. Para mexer numa empresa específica, use Alterar
          período de teste na tela dela.
        </p>

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button
            type="submit"
            className="botao"
            disabled={salvando || !trialValido || !carenciaValida}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>

        <p className="legenda" style={{ marginTop: 'var(--espaco-md)' }}>
          Última alteração: {dataHoraBR(estado.config.atualizado_em)}
        </p>
      </form>
    </>
  );
}
