/**
 * Vitrine de planos — Seções 6.1 e 7.13, na web.
 *
 * É a porta de entrada de quem chega sem link direto. Leitura anônima: quem
 * está aqui ainda não tem conta.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Aviso, Carregando } from '@/componentes/Basicos';
import {
  limiteDeFuncionarios,
  listarPlanosAtivos,
  rotuloDeFuncionalidade,
  type PlanoComTrial,
} from '@/dados/planos';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; planos: PlanoComTrial[] }
  | { nome: 'erro'; mensagem: string };

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Planos() {
  const navegar = useNavigate();
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      setEstado({ nome: 'pronto', planos: await listarPlanosAtivos() });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar os planos.',
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <main className="pagina">
      <div className="cabecalho-pagina">
        <h1>Escolha seu plano</h1>
        <p>Controle vendas, estoque, financeiro e equipe do seu negócio em um só lugar.</p>
      </div>

      {estado.nome === 'carregando' ? <Carregando texto="Carregando planos…" /> : null}

      {estado.nome === 'erro' ? (
        <>
          <Aviso mensagem={estado.mensagem} />
          <button type="button" className="botao discreto" onClick={carregar}>
            Tentar novamente
          </button>
        </>
      ) : null}

      {/* Nenhum plano ativo não é erro: é a plataforma ainda não ter aberto
          contratações. Dizer isso evita a leitura de "site quebrado". */}
      {estado.nome === 'pronto' && estado.planos.length === 0 ? (
        <div className="card">
          <p>As contratações ainda não foram abertas. Volte em breve.</p>
        </div>
      ) : null}

      {estado.nome === 'pronto' && estado.planos.length > 0 ? (
        <div className="grade-planos">
          {estado.planos.map(({ plano, trialDias }) => {
            const funcionalidades = Array.isArray(plano.funcionalidades)
              ? (plano.funcionalidades as string[])
              : [];

            return (
              <article className="plano" key={plano.id}>
                {trialDias ? <span className="selo-trial">{trialDias} dias grátis</span> : null}
                <span className="nome">{plano.nome}</span>
                <span className="preco">
                  {moeda(Number(plano.valor_mensal))}
                  <small> /mês</small>
                </span>

                <ul>
                  <li>{limiteDeFuncionarios(plano)}</li>
                  {funcionalidades.map((chave) => (
                    <li key={chave}>{rotuloDeFuncionalidade(chave)}</li>
                  ))}
                </ul>

                <div className="acao">
                  <button
                    type="button"
                    className="botao"
                    onClick={() => navegar(`/cadastro?plano=${encodeURIComponent(plano.slug)}`)}
                  >
                    Contratar
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}
