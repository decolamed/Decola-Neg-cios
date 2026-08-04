/**
 * Lista de empresas — Seção 7.15 B.
 *
 * "Busca e filtro por status (`ativa`, `suspensa`, `inativa`) e por plano" +
 * botão Criar empresa (ativação manual, Seção 6.9).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Plano } from '@decola/types';
import {
  Aviso,
  Carregando,
  CampoTexto,
  ErroComRetry,
  Modal,
  Seletor,
  Vazio,
} from '@/componentes/Basicos';
import {
  criarEmpresaManualmente,
  listarEmpresas,
  ROTULO_STATUS_ASSINATURA,
  ROTULO_STATUS_EMPRESA,
  type EmpresaNaLista,
  type StatusEmpresa,
} from '@/dados/empresas';
import { listarPlanos } from '@/dados/planos';
import { dataBR, moeda } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; empresas: EmpresaNaLista[] }
  | { nome: 'erro'; mensagem: string };

const TOM_DO_STATUS: Record<StatusEmpresa, string> = {
  ativa: 'positivo',
  suspensa: 'negativo',
  inativa: '',
};

export function Empresas() {
  const navegar = useNavigate();

  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusEmpresa | ''>('');
  const [planoId, setPlanoId] = useState('');
  const [criando, setCriando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      const [empresas, listaDePlanos] = await Promise.all([
        listarEmpresas({ busca, status, planoId }),
        listarPlanos(),
      ]);
      setPlanos(listaDePlanos);
      setEstado({ nome: 'pronto', empresas });
    } catch (e) {
      setEstado({
        nome: 'erro',
        mensagem: e instanceof Error ? e.message : 'Não foi possível carregar as empresas.',
      });
    }
  }, [busca, status, planoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <>
      <div className="cabecalho">
        <h1>Empresas</h1>
        <button type="button" className="botao" onClick={() => setCriando(true)}>
          Criar empresa
        </button>
      </div>

      {mensagem ? <Aviso mensagem={mensagem} tom="sucesso" /> : null}

      <div className="filtros">
        <CampoTexto rotulo="Buscar por nome" valor={busca} aoMudar={setBusca} />
        <Seletor<StatusEmpresa | ''>
          rotulo="Status da conta"
          valor={status}
          aoMudar={setStatus}
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            { valor: 'ativa', rotulo: 'Ativa' },
            { valor: 'suspensa', rotulo: 'Suspensa' },
            { valor: 'inativa', rotulo: 'Encerrada' },
          ]}
        />
        <Seletor
          rotulo="Plano"
          valor={planoId}
          aoMudar={setPlanoId}
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            ...planos.map((p) => ({ valor: p.id, rotulo: p.nome })),
          ]}
        />
      </div>

      {estado.nome === 'carregando' ? <Carregando /> : null}

      {estado.nome === 'erro' ? (
        <ErroComRetry mensagem={estado.mensagem} aoTentarNovamente={carregar} />
      ) : null}

      {estado.nome === 'pronto' && estado.empresas.length === 0 ? (
        <Vazio
          mensagem={
            busca || status || planoId
              ? 'Nenhuma empresa encontrada com estes filtros.'
              : 'Nenhuma empresa cadastrada ainda.'
          }
        />
      ) : null}

      {estado.nome === 'pronto' && estado.empresas.length > 0 ? (
        <table className="tabela">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Conta</th>
              <th>Plano</th>
              <th>Assinatura</th>
              <th>Valor</th>
              <th>Criada em</th>
            </tr>
          </thead>
          <tbody>
            {estado.empresas.map((empresa) => (
              <tr
                key={empresa.id}
                className="clicavel"
                onClick={() => navegar(`/empresas/${empresa.id}`)}
              >
                <td className="destaque">{empresa.nome}</td>
                <td>
                  <span className={`badge ${TOM_DO_STATUS[empresa.status]}`}>
                    {ROTULO_STATUS_EMPRESA[empresa.status]}
                  </span>
                </td>
                <td>{empresa.assinatura?.plano?.nome ?? '—'}</td>
                <td>
                  {empresa.assinatura ? (
                    <>
                      {ROTULO_STATUS_ASSINATURA[empresa.assinatura.status]}
                      {empresa.assinatura.ativada_manualmente ? (
                        <span className="badge" style={{ marginLeft: 'var(--espaco-sm)' }}>
                          manual
                        </span>
                      ) : null}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {empresa.assinatura ? moeda(empresa.assinatura.valor_contratado) : '—'}
                </td>
                <td>{dataBR(empresa.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {criando ? (
        <FormularioDeCriacao
          planos={planos}
          aoFechar={() => setCriando(false)}
          aoCriar={(texto) => {
            setCriando(false);
            setMensagem(texto);
            void carregar();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Formulário "Criar empresa" — Seções 6.9 e 7.15 B.
 * "campos: nome da empresa, dados do responsável, e-mail, plano, status da
 *  conta." Não passa pelo fluxo de pagamento do Asaas.
 */
function FormularioDeCriacao({
  planos,
  aoFechar,
  aoCriar,
}: {
  planos: Plano[];
  aoFechar: () => void;
  aoCriar: (mensagem: string) => void;
}) {
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelEmail, setResponsavelEmail] = useState('');
  const [planoId, setPlanoId] = useState(planos[0]?.id ?? '');
  const [status, setStatus] = useState<StatusEmpresa>('ativa');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(responsavelEmail.trim());
  const completo =
    nomeEmpresa.trim() && responsavelNome.trim() && emailValido && planoId;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);

    try {
      const resultado = await criarEmpresaManualmente({
        nomeEmpresa,
        responsavelNome,
        responsavelEmail,
        planoId,
        status,
      });

      aoCriar(
        resultado.conta_criada
          ? `Empresa criada. ${
              resultado.convite_enviado
                ? 'Enviamos ao responsável um e-mail para definir a senha.'
                : 'Não foi possível enviar o e-mail de senha — reenvie pelo painel do Supabase.'
            }`
          : 'Empresa criada e vinculada à conta que já existia com este e-mail.',
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a empresa.');
    } finally {
      setSalvando(false);
    }
  };

  if (planos.length === 0) {
    return (
      <Modal titulo="Criar empresa" aoFechar={aoFechar}>
        <Aviso mensagem="Cadastre um plano antes de criar uma empresa." tom="alerta" />
        <button type="button" className="botao discreto" onClick={aoFechar}>
          Fechar
        </button>
      </Modal>
    );
  }

  return (
    <Modal titulo="Criar empresa" aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        {erro ? <Aviso mensagem={erro} /> : null}

        <CampoTexto
          rotulo="Nome da empresa"
          valor={nomeEmpresa}
          aoMudar={setNomeEmpresa}
          desabilitado={salvando}
        />
        <CampoTexto
          rotulo="Nome do responsável"
          valor={responsavelNome}
          aoMudar={setResponsavelNome}
          desabilitado={salvando}
        />
        <CampoTexto
          rotulo="E-mail do responsável"
          valor={responsavelEmail}
          aoMudar={setResponsavelEmail}
          tipo="email"
          desabilitado={salvando}
          erro={responsavelEmail && !emailValido ? 'Informe um e-mail válido.' : null}
        />

        <div className="linha-campos">
          <Seletor
            rotulo="Plano"
            valor={planoId}
            aoMudar={setPlanoId}
            desabilitado={salvando}
            opcoes={planos.map((p) => ({
              valor: p.id,
              rotulo: `${p.nome} — ${moeda(p.valor_mensal)}${p.ativo ? '' : ' (inativo)'}`,
            }))}
          />
          <Seletor<StatusEmpresa>
            rotulo="Status da conta"
            valor={status}
            aoMudar={setStatus}
            desabilitado={salvando}
            opcoes={[
              { valor: 'ativa', rotulo: 'Ativa' },
              { valor: 'suspensa', rotulo: 'Suspensa' },
              { valor: 'inativa', rotulo: 'Encerrada' },
            ]}
          />
        </div>

        <p className="legenda">
          A assinatura nasce ativa e marcada como ativação manual — não passa pelo fluxo de
          pagamento. Se o e-mail já tiver conta sem empresa, ela é reaproveitada; se já estiver
          vinculada a outra empresa, a criação é recusada.
        </p>

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button type="submit" className="botao" disabled={salvando || !completo}>
            {salvando ? 'Criando…' : 'Criar empresa'}
          </button>
          <button type="button" className="botao discreto" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
