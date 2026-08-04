/**
 * Ponte entre os design tokens e o CSS do painel.
 *
 * A regra do projeto é que nenhum valor visual apareça hardcoded: tudo vem de
 * `packages/theme`. Aqui os tokens viram variáveis CSS, aplicadas na raiz do
 * documento uma única vez — assim o painel e o app cliente mudam juntos quando
 * a paleta mudar, e o CSS continua sendo CSS.
 */
import tema from '@decola/theme';

export function aplicarTokens(): void {
  const raiz = document.documentElement.style;

  for (const [nome, valor] of Object.entries(tema.cores)) {
    raiz.setProperty(`--cor-${nome}`, valor);
  }
  for (const [nome, valor] of Object.entries(tema.espacamento)) {
    raiz.setProperty(`--espaco-${nome}`, `${valor}px`);
  }
  for (const [nome, valor] of Object.entries(tema.raio)) {
    raiz.setProperty(`--raio-${nome}`, `${valor}px`);
  }
  for (const [nome, estilo] of Object.entries(tema.tipografia)) {
    raiz.setProperty(`--fonte-${nome}-tamanho`, `${estilo.fontSize}px`);
    raiz.setProperty(`--fonte-${nome}-peso`, String(estilo.fontWeight));
  }

  // A família só entra quando os arquivos de fonte existirem (Seção 2.2);
  // até lá vale a do sistema, com os pesos e tamanhos já corretos.
  raiz.setProperty(
    '--familia-titulo',
    tema.FONTES_PERSONALIZADAS_DISPONIVEIS ? tema.fontes.titulo : 'system-ui, sans-serif',
  );
  raiz.setProperty(
    '--familia-corpo',
    tema.FONTES_PERSONALIZADAS_DISPONIVEIS ? tema.fontes.corpo : 'system-ui, sans-serif',
  );

  raiz.setProperty('--opacidade-desabilitado', String(tema.estados.disabledOpacidade));
  raiz.setProperty('--cor-primaria-pressionada', tema.escurecer(tema.cores.primaria));
  raiz.setProperty('--cor-acao-pressionada', tema.escurecer(tema.cores.acaoPrimaria));
  raiz.setProperty(
    '--sombra-card',
    `0 2px ${tema.elevacao.card.shadowRadius}px rgba(0, 0, 0, ${tema.elevacao.card.shadowOpacity})`,
  );
}
