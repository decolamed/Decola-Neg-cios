import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Montserrat nos três pesos da Seção 2.2, empacotada com o bundle.
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
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
