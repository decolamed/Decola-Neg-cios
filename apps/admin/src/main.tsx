import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from '@/App';
import { ProvedorDeSessaoAdmin } from '@/contexto/SessaoAdmin';
import { aplicarTokens } from '@/lib/tokens';
import './estilos.css';

// Os tokens do tema viram variáveis CSS antes do primeiro render.
aplicarTokens();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorDeSessaoAdmin>
        <App />
      </ProvedorDeSessaoAdmin>
    </BrowserRouter>
  </StrictMode>,
);
