/**
 * Fim da contratação com trial (Seção 6.2).
 *
 * Sem pagamento a fazer, a conta já está liberada — mas o produto é um
 * aplicativo de celular, e é aqui que a pessoa descobre isso. Terminar o
 * cadastro sem dizer para onde ir deixaria o cliente parado numa página em
 * branco com a conta paga.
 */
import { Link } from 'react-router-dom';

export function Pronto() {
  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Conta criada</h1>
        <p>Seu período de teste começou. Agora é só entrar pelo aplicativo.</p>
      </div>

      <div className="card">
        <h2>Como entrar</h2>
        <ol className="legenda" style={{ lineHeight: 1.8 }}>
          <li>Baixe o Decola Negócios na loja de aplicativos do seu celular.</li>
          <li>Toque em “Entrar”.</li>
          <li>Use o mesmo e-mail e a mesma senha que você acabou de cadastrar.</li>
        </ol>
      </div>

      <p className="legenda">
        Precisa contratar outro plano ou cadastrar outro negócio?{' '}
        <Link to="/planos">Ver os planos</Link>.
      </p>
    </main>
  );
}
