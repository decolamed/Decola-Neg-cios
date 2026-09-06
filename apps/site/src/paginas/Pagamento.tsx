/**
 * Pagamento — Seções 6.4 e 7.12, na web.
 *
 * O site não processa cartão nem gera Pix: pede ao backend a cobrança e manda
 * o navegador para o checkout hospedado do Asaas. A chave da API vive no
 * secret da Edge Function e nunca chega aqui (Seção 9.1).
 *
 * O redirecionamento não é automático. Uma navegação para fora do site sem
 * aviso, logo depois de criar a conta, parece falha — e a pessoa não saberia
 * dizer se pagou ou não. Um clique explícito também evita ser barrado por
 * bloqueador de pop-up.
 */
import { useCallback, useState } from 'react';
import { Aviso } from '@/componentes/Basicos';
import { iniciarCheckout } from '@/dados/cadastro';

export function Pagamento() {
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  const aoPagar = useCallback(async () => {
    setErro(null);
    setIndo(true);
    try {
      const { url } = await iniciarCheckout();
      window.location.href = url;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.');
      setIndo(false);
    }
  }, []);

  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Falta só o pagamento</h1>
        <p>
          Sua conta e sua empresa já foram criadas. O acesso é liberado assim que o pagamento for
          confirmado.
        </p>
      </div>

      {erro ? <Aviso mensagem={erro} /> : null}

      <div className="card">
        <p>
          Você vai para o ambiente de pagamento do Asaas, onde escolhe entre Pix, boleto ou cartão.
          Nós não guardamos dados do seu cartão em momento nenhum.
        </p>
        <button type="button" className="botao" onClick={aoPagar} disabled={indo}>
          {indo ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}
        </button>
      </div>

      <p className="legenda">
        Se você fechar esta página, pode voltar depois: abra o aplicativo e entre com o e-mail e a
        senha que acabou de criar — ele retoma exatamente daqui.
      </p>
    </main>
  );
}
