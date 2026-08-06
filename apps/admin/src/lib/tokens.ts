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
  for (const [nome, valor] of Object.entries(tema.tons)) {
    raiz.setProperty(`--tom-${nome}`, valor);
  }
  for (const [nome, valor] of Object.entries(tema.alturas)) {
    raiz.setProperty(`--altura-${nome}`, `${valor}px`);
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

  // A família de título (Glacial Indifference) só entra quando o arquivo de
  // fonte existir (Seção 2.2). Montserrat, a fonte de corpo da marca, o painel
  // carrega da web (ver index.html) — por isso ela já vale aqui, com fallback
  // para a fonte do sistema.
  raiz.setProperty(
    '--familia-titulo',
    tema.FONTES_PERSONALIZADAS_DISPONIVEIS
      ? `'${tema.fontes.titulo}', 'Montserrat', system-ui, sans-serif`
      : "'Montserrat', system-ui, sans-serif",
  );
  raiz.setProperty('--familia-corpo', "'Montserrat', system-ui, sans-serif");

  raiz.setProperty('--opacidade-desabilitado', String(tema.estados.disabledOpacidade));
  raiz.setProperty('--cor-primaria-pressionada', tema.escurecer(tema.cores.primaria));
  raiz.setProperty('--cor-acao-pressionada', tema.escurecer(tema.cores.acaoPrimaria));
  raiz.setProperty(
    '--sombra-card',
    `0 4px ${tema.elevacao.card.shadowRadius}px rgba(11, 42, 68, ${tema.elevacao.card.shadowOpacity})`,
  );
}
