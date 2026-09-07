/**
 * Trava contra uma rota comer a outra.
 *
 * O QUE ACONTECEU. `app/produtos/` tinha `novo.tsx` ao lado da PASTA `[id]/`.
 * Tocar em "Adicionar produto" abria a tela de DETALHE do produto com
 * `id = "novo"` — o app pedia ao banco o produto de id "novo", o Postgres
 * recusava ("novo" não é um UUID) e a pessoa via "Não foi possível concluir a
 * operação". Nada no código estava errado; a rota estática simplesmente perdia
 * para a dinâmica.
 *
 * O detalhe que decide: isso só acontece quando a rota dinâmica é uma PASTA
 * (`[id]/index.tsx`). Onde ela é ARQUIVO (`vendas/[id].tsx`,
 * `funcionarios/[id].tsx`) o irmão estático ganha normalmente — foi assim que
 * `/vendas/nova` escapou. Por isso a regra aqui não é "não tenha rota dinâmica
 * com irmão estático", é a mais específica: rota dinâmica que é pasta, tendo
 * irmão estático, é armadilha.
 *
 * Uma pessoa não descobre isto lendo o código: descobre em produção, com o
 * cliente na frente. Daí a checagem rodar junto do build.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RAIZ = path.resolve(import.meta.dirname, '..', 'app');

/** É um segmento dinâmico? `[id]`, `[...resto]`. */
const dinamico = (nome) => nome.startsWith('[');

function conferir(diretorio, rotaBase = '') {
  const problemas = [];
  const entradas = fs.readdirSync(diretorio, { withFileTypes: true });

  const pastasDinamicas = entradas.filter((e) => e.isDirectory() && dinamico(e.name));

  // Irmãos estáticos: qualquer arquivo de rota ou pasta com nome fixo.
  // `index` não conta — ele vira o segmento vazio e nunca disputa.
  const irmaosEstaticos = entradas
    .filter((e) => !dinamico(e.name) && !e.name.startsWith('_') && !e.name.startsWith('+'))
    .map((e) => (e.isDirectory() ? e.name : e.name.replace(/\.tsx?$/, '')))
    .filter((nome) => nome !== 'index');

  for (const pasta of pastasDinamicas) {
    if (irmaosEstaticos.length > 0) {
      problemas.push(
        `${rotaBase || '/'} — a rota dinâmica "${pasta.name}/" é uma PASTA e vai engolir ` +
          `${irmaosEstaticos.map((n) => `"${n}"`).join(', ')}.\n` +
          `      Conserto: transforme "${pasta.name}/index.tsx" em "${pasta.name}.tsx" e mova ` +
          `as telas filhas para pastas próprias (ex.: "editar/${pasta.name}.tsx").`,
      );
    }
  }

  for (const entrada of entradas) {
    if (entrada.isDirectory()) {
      problemas.push(...conferir(path.join(diretorio, entrada.name), `${rotaBase}/${entrada.name}`));
    }
  }

  return problemas;
}

const problemas = conferir(RAIZ);

if (problemas.length > 0) {
  console.error('\nRotas em conflito:\n');
  for (const p of problemas) console.error(`  • ${p}\n`);
  process.exit(1);
}

console.log('conferir-rotas: nenhuma rota dinâmica engolindo irmã estática.');
