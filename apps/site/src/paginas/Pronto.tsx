/**
 * Depois do pagamento — o destino do retorno do Asaas.
 *
 * Esta tela mudou de papel. Antes ela era o fim de um cadastro com teste
 * gratuito e dizia "já pode entrar". Agora o acesso começa no pagamento, e o
 * cliente chega aqui vindo do checkout do Asaas, sem nunca ter escolhido uma
 * senha — a dele vem por e-mail quando a confirmação chega.
 *
 * Por isso o texto não promete acesso imediato: ele diz o que está
 * acontecendo, quanto tempo costuma levar cada forma de pagamento, e o que
 * fazer se o e-mail não vier. Boleto que confirma em três dias úteis não é
 * defeito, mas vira reclamação quando ninguém avisou.
 */
import { Link } from 'react-router-dom';
import { LINK_DO_APP } from '@/componentes/Basicos';

export function Pronto() {
  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Recebemos seu pedido</h1>
        <p>
          Falta só a confirmação do pagamento. Assim que ela chegar, enviamos um e-mail com o link
          para você criar sua senha — e o acesso é liberado na hora.
        </p>
      </div>

      <div className="card">
        <h2>Quanto costuma demorar</h2>
        <ul className="prazos">
          <li>
            <strong>Pix</strong> — poucos minutos.
          </li>
          <li>
            <strong>Cartão de crédito</strong> — em geral na hora.
          </li>
          <li>
            <strong>Boleto</strong> — até 3 dias úteis depois do pagamento.
          </li>
        </ul>
        <p className="legenda">
          Você não precisa ficar com esta página aberta. O e-mail chega sozinho, no endereço que
          você usou no cadastro.
        </p>
      </div>

      <div className="card">
        <h2>Enquanto isso</h2>
        <p className="legenda">
          Aproveite para <Link to="/como-funciona">ver como o aplicativo funciona</Link> e deixar o
          ícone dele na tela do seu celular. Leva dois minutos e, quando o e-mail chegar, é só
          entrar.
        </p>
        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <Link className="botao" to="/como-funciona">
            Ver como funciona
          </Link>
        </div>
      </div>

      <p className="legenda">
        Não recebeu o e-mail depois do prazo? Confira a caixa de spam e, se não estiver lá, abra o{' '}
        <a href={LINK_DO_APP}>Decola Negócios</a>, toque em "Esqueci minha senha" e informe o mesmo
        e-mail do cadastro — o link de acesso é o mesmo.
      </p>
    </main>
  );
}
