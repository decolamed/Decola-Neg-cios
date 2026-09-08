/**
 * Pagamento — o último passo da contratação.
 *
 * O site não processa cartão nem gera Pix: a cobrança já foi criada no
 * servidor, junto com a conta e a empresa, e aqui só se abre o checkout
 * hospedado do Asaas. A chave da API vive no secret da Edge Function e nunca
 * chega a esta página.
 *
 * O REDIRECIONAMENTO NÃO É AUTOMÁTICO. Uma navegação para fora do site sem
 * aviso, logo depois de criar a conta, parece falha — e a pessoa não saberia
 * dizer se pagou ou não. Um clique explícito também evita ser barrado por
 * bloqueador de pop-up.
 *
 * O LINK VEM PELO ESTADO DA NAVEGAÇÃO, não pela URL: ele é de uso único e não
 * deveria sobrar no histórico nem num print compartilhado. Quem chega aqui
 * digitando o endereço não tem esse estado — e recebe o caminho de volta em
 * vez de um botão que não faz nada.
 */
import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Aviso } from '@/componentes/Basicos';
import { LINK_DO_APP } from '@/componentes/Basicos';
import type { ContratacaoFeita } from '@/dados/cadastro';

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Pagamento() {
  const { state } = useLocation();
  const contratacao = (state ?? null) as ContratacaoFeita | null;

  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aoPagar = useCallback(() => {
    if (!contratacao?.url_checkout) {
      setErro('O link de pagamento não está disponível nesta página.');
      return;
    }
    setIndo(true);
    window.location.href = contratacao.url_checkout;
  }, [contratacao]);

  // Sem o estado da navegação não há o que abrir. Acontece com quem recarrega
  // a página ou digita o endereço direto.
  if (!contratacao?.url_checkout) {
    return (
      <main className="pagina estreita">
        <div className="cabecalho-pagina">
          <h1>Pagamento</h1>
          <p>
            Esta página abre o pagamento logo depois do cadastro, e o link é de uso único — por
            isso ela não funciona sozinha.
          </p>
        </div>

        <div className="card">
          <h2>Já fez o cadastro?</h2>
          <p className="legenda">
            Se você já preencheu seus dados, o Asaas também enviou a cobrança para o seu e-mail —
            procure por "Decola Negócios". Ou entre no aplicativo com "Esqueci minha senha" usando
            o mesmo e-mail: ele leva direto ao pagamento pendente.
          </p>
          <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
            <a className="botao" href={LINK_DO_APP}>
              Abrir o Decola Negócios
            </a>
          </div>
        </div>

        <p className="legenda">
          Ainda não se cadastrou? <Link to="/planos">Escolha um plano</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Falta só o pagamento</h1>
        <p>
          Sua conta e sua empresa já foram criadas. Assim que o pagamento for confirmado, enviamos
          um e-mail para você criar sua senha — e o acesso é liberado na hora.
        </p>
      </div>

      {erro ? <Aviso mensagem={erro} /> : null}

      <div className="card">
        <div className="linha-resumo">
          <span className="legenda">Valor da primeira mensalidade</span>
          <strong>{moeda(contratacao.valor)}</strong>
        </div>
        <div className="linha-resumo">
          <span className="legenda">Vencimento</span>
          <strong>{new Date(`${contratacao.vencimento}T12:00:00`).toLocaleDateString('pt-BR')}</strong>
        </div>

        <p style={{ marginTop: 'var(--espaco-md)' }}>
          Você vai para o ambiente de pagamento do Asaas, onde escolhe entre Pix, boleto ou cartão.
          Nós não guardamos dados do seu cartão em momento nenhum.
        </p>

        <button type="button" className="botao" onClick={aoPagar} disabled={indo}>
          {indo ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}
        </button>
      </div>

      {/* Sem senha escolhida no cadastro, "volte e faça login" deixou de ser
          uma instrução possível. O caminho de volta real é o mesmo e-mail de
          acesso, pedido por "Esqueci minha senha" — ele funciona mesmo com o
          pagamento pendente e leva de volta a esta etapa. */}
      <p className="legenda">
        Se fechar esta página antes de pagar, dá para voltar: o Asaas também manda a cobrança para
        o seu e-mail. Ou abra o aplicativo, toque em "Esqueci minha senha" e informe este mesmo
        e-mail.
      </p>
    </main>
  );
}
