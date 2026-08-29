/**
 * Detalhe da empresa — Seção 7.15 B.
 *
 * "Abre detalhes: dados da conta, plano atual, status da assinatura, usuários
 *  vinculados" e as ações administrativas: alterar plano, ativar manualmente,
 *  suspender, reativar, alterar período de teste, excluir definitivamente.
 *
 * Toda ação passa por RPC que revalida `eh_admin_plataforma()` — esconder ou
 * mostrar botão aqui é conveniência de tela, nunca a garantia (Seção 9.1).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Plano } from '@decola/types';
import {
  Aviso,
  CampoTexto,
  Carregando,
  ErroComRetry,
  Modal,
  Seletor,
} from '@/componentes/Basicos';
import {
  alterarPlano,
  ativarAssinatura,
  carregarEmpresa,
  definirStatus,
  definirTrial,
  excluirEmpresa,
  reenviarAcesso,
  ROTULO_STATUS_ASSINATURA,
  ROTULO_STATUS_EMPRESA,
  type DetalheDaEmpresa,
} from '@/dados/empresas';
import { listarPlanos } from '@/dados/planos';
import { dataBR, dataHoraBR, moeda, paraCampoData } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; detalhe: DetalheDaEmpresa }
  | { nome: 'erro'; mensagem: string };

type Dialogo = 'plano' | 'trial' | 'excluir' | null;

const ROTULO_PAPEL: Record<string, string> = {
  gestor_principal: 'Gestor Principal',
  gestor: 'Gestor',
  funcionario: 'Funcionário',
};

const ROTULO_VINCULO: Record<string, string> = {
  convidado: 'Convite pendente',
  ativo: 'Ativo',
  removido: 'Removido',
};

export function EmpresaDetalhe() {
  const { id = '' } = useParams();
  const navegar = useNavigate();

  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'erro' | 'sucesso' } | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const [detalhe, listaDePlanos] = await Promise.all([carregarEmpresa(id), listarPlanos()]);
      if (!detalhe) {
        setEstado({ nome: 'erro', mensagem: 'Empresa não encontrada.' });
        return;
      }
      setPlanos(listaDePlanos);
      setEstado({ nome: 'pronto', detalhe });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar a empresa.',
      });
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.nome === 'carregando') return <Carregando />;
  if (estado.nome === 'erro') {
    return <ErroComRetry mensagem={estado.mensagem} aoTentarNovamente={carregar} />;
  }

  const { empresa, usuarios } = estado.detalhe;
  const assinatura = empresa.assinatura;

  const executar = async (acao: () => Promise<void>, sucesso: string) => {
    setProcessando(true);
    setAviso(null);
    try {
      await acao();
      setAviso({ texto: sucesso, tom: 'sucesso' });
      setDialogo(null);
      await carregar();
    } catch (e) {
      setAviso({
        texto: e instanceof Error ? e.message : 'Não foi possível concluir a ação.',
        tom: 'erro',
      });
    } finally {
      setProcessando(false);
    }
  };

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>{empresa.nome}</h1>
          <p className="legenda">
            Criada em {dataBR(empresa.criado_em)} · {ROTULO_STATUS_EMPRESA[empresa.status]}
            {empresa.encerrada_em ? ` em ${dataBR(empresa.encerrada_em)}` : ''}
          </p>
        </div>
        <button type="button" className="botao discreto" onClick={() => navegar('/empresas')}>
          Voltar
        </button>
      </div>

      {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}

      <div className="card">
        <h2>Assinatura</h2>
        {assinatura ? (
          <table className="tabela" style={{ boxShadow: 'none' }}>
            <tbody>
              <Linha rotulo="Plano atual" valor={assinatura.plano?.nome ?? '—'} />
              <Linha rotulo="Valor contratado" valor={moeda(assinatura.valor_contratado)} />
              <Linha rotulo="Status" valor={ROTULO_STATUS_ASSINATURA[assinatura.status]} />
              <Linha
                rotulo="Ativação"
                valor={assinatura.ativada_manualmente ? 'Manual (sem Asaas)' : 'Pelo Asaas'}
              />
              <Linha rotulo="Teste até" valor={dataHoraBR(assinatura.trial_expira_em)} />
              <Linha rotulo="Carência até" valor={dataHoraBR(assinatura.carencia_expira_em)} />
              <Linha rotulo="Próximo vencimento" valor={dataBR(assinatura.proximo_vencimento)} />
              {assinatura.plano_agendado_id ? (
                <Linha
                  rotulo="Troca agendada"
                  valor={`${
                    planos.find((p) => p.id === assinatura.plano_agendado_id)?.nome ?? 'Outro plano'
                  } em ${dataBR(assinatura.troca_agendada_para)}`}
                />
              ) : null}
            </tbody>
          </table>
        ) : (
          <p className="vazio">Esta empresa não tem assinatura vigente.</p>
        )}
      </div>

      <div className="card">
        <h2>Ações administrativas</h2>
        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          {empresa.status !== 'ativa' ? (
            <button
              type="button"
              className="botao secundario"
              disabled={processando}
              onClick={() =>
                executar(() => definirStatus(empresa.id, 'ativa'), 'Empresa reativada.')
              }
            >
              Reativar
            </button>
          ) : null}

          {empresa.status !== 'suspensa' ? (
            <button
              type="button"
              className="botao discreto"
              disabled={processando}
              onClick={() =>
                executar(
                  () => definirStatus(empresa.id, 'suspensa'),
                  'Empresa suspensa. Os dados continuam preservados.',
                )
              }
            >
              Suspender
            </button>
          ) : null}

          {empresa.status !== 'inativa' ? (
            <button
              type="button"
              className="botao discreto"
              disabled={processando}
              onClick={() =>
                executar(
                  () => definirStatus(empresa.id, 'inativa'),
                  'Empresa marcada como encerrada. Nenhum dado foi apagado.',
                )
              }
            >
              Encerrar
            </button>
          ) : null}

          {assinatura ? (
            <>
              <button
                type="button"
                className="botao discreto"
                disabled={processando}
                onClick={() => setDialogo('plano')}
              >
                Alterar plano
              </button>

              {assinatura.status !== 'ativa' || !assinatura.ativada_manualmente ? (
                <button
                  type="button"
                  className="botao discreto"
                  disabled={processando}
                  onClick={() =>
                    executar(
                      () => ativarAssinatura(empresa.id),
                      'Assinatura ativada manualmente. O acesso completo foi liberado.',
                    )
                  }
                >
                  Ativar manualmente
                </button>
              ) : null}

              <button
                type="button"
                className="botao discreto"
                disabled={processando}
                onClick={() => setDialogo('trial')}
              >
                Alterar período de teste
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="botao"
            disabled={processando}
            onClick={() => setDialogo('excluir')}
          >
            Excluir definitivamente
          </button>
        </div>

        <p className="legenda" style={{ marginTop: 'var(--espaco-md)' }}>
          Suspender e encerrar preservam todos os dados e são reversíveis. Excluir definitivamente
          não é.
        </p>
      </div>

      <div className="card">
        <h2>Usuários vinculados</h2>
        {usuarios.length === 0 ? (
          <p className="vazio">Nenhum usuário vinculado.</p>
        ) : (
          <table className="tabela" style={{ boxShadow: 'none' }}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th>Situação</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td>{usuario.nome_convite}</td>
                  <td>{usuario.email_convite}</td>
                  <td>{ROTULO_PAPEL[usuario.papel] ?? usuario.papel}</td>
                  <td>{ROTULO_VINCULO[usuario.status] ?? usuario.status}</td>
                  <td>
                    {/* A criação manual já dispara este e-mail uma vez. O botão
                        existe porque ele se perde — spam, link expirado, e-mail
                        digitado errado e corrigido depois. */}
                    <button
                      type="button"
                      className="botao discreto"
                      disabled={processando || !usuario.email_convite}
                      onClick={() =>
                        executar(
                          () => reenviarAcesso(usuario.email_convite as string),
                          `Link de acesso enviado para ${usuario.email_convite}.`,
                        )
                      }
                    >
                      Enviar link de acesso
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialogo === 'plano' && assinatura ? (
        <DialogoDePlano
          planos={planos}
          planoAtual={assinatura.plano_id}
          valorAtual={assinatura.valor_contratado}
          processando={processando}
          aoFechar={() => setDialogo(null)}
          aoConfirmar={(planoId, valor) =>
            executar(() => alterarPlano(empresa.id, planoId, valor), 'Plano alterado.')
          }
        />
      ) : null}

      {dialogo === 'trial' && assinatura ? (
        <DialogoDeTrial
          valorAtual={paraCampoData(assinatura.trial_expira_em)}
          processando={processando}
          aoFechar={() => setDialogo(null)}
          aoConfirmar={(data) =>
            executar(() => definirTrial(empresa.id, data), 'Período de teste atualizado.')
          }
        />
      ) : null}

      {dialogo === 'excluir' ? (
        <DialogoDeExclusao
          nomeEmpresa={empresa.nome}
          processando={processando}
          aoFechar={() => setDialogo(null)}
          aoConfirmar={async (confirmacao) => {
            setProcessando(true);
            setAviso(null);
            try {
              await excluirEmpresa(empresa.id, confirmacao);
              navegar('/empresas');
            } catch (e) {
              setAviso({
                texto: e instanceof Error ? e.message : 'Não foi possível excluir a empresa.',
                tom: 'erro',
              });
              setProcessando(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <tr>
      <td className="legenda">{rotulo}</td>
      <td className="destaque">{valor}</td>
    </tr>
  );
}

/**
 * Seção 7.15 B/C — a troca administrativa pode fixar um valor diferente do de
 * tabela: o preço mora na assinatura, não no plano.
 */
function DialogoDePlano({
  planos,
  planoAtual,
  valorAtual,
  processando,
  aoFechar,
  aoConfirmar,
}: {
  planos: Plano[];
  planoAtual: string;
  valorAtual: number;
  processando: boolean;
  aoFechar: () => void;
  aoConfirmar: (planoId: string, valor: number) => void;
}) {
  const [planoId, setPlanoId] = useState(planoAtual);
  const [valor, setValor] = useState(String(valorAtual));

  const escolhido = planos.find((p) => p.id === planoId);
  const numero = Number(valor.replace(',', '.'));
  const valido = Number.isFinite(numero) && numero >= 0;

  return (
    <Modal titulo="Alterar plano da empresa" aoFechar={aoFechar}>
      <form
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault();
          if (valido) aoConfirmar(planoId, numero);
        }}
      >
        <Seletor
          rotulo="Plano"
          valor={planoId}
          aoMudar={(novo) => {
            setPlanoId(novo);
            const plano = planos.find((p) => p.id === novo);
            if (plano) setValor(String(plano.valor_mensal));
          }}
          desabilitado={processando}
          opcoes={planos.map((p) => ({
            valor: p.id,
            rotulo: `${p.nome} — ${moeda(p.valor_mensal)}${p.ativo ? '' : ' (inativo)'}`,
          }))}
        />

        <CampoTexto
          rotulo="Valor mensal a cobrar"
          valor={valor}
          aoMudar={setValor}
          desabilitado={processando}
          erro={valido ? null : 'Informe um valor igual ou maior que zero.'}
        />

        <p className="legenda">
          Vale desta empresa em diante, sem agendamento — diferente da troca feita pelo Gestor no
          app, em que o downgrade só entra no próximo ciclo. Valor de tabela do plano
          {escolhido ? ` ${escolhido.nome}` : ''}: {escolhido ? moeda(escolhido.valor_mensal) : '—'}.
        </p>

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button type="submit" className="botao" disabled={processando || !valido}>
            Confirmar
          </button>
          <button type="button" className="botao discreto" onClick={aoFechar} disabled={processando}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DialogoDeTrial({
  valorAtual,
  processando,
  aoFechar,
  aoConfirmar,
}: {
  valorAtual: string;
  processando: boolean;
  aoFechar: () => void;
  aoConfirmar: (data: Date) => void;
}) {
  const [data, setData] = useState(valorAtual);
  const valido = data.length === 10;

  return (
    <Modal titulo="Alterar período de teste" aoFechar={aoFechar}>
      <form
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault();
          // Fim do dia escolhido: o teste vale o dia inteiro.
          if (valido) aoConfirmar(new Date(`${data}T23:59:59`));
        }}
      >
        <CampoTexto
          rotulo="Teste válido até"
          valor={data}
          aoMudar={setData}
          tipo="date"
          desabilitado={processando}
        />

        <p className="legenda">
          Vale só para esta empresa — não altera a duração padrão do trial em Configurações SaaS.
          Uma data futura devolve o acesso a uma conta que já tenha caído em modo limitado.
        </p>

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button type="submit" className="botao" disabled={processando || !valido}>
            Confirmar
          </button>
          <button type="button" className="botao discreto" onClick={aoFechar} disabled={processando}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Seção 7.15 B — "exige confirmação explícita (ex: digitar o nome da
 * empresa); remove os dados permanentemente". A mesma confirmação é conferida
 * de novo no servidor.
 */
function DialogoDeExclusao({
  nomeEmpresa,
  processando,
  aoFechar,
  aoConfirmar,
}: {
  nomeEmpresa: string;
  processando: boolean;
  aoFechar: () => void;
  aoConfirmar: (confirmacao: string) => void;
}) {
  const [texto, setTexto] = useState('');
  const confere = texto.trim() === nomeEmpresa.trim();

  return (
    <Modal titulo="Excluir empresa definitivamente" aoFechar={aoFechar}>
      <form
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault();
          if (confere) aoConfirmar(texto);
        }}
      >
        <Aviso
          mensagem={
            'Esta ação remove permanentemente a empresa e todos os seus dados: produtos, vendas, ' +
            'financeiro, usuários e histórico. Não há como desfazer. Para apenas tirar a empresa ' +
            'do ar preservando tudo, use Suspender ou Encerrar.'
          }
        />

        <CampoTexto
          rotulo={`Digite "${nomeEmpresa}" para confirmar`}
          valor={texto}
          aoMudar={setTexto}
          desabilitado={processando}
        />

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button type="submit" className="botao" disabled={processando || !confere}>
            {processando ? 'Excluindo…' : 'Excluir definitivamente'}
          </button>
          <button type="button" className="botao discreto" onClick={aoFechar} disabled={processando}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
