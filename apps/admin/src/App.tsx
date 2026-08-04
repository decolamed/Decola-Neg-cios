/**
 * Casca do Painel Administrativo — Seções 7.15 e 11.1.
 *
 * O roteamento não protege nada: quem protege é a RLS. Aqui só se decide o que
 * mostrar — sem registro em `administradores_plataforma`, o painel devolve o
 * Login, e mesmo que alguém contornasse isso, nenhuma consulta ou RPC deste
 * app responderia.
 */
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Carregando } from '@/componentes/Basicos';
import { useSessaoAdmin } from '@/contexto/SessaoAdmin';
import { Configuracoes } from '@/telas/Configuracoes';
import { Dashboard } from '@/telas/Dashboard';
import { EmpresaDetalhe } from '@/telas/EmpresaDetalhe';
import { Empresas } from '@/telas/Empresas';
import { Login } from '@/telas/Login';
import { Planos } from '@/telas/Planos';

export function App() {
  const { carregando, administrador, sair } = useSessaoAdmin();

  if (carregando) {
    return (
      <div className="centralizado">
        <Carregando texto="Verificando acesso…" />
      </div>
    );
  }

  if (!administrador) return <Login />;

  return (
    <div className="painel">
      <nav className="barra-lateral">
        <span className="marca">Decola Negócios</span>

        <NavLink to="/" end className={({ isActive }) => (isActive ? 'ativo' : '')}>
          Visão geral
        </NavLink>
        <NavLink to="/empresas" className={({ isActive }) => (isActive ? 'ativo' : '')}>
          Empresas
        </NavLink>
        <NavLink to="/planos" className={({ isActive }) => (isActive ? 'ativo' : '')}>
          Planos
        </NavLink>
        <NavLink to="/configuracoes" className={({ isActive }) => (isActive ? 'ativo' : '')}>
          Configurações SaaS
        </NavLink>

        <div className="rodape">
          <div>{administrador.nome}</div>
          <div style={{ opacity: 0.75 }}>{administrador.email}</div>
          <button
            type="button"
            className="botao discreto"
            style={{ marginTop: 'var(--espaco-sm)', width: '100%' }}
            onClick={sair}
          >
            Sair
          </button>
        </div>
      </nav>

      <main className="conteudo">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/empresas" element={<Empresas />} />
          <Route path="/empresas/:id" element={<EmpresaDetalhe />} />
          <Route path="/planos" element={<Planos />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
