/**
 * Checkout — `/loja/:slug/checkout`.
 *
 * Os dois fluxos ficam na mesma tela, mas nunca ao mesmo tempo: escolher a
 * modalidade troca o que aparece abaixo. Misturar campos de entrega com
 * opções de pagamento na retirada é a origem mais provável de o cliente
 * terminar sem saber o que contratou.
 *
 * A tela repete em texto o que já está no banco como regra — sobretudo que o
 * frete não está incluso, e ANTES de confirmar, não depois.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Aviso, CampoTexto, Carregando } from '@/componentes/Basicos';
import { itensDoCarrinho, limparCarrinho } from '@/dados/carrinho';
import { carregarLoja, listarProdutos, moeda, type Loja } from '@/dados/loja';
import { criarPedido, type FormaPagamento, type Modalidade } from '@/dados/pedido';

type Resumo = { nome: string; quantidade: number; subtotal: number };

export function Checkout() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navegar = useNavigate();

  const [loja, setLoja] = useState<Loja | null>(null);
  const [resumo, setResumo] = useState<Resumo[] | null>(null);
  const [total, setTotal] = useState(0);

  const [modalidade, setModalidade] = useState<Modalidade | null>(null);
  const [pagamento, setPagamento] = useState<FormaPagamento | null>(null);

  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [ciente, setCiente] = useState(false);
  const [observacao, setObservacao] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const montar = useCallback(async () => {
    const itens = itensDoCarrinho(slug);
    if (itens.length === 0) {
      navegar(`/loja/${slug}/carrinho`, { replace: true });
      return;
    }
    try {
      const [dadosLoja, produtos] = await Promise.all([carregarLoja(slug), listarProdutos(slug)]);
      const porId = new Map(produtos.map((p) => [p.id, p]));

      const linhas: Resumo[] = [];
      let soma = 0;
      for (const item of itens) {
        const produto = porId.get(item.produtoId);
        if (!produto) continue;
        const subtotal = produto.preco * item.quantidade;
        soma += subtotal;
        linhas.push({ nome: produto.nome, quantidade: item.quantidade, subtotal });
      }

      setLoja(dadosLoja);
      setResumo(linhas);
      setTotal(soma);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o pedido.');
      setResumo([]);
    }
  }, [slug, navegar]);

  useEffect(() => {
    void montar();
  }, [montar]);

  const escolherModalidade = (nova: Modalidade) => {
    setModalidade(nova);
    // Entrega tem uma forma só; retirada obriga a escolher.
    setPagamento(nova === 'entrega' ? 'a_combinar' : null);
    setErro(null);
  };

  const aoEnviar = useCallback(
    async (evento: FormEvent) => {
      evento.preventDefault();
      setErro(null);

      if (!modalidade || !pagamento) {
        setErro('Escolha como você quer receber e como vai pagar.');
        return;
      }

      setEnviando(true);
      try {
        const criado = await criarPedido({
          slug,
          itens: itensDoCarrinho(slug),
          nome,
          telefone,
          modalidade,
          pagamento,
          endereco: modalidade === 'entrega' ? endereco : undefined,
          cienteCustoEntrega: modalidade === 'entrega' ? ciente : false,
          observacao,
        });

        limparCarrinho(slug);
        navegar(`/pedido/${criado.token}`, { replace: true });
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível enviar seu pedido.');
      } finally {
        setEnviando(false);
      }
    },
    [modalidade, pagamento, slug, nome, telefone, endereco, ciente, observacao, navegar],
  );

  if (resumo === null) {
    return (
      <main className="pagina estreita">
        <Carregando />
      </main>
    );
  }

  const podeEnviar =
    Boolean(modalidade && pagamento && nome.trim() && telefone.trim()) &&
    (modalidade !== 'entrega' || (endereco.trim() !== '' && ciente));

  return (
    <main className="pagina estreita">
      <Link to={`/loja/${slug}/carrinho`} className="voltar">
        ← Voltar ao carrinho
      </Link>

      <h1>Finalizar pedido</h1>

      <div className="card">
        <h2>Resumo</h2>
        {resumo.map((linha) => (
          <div className="resumo-linha" key={linha.nome}>
            <span>
              {linha.quantidade}× {linha.nome}
            </span>
            <span>{moeda(linha.subtotal)}</span>
          </div>
        ))}
        <div className="resumo-linha total">
          <strong>Total dos produtos</strong>
          <strong>{moeda(total)}</strong>
        </div>
      </div>

      {erro ? <Aviso mensagem={erro} /> : null}

      <form onSubmit={aoEnviar} noValidate>
        <div className="card">
          <h2>Seus dados</h2>
          <CampoTexto rotulo="Nome" valor={nome} aoMudar={setNome} bloqueado={enviando} autoComplete="name" />
          <CampoTexto
            rotulo="Telefone / WhatsApp"
            valor={telefone}
            aoMudar={setTelefone}
            bloqueado={enviando}
            autoComplete="tel"
            placeholder="(11) 98888-7777"
          />
        </div>

        <div className="card">
          <h2>Como você quer receber?</h2>
          <div className="opcoes">
            <button
              type="button"
              className={modalidade === 'retirada' ? 'opcao escolhida' : 'opcao'}
              onClick={() => escolherModalidade('retirada')}
            >
              <strong>Retirar na loja</strong>
              <span className="legenda">Você busca no endereço da loja</span>
            </button>
            <button
              type="button"
              className={modalidade === 'entrega' ? 'opcao escolhida' : 'opcao'}
              onClick={() => escolherModalidade('entrega')}
            >
              <strong>Entrega</strong>
              <span className="legenda">Combinada por WhatsApp com a loja</span>
            </button>
          </div>
        </div>

        {modalidade === 'retirada' ? (
          <div className="card">
            <h2>Como você quer pagar?</h2>
            <div className="opcoes">
              {loja?.aceita_pix ? (
                <button
                  type="button"
                  className={pagamento === 'pix_online' ? 'opcao escolhida' : 'opcao'}
                  onClick={() => setPagamento('pix_online')}
                >
                  <strong>Pagar agora por Pix</strong>
                  <span className="legenda">
                    A loja confere o recebimento antes de separar seu pedido
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className={pagamento === 'na_retirada' ? 'opcao escolhida' : 'opcao'}
                onClick={() => setPagamento('na_retirada')}
              >
                <strong>Pagar na retirada</strong>
                <span className="legenda">Você não paga nada agora</span>
              </button>
            </div>
          </div>
        ) : null}

        {modalidade === 'entrega' ? (
          <div className="card">
            <h2>Endereço de entrega</h2>
            <CampoTexto
              rotulo="Endereço completo"
              valor={endereco}
              aoMudar={setEndereco}
              bloqueado={enviando}
              autoComplete="street-address"
              placeholder="Rua, número, bairro, complemento e ponto de referência"
            />

            {/* O aviso vem ANTES da confirmação, e não na tela seguinte. */}
            <div className="aviso alerta destaque-frete">
              <strong>Importante:</strong> o valor dos produtos <strong>não inclui</strong> o custo
              da entrega. O valor do transporte será combinado diretamente com a loja de acordo com
              a sua localização, e é de responsabilidade do cliente.
            </div>

            <label className="aceite">
              <input
                type="checkbox"
                checked={ciente}
                onChange={(e) => setCiente(e.target.checked)}
                disabled={enviando}
              />
              <span>
                Estou ciente de que o valor da entrega não está incluso no valor dos produtos e que o
                custo do transporte será de minha responsabilidade.
              </span>
            </label>
          </div>
        ) : null}

        {modalidade ? (
          <div className="card">
            <CampoTexto
              rotulo="Observação (opcional)"
              valor={observacao}
              aoMudar={setObservacao}
              bloqueado={enviando}
              placeholder="Algum detalhe que a loja precisa saber?"
            />
          </div>
        ) : null}

        {/* O que a pessoa está prestes a fazer, em uma frase, no botão e acima
            dele. "Solicitação" e não "compra": quem confirma é a loja. */}
        {modalidade ? (
          <p className="legenda">
            {modalidade === 'entrega'
              ? 'Você está enviando uma solicitação. A loja vai combinar a entrega e o frete com você pelo WhatsApp.'
              : pagamento === 'pix_online'
                ? 'Você vai receber os dados do Pix na próxima tela. O pedido só é confirmado depois que a loja verificar o pagamento.'
                : 'Você não paga nada agora — o pagamento acontece quando você retirar o pedido na loja.'}
          </p>
        ) : null}

        <button type="submit" className="botao" disabled={!podeEnviar || enviando}>
          {enviando ? 'Enviando…' : 'Enviar solicitação'}
        </button>
      </form>
    </main>
  );
}
