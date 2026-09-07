/**
 * Acrescenta ao HTML exportado o que o Expo não coloca: as tags que fazem o
 * aplicativo virar um app instalável de verdade.
 *
 * O PROBLEMA QUE ISTO RESOLVE. Instalado pela opção "Adicionar à tela de
 * início", o app ganhava um ícone de 96 px esticado até o tamanho de um ícone
 * de verdade — blocado e sujo ao lado dos outros aplicativos do celular. O
 * ícone bom, de 1024 px, sempre esteve no repositório; ele só nunca chegava à
 * versão web. E, sem nome nem cor declarados, o Android abria o app numa tela
 * branca antes do amarelo da marca.
 *
 * POR QUE UM SCRIPT, E NÃO `app/+html.tsx`. Aquele é o ponto de extensão
 * oficial, mas só vale com `output: 'static'`. Este app exporta como SPA
 * (`output: 'single'`), e nesse modo o Expo usa um template fixo e ignora o
 * `+html.tsx` — foi tentado, e o HTML saiu sem nada. Editar o index.html à mão
 * também não serve: ele é reescrito a cada build. Um passo depois da exportação
 * é o que sobra, e tem a vantagem de ser verificável: o próprio script confere
 * o resultado e falha se não encontrar onde injetar.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const saida = process.argv[2];
if (!saida) {
  console.error('Uso: node scripts/finalizar-web.mjs <pasta-da-exportacao>');
  process.exit(1);
}

const arquivo = join(saida, 'index.html');
if (!existsSync(arquivo)) {
  console.error(`finalizar-web: ${arquivo} não existe — a exportação falhou?`);
  process.exit(1);
}

const TAGS = `
    <link rel="manifest" href="/app/manifest.webmanifest" />
    <meta name="theme-color" content="#F2B532" />
    <meta name="description" content="Organize. Venda. Cresça. Gestão para pequenos e médios negócios." />
    <link rel="icon" type="image/png" sizes="192x192" href="/app/icone-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/app/icone-512.png" />
    <link rel="apple-touch-icon" href="/app/icone-192.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Decola Negócios" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <style>
      /* O amarelo da marca já no primeiro quadro: entre abrir o app e o
         JavaScript montar a splash existe um intervalo que, em branco,
         aparecia como um flash claro antes do amarelo. */
      html, body { background-color: #F2B532; }
    </style>
`;

let html = readFileSync(arquivo, 'utf8');

// Idempotente: rodar duas vezes não duplica nada.
if (html.includes('rel="manifest"')) {
  console.log('finalizar-web: já estava aplicado.');
  process.exit(0);
}

if (!html.includes('</head>')) {
  console.error('finalizar-web: não encontrei </head> no HTML exportado.');
  process.exit(1);
}

html = html.replace('</head>', `${TAGS}  </head>`);

// `lang` correto importa para leitores de tela e para o corretor do teclado.
html = html.replace('<html lang="en">', '<html lang="pt-BR">');

writeFileSync(arquivo, html);

// Confere o que acabou de escrever. Um script de build que não verifica o
// próprio resultado é um script que falha em silêncio.
const conferir = readFileSync(arquivo, 'utf8');
const faltando = [
  ['manifesto', 'rel="manifest"'],
  ['ícone 192', 'icone-192.png'],
  ['ícone 512', 'icone-512.png'],
  ['cor do tema', 'theme-color'],
  ['idioma', 'lang="pt-BR"'],
].filter(([, agulha]) => !conferir.includes(agulha));

if (faltando.length > 0) {
  console.error('finalizar-web: FALTOU', faltando.map(([n]) => n).join(', '));
  process.exit(1);
}

console.log('finalizar-web: manifesto, ícones e cores aplicados.');
