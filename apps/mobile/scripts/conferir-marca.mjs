/**
 * Nada que fique sobre o amarelo da marca pode acompanhar o tema.
 *
 * O QUE ISTO IMPEDE DE VOLTAR. A abertura é amarela em QUALQUER tema — o fundo
 * dela é a cor da marca, não um papel do tema. Quando as cores do produto
 * viraram variáveis de CSS para o tema escuro existir, a frase "Organize.
 * Venda. Cresça." continuou usando `cores.primaria`, que passou a acompanhar o
 * tema: com o aparelho no escuro ela virou azul-claro sobre amarelo, quase
 * ilegível. O mesmo aconteceu com o giro de carregamento.
 *
 * É um erro fácil de repetir, porque `cores.primaria` é o nome certo em quase
 * toda tela — só não é onde o fundo não acompanha.
 *
 * POR QUE CONFERIR NO PACOTE, e não no código-fonte. É o pacote que roda no
 * celular; uma regra escrita sobre o texto do componente passaria a mentir no
 * dia em que a frase mudasse de arquivo.
 *
 * E POR QUE PELO IDENTIFICADOR, e não pelo `var(--dn-…)`. A primeira versão
 * deste guarda procurava a string `var(--dn-` perto da frase — e aprovou o
 * defeito quando eu o reintroduzi de propósito para testá-lo. O motivo: o valor
 * da variável é montado em tempo de execução pelo módulo do tema, então essa
 * string nunca chega ao pacote. O que chega é a REFERÊNCIA: `cores.primaria`
 * (acompanha o tema) contra `paleta.azulMarinho` (fixa). É nelas que dá para
 * separar um caso do outro.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const saida = process.argv[2];
if (!saida) {
  console.error('Uso: node scripts/conferir-marca.mjs <pasta-da-exportacao>');
  process.exit(1);
}

const pastaJs = join(saida, '_expo', 'static', 'js', 'web');
if (!existsSync(pastaJs)) {
  console.error(`conferir-marca: ${pastaJs} não existe — a exportação falhou?`);
  process.exit(1);
}

/** A frase da abertura; é por ela que achamos o trecho a conferir. */
const ANCORA = 'Organize.';
/** Quantos caracteres em volta da âncora fazem parte do bloco da marca. */
const JANELA = 500;

let achou = false;
const problemas = [];

for (const arquivo of readdirSync(pastaJs).filter((n) => n.endsWith('.js'))) {
  const texto = readFileSync(join(pastaJs, arquivo), 'utf8');
  let i = texto.indexOf(ANCORA);

  while (i >= 0) {
    achou = true;
    const trecho = texto.slice(Math.max(0, i - JANELA), i + JANELA);

    // `cores.*` acompanha o tema; `paleta.*` é fixa. Perto da frase, só a
    // segunda pode aparecer.
    const doTema = [...new Set(trecho.match(/\bcores\.[a-zA-Z]+/g) ?? [])];
    if (doTema.length > 0) {
      problemas.push(`${arquivo}: ${doTema.join(', ')}`);
    }

    i = texto.indexOf(ANCORA, i + 1);
  }
}

if (!achou) {
  // A âncora sumir é tão grave quanto a regra quebrar: a partir daí este guarda
  // aprovaria qualquer coisa, calado, e ninguém notaria.
  console.error(
    'conferir-marca: não achei a frase da abertura no pacote. Se ela mudou de ' +
      'texto, ajuste a ÂNCORA neste arquivo — sem ela, esta conferência não ' +
      'confere nada.',
  );
  process.exit(1);
}

if (problemas.length > 0) {
  console.error(
    'conferir-marca: a frase da abertura está usando cor que acompanha o tema.\n' +
      'O fundo dela é o amarelo da marca, que NÃO acompanha — então ela some no ' +
      'tema escuro.\nUse `tema.paleta.*` (valor fixo) em vez de `tema.cores.*`.\n\n' +
      problemas.map((p) => `  ${p}`).join('\n'),
  );
  process.exit(1);
}

console.log('conferir-marca: a abertura usa cores fixas — legível em qualquer tema.');
