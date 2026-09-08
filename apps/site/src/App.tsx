/**
 * Casca do site público.
 *
 * O site tem um objetivo só: levar alguém que ainda não é cliente de um link
 * de plano até uma conta criada e paga. Tudo que não serve a isso ficou de
 * fora — não há área logada aqui, porque o produto é o aplicativo.
 *
 * Como no painel, o roteamento não protege nada: quem protege é a RLS.
 */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Aviso, Moldura } from '@/componentes/Basicos';
import { CONFIGURADO } from '@/lib/supabase';
import { Cadastro } from '@/paginas/Cadastro';
import { ComoFunciona } from '@/paginas/ComoFunciona';
import { Carrinho } from '@/paginas/Carrinho';
import { Categoria } from '@/paginas/Categoria';
import { Categorias } from '@/paginas/Categorias';
import { Checkout } from '@/paginas/Checkout';
import { Convite } from '@/paginas/Convite';
import { DefinirSenha } from '@/paginas/DefinirSenha';
import { Loja } from '@/paginas/Loja';
import { MeusPedidos } from '@/paginas/MeusPedidos';
import { Pedido } from '@/paginas/Pedido';
import { Produto } from '@/paginas/Produto';
import { Pagamento } from '@/paginas/Pagamento';
import { Planos } from '@/paginas/Planos';
import { Pronto } from '@/paginas/Pronto';
import { RedefinirSenha } from '@/paginas/RedefinirSenha';

/**
 * `/loja/x/produto/1` → `/x/produto/1`, preservando o que vem depois e a
 * query (o `?busca=` de quem chegou por uma pesquisa dentro da loja).
 *
 * `replace` para que o botão "voltar" do celular não devolva o cliente ao
 * endereço antigo, que só o traria de volta para cá.
 */
function LojaNoEnderecoAntigo() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/loja/, '')}${search}${hash}`} replace />;
}

export function App() {
  // Publicado sem as variáveis de ambiente: explica, em vez de mostrar tela
  // branca. Aqui isso pesa mais que no painel — é um cliente que vê.
  if (!CONFIGURADO) {
    return (
      <Moldura>
        <main className="pagina estreita">
          <div className="centralizado">
            <h1>Em configuração</h1>
            <Aviso
              tom="alerta"
              mensagem={
                'Este site ainda não foi conectado ao Supabase. Defina VITE_SUPABASE_URL e ' +
                'VITE_SUPABASE_ANON_KEY nas variáveis de ambiente e publique de novo.'
              }
            />
          </div>
        </main>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <Routes>
        <Route path="/" element={<Navigate to="/planos" replace />} />
        <Route path="/planos" element={<Planos />} />
        <Route path="/como-funciona" element={<ComoFunciona />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/pagamento" element={<Pagamento />} />
        <Route path="/pronto" element={<Pronto />} />
        {/* Destino dos e-mails que o Decola envia por conta própria. */}
        <Route path="/definir-senha" element={<DefinirSenha />} />
        {/* Mantida para os links do Supabase Auth que já saíram antes. */}
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        <Route path="/convite/:id" element={<Convite />} />

        {/* A vitrine morava em `/loja/:slug` e passou a morar na raiz, para o
            lojista poder divulgar `dominio/nome-da-loja`. Link divulgado não
            volta atrás: quem já mandou o endereço antigo para um cliente não
            tem como recolhê-lo do WhatsApp. Então o caminho antigo continua
            valendo e leva ao novo, em vez de cair na escolha de planos. */}
        <Route path="/loja/:slug/*" element={<LojaNoEnderecoAntigo />} />
        <Route path="/loja/:slug" element={<LojaNoEnderecoAntigo />} />

        {/* Vitrine pública. `/pedido/:token` fica fora da loja de propósito: o
            link vai por WhatsApp e sobrevive a uma eventual troca de endereço
            da loja. */}
        <Route path="/:slug" element={<Loja />} />
        <Route path="/:slug/categorias" element={<Categorias />} />
        <Route path="/:slug/categoria/:id" element={<Categoria />} />
        <Route path="/:slug/produto/:id" element={<Produto />} />
        <Route path="/:slug/carrinho" element={<Carrinho />} />
        <Route path="/:slug/pedidos" element={<MeusPedidos />} />
        <Route path="/:slug/checkout" element={<Checkout />} />
        <Route path="/pedido/:token" element={<Pedido />} />
        {/* Qualquer outro caminho cai na vitrine: um link de plano antigo ou
            digitado errado vira uma escolha de plano, não um beco sem saída. */}
        <Route path="*" element={<Navigate to="/planos" replace />} />
      </Routes>
    </Moldura>
  );
}
