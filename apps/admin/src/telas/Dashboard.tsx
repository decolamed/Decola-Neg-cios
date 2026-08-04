/**
 * Dashboard do painel — Seção 7.15 A.
 *
 * As métricas da V1, exatamente as cinco listadas na especificação. LTV e
 * cohort ficam para versão futura (Seção 11.4) e não aparecem aqui nem como
 * placeholder.
 */
import { useCallback, useEffect, useState } from 'react';
import { Carregando, ErroComRetry } from '@/componentes/Basicos';
import { carregarMetricas, type Metricas } from '@/dados/metricas';
import { moeda } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; metricas: Metricas }
  | { nome: 'erro'; mensagem: string };

export function Dashboard() {
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      setEstado({ nome: 'pronto', metricas: await carregarMetricas() });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar as métricas.',
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.nome === 'carregando') return <Carregando texto="Carregando métricas…" />;
  if (estado.nome === 'erro') {
    return <ErroComRetry mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const m = estado.metricas;
  const precisamDeAtencao = m.em_carencia + m.em_modo_limitado;

  return (
    <>
      <div className="cabecalho">
        <h1>Visão geral</h1>
        <button type="button" className="botao discreto" onClick={carregar}>
          Atualizar
        </button>
      </div>

      <div className="grade-metricas">
        <Metrica rotulo="Empresas ativas" valor={String(m.empresas_ativas)} />
        <Metrica rotulo="Novas neste mês" valor={String(m.novas_no_mes)} />
        <Metrica
          rotulo="Receita recorrente (MRR)"
          valor={moeda(m.mrr)}
          nota="Soma do valor contratado das assinaturas ativas"
        />
        <Metrica
          rotulo="Cancelamento no mês"
          valor={`${m.churn_percentual}%`}
          nota={`${m.encerradas_no_mes} empresa(s) encerrada(s)`}
        />
        {/* Seção 7.15 A — "para ação proativa do time". */}
        <Metrica
          rotulo="Precisam de atenção"
          valor={String(precisamDeAtencao)}
          nota={`${m.em_carencia} em carência · ${m.em_modo_limitado} em modo limitado`}
          atencao={precisamDeAtencao > 0}
        />
      </div>

      <div className="card">
        <h2>Assinaturas por estado</h2>
        <table className="tabela" style={{ boxShadow: 'none' }}>
          <tbody>
            <Linha rotulo="Em teste gratuito" valor={m.em_trial} />
            <Linha rotulo="Aguardando pagamento" valor={m.pendentes_pagamento} />
            <Linha rotulo="Em carência" valor={m.em_carencia} />
            <Linha rotulo="Em modo limitado" valor={m.em_modo_limitado} />
          </tbody>
        </table>
      </div>
    </>
  );
}

function Metrica({
  rotulo,
  valor,
  nota,
  atencao = false,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  atencao?: boolean;
}) {
  return (
    <div className={`metrica${atencao ? ' atencao' : ''}`}>
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor}</span>
      {nota ? <span className="nota">{nota}</span> : null}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <tr>
      <td>{rotulo}</td>
      <td className="destaque" style={{ textAlign: 'right' }}>
        {valor}
      </td>
    </tr>
  );
}
