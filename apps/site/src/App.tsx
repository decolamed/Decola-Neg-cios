/**
 * Casca do site público.
 *
 * O site tem um objetivo só: levar alguém que ainda não é cliente de um link
 * de plano até uma conta criada e paga. Tudo que não serve a isso ficou de
 * fora — não há área logada aqui, porque o produto é o aplicativo.
 *
 * Como no painel, o roteamento não protege nada: quem protege é a RLS.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { Aviso, Moldura } from '@/componentes/Basicos';
import { CONFIGURADO } from '@/lib/supabase';
import { Cadastro } from '@/paginas/Cadastro';
import { Pagamento } from '@/paginas/Pagamento';
import { Planos } from '@/paginas/Planos';
import { Pronto } from '@/paginas/Pronto';
import { RedefinirSenha } from '@/paginas/RedefinirSenha';

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
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/pagamento" element={<Pagamento />} />
        <Route path="/pronto" element={<Pronto />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        {/* Qualquer outro caminho cai na vitrine: um link de plano antigo ou
            digitado errado vira uma escolha de plano, não um beco sem saída. */}
        <Route path="*" element={<Navigate to="/planos" replace />} />
      </Routes>
    </Moldura>
  );
}
