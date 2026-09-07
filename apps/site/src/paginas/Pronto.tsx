/**
 * Fim da contratação (Seção 6.2).
 *
 * Esta tela mandava baixar o aplicativo numa loja de aplicativos — onde ele
 * nunca esteve. Quem terminava o cadastro ficava com a conta criada e nenhum
 * lugar para usá-la, que era o furo mais caro do produto: o cliente pagava e
 * não entrava.
 *
 * O aplicativo agora roda no navegador, publicado junto deste site em `/app`.
 * Um clique, sem instalar nada.
 */
import { Link } from 'react-router-dom';
import { LINK_DO_APP } from '@/componentes/Basicos';

export function Pronto() {
  return (
    <main className="pagina estreita">
      <div className="cabecalho-pagina">
        <h1>Conta criada</h1>
        <p>Seu período de teste começou. Já pode entrar.</p>
      </div>

      <div className="card">
        <h2>Entrar agora</h2>
        <p>
          Use o mesmo e-mail e a mesma senha que você acabou de cadastrar. Não precisa instalar
          nada — o Decola Negócios abre no navegador, no celular ou no computador.
        </p>

        <div className="acoes" style={{ marginTop: 'var(--espaco-md)' }}>
          <a className="botao" href={LINK_DO_APP}>
            Abrir o Decola Negócios
          </a>
        </div>

        <p className="legenda" style={{ marginTop: 'var(--espaco-md)' }}>
          Dica: no celular, use “Adicionar à tela de início” pelo menu do navegador. O aplicativo
          fica com ícone próprio, como se tivesse sido instalado.
        </p>
      </div>

      <p className="legenda">
        Precisa contratar outro plano ou cadastrar outro negócio?{' '}
        <Link to="/planos">Ver os planos</Link>.
      </p>
    </main>
  );
}
