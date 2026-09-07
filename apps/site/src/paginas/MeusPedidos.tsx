/**
 * Meus pedidos — `/loja/:slug/pedidos`.
 *
 * A quarta aba da barra da loja. Existe por um motivo concreto: até aqui, o
 * único caminho de volta a um pedido era o link recebido. Quem apagava a
 * conversa do WhatsApp perdia o pedido de vista e ligava para a loja.
 *
 * A tela mostra primeiro o que não custa nada: os pedidos feitos NESTE
 * aparelho, que estão guardados no próprio navegador e aparecem sem digitar
 * nada. Entrar com o telefone é o degrau seguinte, para quem trocou de celular
 * ou limpou o navegador — e aí o número precisa ser confirmado por código,
 * senão bastaria teclar o número do vizinho para ver o que ele comprou.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, CampoTexto, Carregando } from '@/componentes/Basicos';
import { MolduraDaLoja } from '@/componentes/MolduraDaLoja';
import { carregarLoja, moeda, type Loja as TipoLoja } from '@/dados/loja';
import {
  confirmarCodigo,
  enviarCodigo,
  listarMeusPedidos,
  pedidosDesteAparelho,
  sairDaConta,
  telefoneConectado,
  type PedidoDoCliente,
  type PedidoLocal,
} from '@/dados/pedidosDoCliente';

const ROTULO_STATUS: Record<string, string> = {
  aguardando_pagamento: 'Aguardando pagamento',
  recebido: 'Recebido pela loja',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  a_caminho: 'A caminho',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

function data(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Entrada = { etapa: 'numero' | 'codigo'; telefone: string; codigo: string };

export function MeusPedidos() {
  const { slug = '' } = useParams<{ slug: string }>();

  const [loja, setLoja] = useState<TipoLoja | null | 'inexistente'>(null);
  const [locais, setLocais] = useState<PedidoLocal[]>([]);
  const [conectado, setConectado] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoDoCliente[] | null>(null);

  const [entrada, setEntrada] = useState<Entrada>({ etapa: 'numero', telefone: '', codigo: '' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLocais(pedidosDesteAparelho(slug));

    const encontrada = await carregarLoja(slug);
    setLoja(encontrada ?? 'inexistente');

    const telefone = await telefoneConectado();
    setConectado(telefone);

    if (telefone) {
      try {
        // Sem `slug`: quem já se identificou vê o que comprou em qualquer
        // loja feita com o Decola, não só nesta.
        setPedidos(await listarMeusPedidos());
      } catch (e) {
        setErro(e instanceof Error ? e.message : null);
      }
    }
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pedirCodigo = useCallback(async () => {
    setErro(null);
    setOcupado(true);
    try {
      await enviarCodigo(entrada.telefone);
      setEntrada((e) => ({ ...e, etapa: 'codigo' }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o código.');
    } finally {
      setOcupado(false);
    }
  }, [entrada.telefone]);

  const entrar = useCallback(async () => {
    setErro(null);
    setOcupado(true);
    try {
      await confirmarCodigo(entrada.telefone, entrada.codigo);
      setEntrada({ etapa: 'numero', telefone: '', codigo: '' });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar.');
    } finally {
      setOcupado(false);
    }
  }, [entrada, carregar]);

  const sair = useCallback(async () => {
    await sairDaConta();
    setConectado(null);
    setPedidos(null);
  }, []);

  if (loja === null) {
    return (
      <main className="pagina">
        <Carregando />
      </main>
    );
  }

  if (loja === 'inexistente') {
    return (
      <main className="pagina estreita">
        <div className="centralizado">
          <h1>Loja não encontrada</h1>
        </div>
      </main>
    );
  }

  return (
    <MolduraDaLoja loja={loja}>
      <main className="pagina estreita">
        <div className="cabecalho-pagina">
          <h1>Meus pedidos</h1>
        </div>

        {erro ? <Aviso mensagem={erro} /> : null}

        {/* ------------------------------------------- pedidos do telefone */}
        {conectado ? (
          <>
            <div className="card conectado">
              <div>
                <strong>Você entrou</strong>
                <p className="legenda">{conectado}</p>
              </div>
              <button type="button" className="botao texto" onClick={sair}>
                Sair
              </button>
            </div>

            {pedidos === null ? (
              <Carregando />
            ) : pedidos.length === 0 ? (
              <div className="card">
                <p>Ainda não encontramos pedidos feitos com este telefone.</p>
                <Link className="botao" to={`/loja/${slug}`}>
                  Ver a loja
                </Link>
              </div>
            ) : (
              <div className="lista-pedidos">
                {pedidos.map((pedido) => (
                  <Link key={pedido.token} to={`/pedido/${pedido.token}`} className="pedido-linha">
                    <div className="pedido-linha-topo">
                      <strong>#{pedido.numero}</strong>
                      <span className={`selo ${pedido.modalidade}`}>
                        {pedido.modalidade === 'entrega' ? 'Entrega' : 'Retirada'}
                      </span>
                    </div>
                    <span className="pedido-status">
                      {ROTULO_STATUS[pedido.status] ?? pedido.status}
                    </span>
                    <div className="pedido-linha-rodape">
                      <span className="legenda">
                        {pedido.loja_nome} · {data(pedido.criado_em)}
                      </span>
                      <strong>{moeda(Number(pedido.subtotal))}</strong>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* -------------------------------------- pedidos deste aparelho */}
            {locais.length > 0 ? (
              <section className="loja-secao">
                <h2 className="loja-secao-titulo">Pedidos deste aparelho</h2>
                <div className="lista-pedidos">
                  {locais.map((pedido) => (
                    <Link
                      key={pedido.token}
                      to={`/pedido/${pedido.token}`}
                      className="pedido-linha"
                    >
                      <div className="pedido-linha-topo">
                        <strong>#{pedido.numero}</strong>
                        <span className="legenda">{data(pedido.criadoEm)}</span>
                      </div>
                      <span className="pedido-status">Ver o pedido →</span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ------------------------------------------------- entrar */}
            <section className="loja-secao">
              <h2 className="loja-secao-titulo">
                {locais.length > 0 ? 'Comprou por outro celular?' : 'Ver meus pedidos'}
              </h2>
              <div className="card">
                {entrada.etapa === 'numero' ? (
                  <>
                    <p className="legenda">
                      Informe o mesmo telefone que você usou no pedido. Mandamos um código por SMS
                      para confirmar que o número é seu.
                    </p>
                    <CampoTexto
                      rotulo="Celular com DDD"
                      valor={entrada.telefone}
                      aoMudar={(v) => setEntrada((e) => ({ ...e, telefone: v }))}
                      bloqueado={ocupado}
                      placeholder="(81) 9 9999-9999"
                    />
                    <button
                      type="button"
                      className="botao"
                      onClick={pedirCodigo}
                      disabled={ocupado || entrada.telefone.trim().length < 10}
                    >
                      {ocupado ? 'Enviando…' : 'Receber código'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="legenda">
                      Digite o código que enviamos para <strong>{entrada.telefone}</strong>.
                    </p>
                    <CampoTexto
                      rotulo="Código recebido"
                      valor={entrada.codigo}
                      aoMudar={(v) => setEntrada((e) => ({ ...e, codigo: v }))}
                      bloqueado={ocupado}
                      placeholder="000000"
                    />
                    <button
                      type="button"
                      className="botao"
                      onClick={entrar}
                      disabled={ocupado || entrada.codigo.trim().length < 4}
                    >
                      {ocupado ? 'Entrando…' : 'Entrar'}
                    </button>
                    <button
                      type="button"
                      className="botao texto"
                      onClick={() => setEntrada((e) => ({ ...e, etapa: 'numero', codigo: '' }))}
                      disabled={ocupado}
                    >
                      Usar outro número
                    </button>
                  </>
                )}
              </div>
            </section>

            {locais.length === 0 ? (
              <p className="legenda">
                Você também pode abrir um pedido pelo link que recebeu ao finalizá-lo — ele
                continua valendo.
              </p>
            ) : null}
          </>
        )}
      </main>
    </MolduraDaLoja>
  );
}
