/**
 * Guarda de compilação: canal de tempo real só nasce em `src/lib/tempoReal.ts`.
 *
 * POR QUE ISTO EXISTE. `supabase.channel(nome)` não cria um canal quando já
 * existe um com aquele nome — ele DEVOLVE o existente. Registrar um
 * `postgres_changes` nesse canal devolvido, que já passou por `subscribe()`,
 * lança:
 *
 *     cannot add `postgres_changes` callbacks for realtime:<nome> after `subscribe()`.
 *
 * O erro derruba a tela inteira, e só aparece quando DUAS telas vivas pedem o
 * mesmo assunto — no Expo Router a tela de trás continua montada. Foi assim que
 * tocar no sino a partir do Início quebrou: o painel já tinha assinado
 * `avisos:<empresa>`.
 *
 * Nada disso aparece em teste de uma tela só, nem em `tsc`. Por isso a regra é
 * mecânica: um único lugar cria canal, e ele garante nome único.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PERMITIDO = 'src/lib/tempoReal.ts';

const arquivos = [];
(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho);
    else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho);
  }
})(join(RAIZ, 'src'));
(function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho);
    else if (/\.(ts|tsx)$/.test(nome)) arquivos.push(caminho);
  }
})(join(RAIZ, 'app'));

const infratores = [];
for (const caminho of arquivos) {
  const relativo = relative(RAIZ, caminho).split('\\').join('/');
  if (relativo === PERMITIDO) continue;

  const linhas = readFileSync(caminho, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    if (/\.channel\s*\(/.test(linha) && !linha.trimStart().startsWith('*')) {
      infratores.push(`${relativo}:${i + 1}  ${linha.trim()}`);
    }
  });
}

if (infratores.length > 0) {
  console.error('\nconferir-canais: canal de tempo real criado fora de src/lib/tempoReal.ts\n');
  for (const l of infratores) console.error('  ' + l);
  console.error(
    '\nUse `observarTabelas({ nome, empresaId, assuntos, aoMudar })`. Nome fixo de canal\n' +
      'faz duas telas vivas disputarem o mesmo canal, e a segunda quebra com\n' +
      '"cannot add `postgres_changes` callbacks ... after `subscribe()`".\n',
  );
  process.exit(1);
}

console.log('conferir-canais: todo canal de tempo real nasce no lugar certo.');
