/**
 * Trava contra a URL das Edge Functions montada à mão.
 *
 * O QUE ACONTECEU. Quatro arquivos escreviam
 * `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/...` diretamente. Essa
 * variável não existe no aplicativo publicado — a conexão de produção mora em
 * `src/lib/supabase.ts`, com reserva no código. Sem a reserva, a expressão
 * virava literalmente "undefined/functions/v1/…", um caminho relativo que o
 * navegador resolvia contra o próprio site e devolvia 404.
 *
 * Quatro recursos ficaram mudos, sem nenhum erro que denunciasse a causa:
 * exportar relatório em PDF e Excel, convidar funcionário, "esqueci minha
 * senha" e o checkout do Asaas dentro do aplicativo.
 *
 * O erro é fácil de repetir porque a linha PARECE certa. Por isso a checagem
 * roda no build: `URL_FUNCOES` e `CHAVE_PUBLICA` saem de um lugar só.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PERMITIDO = path.join(RAIZ, 'src', 'lib', 'supabase.ts');

/** Onde a variável de ambiente da conexão pode aparecer: em lugar nenhum além dali. */
const PROIBIDO = /process\.env\.EXPO_PUBLIC_SUPABASE_(URL|ANON_KEY)/;

function varrer(diretorio) {
  const achados = [];

  for (const entrada of fs.readdirSync(diretorio, { withFileTypes: true })) {
    const caminho = path.join(diretorio, entrada.name);

    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue;
      achados.push(...varrer(caminho));
      continue;
    }

    if (!/\.tsx?$/.test(entrada.name)) continue;
    if (caminho === PERMITIDO) continue;

    const linhas = fs.readFileSync(caminho, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      if (PROIBIDO.test(linha)) {
        achados.push(`${path.relative(RAIZ, caminho)}:${i + 1}  ${linha.trim()}`);
      }
    });
  }

  return achados;
}

const achados = [...varrer(path.join(RAIZ, 'src')), ...varrer(path.join(RAIZ, 'app'))];

if (achados.length > 0) {
  console.error('\nConexão montada fora de src/lib/supabase.ts:\n');
  for (const a of achados) console.error(`  • ${a}`);
  console.error(
    '\n  Use `URL_FUNCOES` e `CHAVE_PUBLICA` de "@/lib/supabase". Elas já trazem a\n' +
      '  reserva de produção; a variável de ambiente sozinha vem vazia no build.\n',
  );
  process.exit(1);
}

console.log('conferir-conexao: nenhuma URL de função montada à mão.');
