import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Montserrat nos três pesos da Seção 2.2, empacotada com o bundle.
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@fontsource/montserrat/700.css';
/**
 * As duas fontes da VITRINE, e só dela.
 *
 * O site institucional (planos, cadastro, como funciona) continua em
 * Montserrat: ali quem fala é a Decola. Da porta da loja para dentro quem fala
 * é o lojista, e o desenho aprovado pede uma dupla própria — Plus Jakarta Sans
 * nos números e títulos, Public Sans no texto corrido. Ver o bloco `.vitrine`
 * em `estilos.css`, que é onde a troca acontece.
 *
 * Empacotadas, e não buscadas no Google: a vitrine abre no 4G do cliente do
 * lojista, e uma fonte que vem de outro domínio é mais uma volta de rede antes
 * do primeiro texto aparecer.
 */
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import { App } from '@/App';
import { aplicarTokens } from '@/lib/tokens';
import './estilos.css';

// Os tokens do tema viram variáveis CSS antes do primeiro render.
aplicarTokens();

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado no index.html.');

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
