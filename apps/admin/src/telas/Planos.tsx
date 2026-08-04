/**
 * Planos — Seções 6.1, 6.3 e 7.15 C.
 *
 * "Ao salvar, o plano fica disponível imediatamente na Escolha do Plano, sem
 *  alteração de código" — é o que já acontece: o app carrega `planos` do banco
 *  a cada abertura da tela.
 *
 * Duas regras que a tela precisa deixar visíveis, porque são contraintuitivas:
 *  - alterar o valor NÃO mexe em quem já assina (preço legado, Seção 7.15 C);
 *  - desativar tira o plano só das NOVAS contratações (Seção 6.1).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Plano } from '@decola/types';
import {
  Aviso,
  Campo,
  CampoTexto,
  Carregando,
  ErroComRetry,
  Modal,
  Vazio,
} from '@/componentes/Basicos';
import {
  criarPlano,
  definirPlanoAtivo,
  editarPlano,
  linkDoPlano,
  listarPlanos,
  paraFormulario,
  type DadosDoPlano,
} from '@/dados/planos';
import { moeda, paraSlug } from '@/lib/formato';

type Estado =
  | { nome: 'carregando' }
  | { nome: 'pronto'; planos: Plano[] }
  | { nome: 'erro'; mensagem: string };

const VAZIO: DadosDoPlano = {
  nome: '',
  valor_mensal: 0,
  slug: '',
  ativo: true,
  funcionalidades: [],
  max_funcionarios: null,
};

export function Planos() {
  const [estado, setEstado] = useState<Estado>({ nome: 'carregando' });
  const [editando, setEditando] = useState<{ id: string | null; dados: DadosDoPlano } | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; tom: 'erro' | 'sucesso' } | null>(null);

  const carregar = useCallback(async () => {
    setEstado({ nome: 'carregando' });
    try {
      setEstado({ nome: 'pronto', planos: await listarPlanos() });
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

  const alternarAtivo = async (plano: Plano) => {
    setAviso(null);
    try {
      await definirPlanoAtivo(plano.id, !plano.ativo);
      setAviso({
        texto: plano.ativo
          ? `"${plano.nome}" saiu das novas contratações. Quem já assina continua normalmente.`
          : `"${plano.nome}" voltou a aparecer para novas contratações.`,
        tom: 'sucesso',
      });
      await carregar();
    } catch (e) {
      setAviso({
        texto: e instanceof Error ? e.message : 'Não foi possível alterar o plano.',
        tom: 'erro',
      });
    }
  };

  const copiarLink = async (plano: Plano) => {
    const link = linkDoPlano(plano.slug);
    try {
      await navigator.clipboard.writeText(link);
      setAviso({ texto: `Link copiado: ${link}`, tom: 'sucesso' });
    } catch {
      // Clipboard bloqueado (contexto não seguro): mostrar o link resolve.
      setAviso({ texto: `Link do plano: ${link}`, tom: 'sucesso' });
    }
  };

  return (
    <>
      <div className="cabecalho">
        <h1>Planos</h1>
        <button type="button" className="botao" onClick={() => setEditando({ id: null, dados: VAZIO })}>
          Criar plano
        </button>
      </div>

      {aviso ? <Aviso mensagem={aviso.texto} tom={aviso.tom} /> : null}

      {estado.nome === 'carregando' ? <Carregando /> : null}
      {estado.nome === 'erro' ? (
        <ErroComRetry mensagem={estado.mensagem} aoTentarNovamente={carregar} />
      ) : null}

      {estado.nome === 'pronto' && estado.planos.length === 0 ? (
        <Vazio mensagem="Nenhum plano cadastrado. Crie o primeiro para abrir as contratações." />
      ) : null}

      {estado.nome === 'pronto' && estado.planos.length > 0 ? (
        <table className="tabela">
          <thead>
            <tr>
              <th>Plano</th>
              <th>Valor</th>
              <th>Funcionários</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {estado.planos.map((plano) => {
              const dados = paraFormulario(plano);
              return (
                <tr key={plano.id}>
                  <td>
                    <span className="destaque">{plano.nome}</span>
                    <br />
                    <span className="legenda">/{plano.slug}</span>
                  </td>
                  <td>{moeda(plano.valor_mensal)}</td>
                  <td>
                    {dados.max_funcionarios === null ? 'Sem limite' : `Até ${dados.max_funcionarios}`}
                  </td>
                  <td>
                    <span className={`badge ${plano.ativo ? 'positivo' : ''}`}>
                      {plano.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="acoes">
                      <button
                        type="button"
                        className="botao discreto"
                        onClick={() => setEditando({ id: plano.id, dados })}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="botao discreto"
                        onClick={() => alternarAtivo(plano)}
                      >
                        {plano.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        className="botao discreto"
                        onClick={() => copiarLink(plano)}
                      >
                        Copiar link
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {editando ? (
        <FormularioDePlano
          id={editando.id}
          inicial={editando.dados}
          aoFechar={() => setEditando(null)}
          aoSalvar={(texto) => {
            setEditando(null);
            setAviso({ texto, tom: 'sucesso' });
            void carregar();
          }}
        />
      ) : null}
    </>
  );
}

function FormularioDePlano({
  id,
  inicial,
  aoFechar,
  aoSalvar,
}: {
  id: string | null;
  inicial: DadosDoPlano;
  aoFechar: () => void;
  aoSalvar: (mensagem: string) => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [valor, setValor] = useState(String(inicial.valor_mensal));
  const [slug, setSlug] = useState(inicial.slug);
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [semLimite, setSemLimite] = useState(inicial.max_funcionarios === null);
  const [maxFuncionarios, setMaxFuncionarios] = useState(String(inicial.max_funcionarios ?? 5));
  const [funcionalidades, setFuncionalidades] = useState(inicial.funcionalidades.join('\n'));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const numeroValor = Number(valor.replace(',', '.'));
  const numeroMax = Number(maxFuncionarios);
  const valorValido = Number.isFinite(numeroValor) && numeroValor >= 0;
  const maxValido = semLimite || (Number.isInteger(numeroMax) && numeroMax > 0);
  const completo = nome.trim() && slug.trim() && valorValido && maxValido;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setSalvando(true);

    const dados: DadosDoPlano = {
      nome,
      valor_mensal: numeroValor,
      slug: paraSlug(slug),
      ativo,
      funcionalidades: funcionalidades
        .split('\n')
        .map((linha) => linha.trim())
        .filter(Boolean),
      max_funcionarios: semLimite ? null : numeroMax,
    };

    try {
      if (id) {
        await editarPlano(id, dados);
        aoSalvar('Plano atualizado. Quem já assina mantém o valor contratado.');
      } else {
        await criarPlano(dados);
        aoSalvar('Plano criado. Ele já aparece na Escolha do Plano do app.');
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o plano.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={id ? 'Editar plano' : 'Criar plano'} aoFechar={aoFechar}>
      <form onSubmit={enviar}>
        {erro ? <Aviso mensagem={erro} /> : null}

        <CampoTexto
          rotulo="Nome"
          valor={nome}
          aoMudar={(novo) => {
            setNome(novo);
            // O slug acompanha o nome enquanto o plano é novo; num plano já
            // divulgado, mudá-lo quebraria o link direto (Seção 6.3).
            if (!id) setSlug(paraSlug(novo));
          }}
          desabilitado={salvando}
        />

        <div className="linha-campos">
          <CampoTexto
            rotulo="Valor mensal"
            valor={valor}
            aoMudar={setValor}
            desabilitado={salvando}
            erro={valorValido ? null : 'Informe um valor igual ou maior que zero.'}
          />
          <CampoTexto
            rotulo="Slug do link direto"
            valor={slug}
            aoMudar={setSlug}
            desabilitado={salvando}
          />
        </div>

        <Campo rotulo="Limite de funcionários">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--espaco-sm)' }}>
            <input
              type="checkbox"
              checked={semLimite}
              disabled={salvando}
              onChange={(e) => setSemLimite(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Sem limite</span>
          </label>
        </Campo>

        {!semLimite ? (
          <CampoTexto
            rotulo="Máximo de funcionários"
            valor={maxFuncionarios}
            aoMudar={setMaxFuncionarios}
            tipo="number"
            desabilitado={salvando}
            erro={maxValido ? null : 'Informe um número inteiro maior que zero.'}
          />
        ) : null}

        <Campo rotulo="Funcionalidades (uma chave por linha)">
          <textarea
            rows={4}
            value={funcionalidades}
            disabled={salvando}
            onChange={(e) => setFuncionalidades(e.target.value)}
            placeholder={'relatorios_avancados\nexportacao_pdf'}
          />
        </Campo>

        <Campo rotulo="Disponibilidade">
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--espaco-sm)' }}>
            <input
              type="checkbox"
              checked={ativo}
              disabled={salvando}
              onChange={(e) => setAtivo(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <span>Aberto a novas contratações</span>
          </label>
        </Campo>

        <p className="legenda">
          Alterar o valor não muda o que as empresas já pagam: o preço fica congelado na assinatura
          até o cliente trocar de plano ou o administrador alterar aquela assinatura.
        </p>

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <button type="submit" className="botao" disabled={salvando || !completo}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="botao discreto" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
