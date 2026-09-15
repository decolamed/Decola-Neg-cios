/**
 * Meus pedidos — `/:slug/pedidos`.
 *
 * A quarta aba da barra da loja. Existe por um motivo concreto: até aqui, o
 * único caminho de volta a um pedido era o link recebido. Quem apagava a
 * conversa do WhatsApp perdia o pedido de vista e ligava para a loja.
 *
 * DOIS CAMINHOS, em ordem de esforço.
 *
 * 1. ESTE APARELHO. Os pedidos feitos neste navegador aparecem sem digitar
 *    nada. É o caminho de quase todo mundo, porque quase todo mundo volta pelo
 *    mesmo celular em que comprou.
 *
 * 2. O TELEFONE. Para quem trocou de aparelho, limpou o navegador ou comprou
 *    pelo computador. Antes isto exigia um código por SMS — que é serviço pago,
 *    nunca foi ligado, e por isso a tela só sabia dizer "o envio por SMS ainda
 *    não está ligado nesta loja". Agora basta o número.
 *
 * O QUE ISSO CUSTA, dito porque não dá para disfarçar: sem verificação, quem
 * souber o telefone de outra pessoa vê os pedidos dela nesta loja. Foi uma
 * decisão de produto, tomada sabendo disso. O que continua valendo é o limite
 * da LOJA — o mesmo número não alcança as outras lojas da plataforma, e é o
 * banco que garante isso, não esta tela.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Aviso, CampoTexto } from '@/componentes/Basicos';
import { CarregandoLoja } from '@/componentes/CarregandoLoja';
import { MolduraDaLoja } from '@/componentes/MolduraDaLoja';
import {
  clienteDaLoja,
  esquecerCliente,
  identificarCliente,
  pedidosDoTelefone,
  telefoneFormatado,
  type PedidoDoCliente,
} from '@/dados/cliente';
import { carregarLoja, moeda, type Loja as TipoLoja } from '@/dados/loja';
import { pedidosDesteAparelho, type PedidoLocal } from '@/dados/pedidosDoCliente';

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

export function MeusPedidos() {
  const { slug = '' } = useParams<{ slug: string }>();

  const [loja, setLoja] = useState<TipoLoja | null | 'inexistente'>(null);
  const [locais, setLocais] = useState<PedidoLocal[]>([]);

  const [telefone, setTelefone] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<PedidoDoCliente[] | null>(null);

  const [digitado, setDigitado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void carregarLoja(slug)
      .then((l) => {
        if (vivo) setLoja(l ?? 'inexistente');
      })
      .catch(() => {
        if (vivo) setLoja('inexistente');
      });
    setLocais(pedidosDesteAparelho(slug));
    setTelefone(clienteDaLoja(slug));
    return () => {
      vivo = false;
    };
  }, [slug]);

  /**
   * Quem já se identificou nesta loja não digita de novo.
   *
   * A busca refaz a cada visita, e não guarda a lista: um pedido muda de status
   * enquanto a loja separa, e mostrar a foto de ontem seria pior do que uma
   * espera de meio segundo.
   */
  useEffect(() => {
    if (!telefone) {
      setPedidos(null);
      return;
    }
    let vivo = true;
    void pedidosDoTelefone(slug, telefone)
      .then((lista) => {
        if (vivo) setPedidos(lista);
      })
      .catch(() => {
        if (vivo) setPedidos([]);
      });
    return () => {
      vivo = false;
    };
  }, [slug, telefone]);

  const identificar = useCallback(async () => {
    setErro(null);
    setOcupado(true);
    try {
      const { telefone: numero, pedidos: lista } = await identificarCliente(slug, digitado);
      setTelefone(numero);
      setPedidos(lista);
      setDigitado('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível continuar.');
    } finally {
      setOcupado(false);
    }
  }, [slug, digitado]);

  const sair = useCallback(() => {
    esquecerCliente(slug);
    setTelefone(null);
    setPedidos(null);
  }, [slug]);

  if (loja === null) return <CarregandoLoja slug={slug} />;

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

        {telefone ? (
          <>
            <div className="card conectado">
              <div>
                <strong>{telefoneFormatado(telefone)}</strong>
                <p className="legenda">Seus pedidos nesta loja.</p>
              </div>
              <button type="button" className="botao texto" onClick={sair}>
                Trocar
              </button>
            </div>

            {pedidos === null ? (
              <p className="legenda">Buscando…</p>
            ) : pedidos.length === 0 ? (
              <div className="card">
                {/* Telefone novo NÃO É ERRO: é uma pessoa que ainda não comprou
                    aqui. O texto diz isso, em vez de sugerir que algo falhou. */}
                <p>Ainda não há pedidos feitos com este número nesta loja.</p>
                <p className="legenda">
                  A partir de agora, o que você comprar fica guardado neste número — inclusive o
                  carrinho, se você voltar por outro celular.
                </p>
                <Link className="botao" to={`/${slug}`}>
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
                      <span className="legenda">{data(pedido.criado_em)}</span>
                      <strong>{moeda(Number(pedido.subtotal))}</strong>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
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

            <section className="loja-secao">
              <h2 className="loja-secao-titulo">
                {locais.length > 0 ? 'Comprou por outro celular?' : 'Ver meus pedidos'}
              </h2>
              <div className="card">
                <p className="legenda" style={{ marginTop: 0 }}>
                  Informe seu número de celular para acessar seus pedidos e seu carrinho nesta loja.
                </p>
                <CampoTexto
                  rotulo="Celular com DDD"
                  valor={digitado}
                  aoMudar={(v) => {
                    setDigitado(v);
                    if (erro) setErro(null);
                  }}
                  bloqueado={ocupado}
                  placeholder="(81) 9 9999-9999"
                />
                <button
                  type="button"
                  className="botao"
                  onClick={identificar}
                  disabled={ocupado || digitado.replace(/\D/g, '').length < 10}
                >
                  {ocupado ? 'Buscando…' : 'Continuar'}
                </button>
                <p className="legenda">
                  Sem senha e sem código: é só o número que você usou no pedido.
                </p>
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
