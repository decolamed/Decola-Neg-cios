/**
 * Acompanhamento do pedido — `/pedido/:token`.
 *
 * Sem login: o token na URL é o segredo, e quem o tem vê aquele pedido e só
 * aquele. É também a tela seguinte ao checkout, então precisa responder de
 * imediato as três perguntas que o cliente tem nesse momento: o que eu fiz,
 * já paguei, e o que faço agora.
 *
 * O botão "já realizei o pagamento" NÃO confirma nada — quem confirma é a
 * loja, depois de olhar a conta. A tela diz isso com todas as letras, porque
 * a alternativa é o cliente ir embora achando que está pago.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Aviso, Carregando } from '@/componentes/Basicos';
import { QrCodePix } from '@/componentes/QrCodePix';
import { moeda } from '@/dados/loja';
import {
  ROTULO_STATUS,
  consultarPedido,
  linkWhatsApp,
  mensagemDeEntrega,
  type PedidoConsultado,
} from '@/dados/pedido';

export function Pedido() {
  const { token = '' } = useParams<{ token: string }>();

  const [pedido, setPedido] = useState<PedidoConsultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisouPagamento, setAvisouPagamento] = useState(false);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setPedido(await consultarPedido(token));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Pedido não encontrado.');
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) {
    return (
      <main className="pagina estreita">
        <h1>Pedido</h1>
        <Aviso mensagem={erro} />
        <p className="legenda">
          Confira o link que você recebeu ao finalizar o pedido — ele é a forma de acompanhar esta
          solicitação.
        </p>
      </main>
    );
  }

  if (!pedido) {
    return (
      <main className="pagina estreita">
        <Carregando />
      </main>
    );
  }

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Pedido #{pedido.numero}</h1>
        <p>{pedido.loja.nome}</p>
      </div>

      <div className={`faixa-status ${pedido.status}`}>
        {ROTULO_STATUS[pedido.status] ?? pedido.status}
      </div>

      {/* ---------------------------------------------------- retirada + pix */}
      {pedido.modalidade === 'retirada' && pedido.pagamento === 'pix_online' ? (
        pedido.status === 'aguardando_pagamento' ? (
          <div className="card">
            <h2>Pague com Pix</h2>
            <p className="valor-destaque">{moeda(pedido.subtotal)}</p>

            {/* O QR carrega o valor. Antes havia só a chave para copiar, e
                copiar a chave é o pior caminho que o Pix oferece: o cliente
                ainda precisa abrir o banco, colar, DIGITAR o valor e conferir
                o recebedor — e é aí que ele erra a vírgula. */}
            {pedido.loja.chave_pix ? (
              <QrCodePix
                chave={pedido.loja.chave_pix}
                valor={pedido.subtotal}
                nomeRecebedor={pedido.loja.nome}
                descricao={`Pedido ${pedido.numero}`}
              />
            ) : (
              <p className="legenda">
                Esta loja ainda não configurou a chave Pix. Fale com ela pelo WhatsApp para
                combinar o pagamento.
              </p>
            )}

            {avisouPagamento ? (
              <Aviso
                tom="alerta"
                mensagem={
                  'Avisamos a loja. O pagamento ainda NÃO está confirmado: alguém da loja vai ' +
                  'conferir o recebimento e confirmar. Você pode acompanhar por esta página.'
                }
              />
            ) : (
              <>
                <button type="button" className="botao" onClick={() => setAvisouPagamento(true)}>
                  Já realizei o pagamento
                </button>
                <p className="legenda">
                  Este botão apenas avisa a loja. A confirmação é feita por uma pessoa, depois de
                  verificar o recebimento.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="card">
            <h2>Pagamento confirmado</h2>
            <p>
              A loja confirmou o recebimento do seu Pix. É só ir buscar o pedido quando estiver
              pronto.
            </p>
          </div>
        )
      ) : null}

      {/* ----------------------------------------------- retirada + no balcão */}
      {pedido.modalidade === 'retirada' && pedido.pagamento === 'na_retirada' ? (
        <div className="card">
          <h2>Você paga na retirada</h2>
          <p>
            Nenhum pagamento foi feito agora. Você paga quando buscar o pedido
            {pedido.loja.endereco ? ` em ${pedido.loja.endereco}` : ' na loja'}.
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ entrega */}
      {pedido.modalidade === 'entrega' ? (
        <div className="card">
          <h2>Solicitação enviada</h2>
          <p>Sua solicitação foi enviada para a loja.</p>
          <p>
            Para combinar os detalhes da entrega, como disponibilidade e valor do transporte, entre
            em contato com a loja pelo WhatsApp.
          </p>

          <div className="aviso alerta destaque-frete">
            Lembre-se: o custo da entrega <strong>não está incluso</strong> no valor dos produtos e
            é de responsabilidade do cliente. Ele será combinado diretamente com a loja.
          </div>

          {pedido.loja.whatsapp ? (
            <a
              className="botao"
              href={linkWhatsApp(pedido.loja.whatsapp, mensagemDeEntrega(pedido.numero))}
              target="_blank"
              rel="noreferrer"
            >
              Combinar entrega pelo WhatsApp
            </a>
          ) : (
            <Aviso
              tom="alerta"
              mensagem="Esta loja ainda não cadastrou um WhatsApp. Procure o contato dela para combinar a entrega."
            />
          )}

          {pedido.endereco_entrega ? (
            <p className="legenda">Endereço informado: {pedido.endereco_entrega}</p>
          ) : null}
        </div>
      ) : null}

      {/* -------------------------------------------------------------- itens */}
      <div className="card">
        <h2>Itens</h2>
        {pedido.itens.map((item) => (
          <div className="resumo-linha" key={item.nome}>
            <span>
              {item.quantidade}× {item.nome}
            </span>
            <span>{moeda(Number(item.subtotal))}</span>
          </div>
        ))}
        <div className="resumo-linha total">
          <strong>Total dos produtos</strong>
          <strong>{moeda(Number(pedido.subtotal))}</strong>
        </div>
        {pedido.modalidade === 'entrega' ? (
          <p className="legenda">Sem o valor da entrega, que será combinado com a loja.</p>
        ) : null}
      </div>

      <button type="button" className="botao discreto" onClick={carregar}>
        Atualizar situação
      </button>

      <p className="legenda">
        Guarde o endereço desta página: é por ele que você acompanha o pedido #{pedido.numero}.
      </p>
    </main>
  );
}
