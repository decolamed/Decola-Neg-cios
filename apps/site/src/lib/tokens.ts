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

  // Na web a família é uma só e o peso numérico escolhe o arquivo — por isso
  // aqui vale `familiaWeb`, e não os nomes por peso que o React Native exige.
  // A fonte vem empacotada (@fontsource, importada em main.tsx); o fallback
  // para a fonte do sistema cobre o caso de o interruptor do tema estar
  // desligado.
  const pilha = tema.FONTES_PERSONALIZADAS_DISPONIVEIS
    ? `'${tema.familiaWeb}', system-ui, sans-serif`
    : 'system-ui, sans-serif';

  raiz.setProperty('--familia-titulo', pilha);
  raiz.setProperty('--familia-corpo', pilha);

  raiz.setProperty('--opacidade-desabilitado', String(tema.estados.disabledOpacidade));
  raiz.setProperty('--cor-primaria-pressionada', tema.escurecer(tema.cores.primaria));
  raiz.setProperty('--cor-acao-pressionada', tema.escurecer(tema.cores.acaoPrimaria));
  raiz.setProperty(
    '--sombra-card',
    `0 4px ${tema.elevacao.card.shadowRadius}px rgba(11, 42, 68, ${tema.elevacao.card.shadowOpacity})`,
  );
}
