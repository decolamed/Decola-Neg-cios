#!/usr/bin/env node
/**
 * A chave de serviço não abre todas as portas — e esquecer isso já custou caro.
 *
 * A migração 0030 tirou do `service_role` tudo que ele não precisava, e listou
 * o que continua negado DE PROPÓSITO: `planos` e `empresas` ("só pelas RPCs
 * administrativas"), `empresa_usuarios` ("só pelas RPCs de convite e papéis"),
 * `vendas`, `produtos`, `logs_auditoria` e as demais.
 *
 * Isso foi atravessado duas vezes, e as duas em silêncio:
 *
 *   `contratar` .......... lia `planos` com a chave de serviço. O banco recusava
 *                          com 403 e o cliente lia "Este plano não está mais
 *                          disponível". NENHUMA contratação funcionou.
 *   `asaas-webhook` ...... lia `empresa_usuarios` para achar o e-mail do gestor.
 *                          Recusado do mesmo jeito, e o `catch` engolia: o
 *                          cliente pagava e nunca recebia o link da senha.
 *
 * Nos dois casos o código estava correto em intenção e errado em privilégio, e
 * nada no build denunciava. É o que este arquivo passa a fazer.
 *
 * COMO ELE DECIDE. Acha as variáveis que recebem um cliente criado com
 * SUPABASE_SERVICE_ROLE_KEY e reclama quando uma delas consulta uma tabela da
 * lista negada. Consultas feitas com o JWT de quem chamou não são apontadas —
 * ali quem manda é a RLS, e o papel é `authenticated`, que tem os privilégios.
 *
 * O JEITO CERTO quando a Edge Function precisa mesmo daquele dado: uma função
 * `security definer` no banco, com uma pergunta só, concedida ao `service_role`
 * — como `contratacao_situacao` (0051) e `contratacao_email_do_gestor` (0052).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('../supabase/functions/', import.meta.url).pathname;

/**
 * Tabelas negadas ao `service_role`. Espelha a migração 0030 — se um GRANT
 * mudar lá, mude aqui junto, senão este arquivo passa a mentir.
 */
const NEGADAS = new Set([
  'planos',
  'empresas',
  'empresa_usuarios',
  'vendas',
  'venda_itens',
  'produtos',
  'categorias_produto',
  'movimentacoes_financeiras',
  'logs_auditoria',
]);

/** Arquivos .ts de todas as funções, incluindo `_shared`. */
function arquivos(dir) {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivos(caminho));
    else if (nome.endsWith('.ts')) achados.push(caminho);
  }
  return achados;
}

const problemas = [];

for (const caminho of arquivos(RAIZ)) {
  const codigo = readFileSync(caminho, 'utf8');

  // `const admin = createClient(<algo>, ...SERVICE_ROLE_KEY...)` — o nome da
  // variável é o que interessa; o resto da chamada pode ocupar várias linhas.
  const clientes = new Set();
  const declaracao = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createClient\(([\s\S]{0,400}?)\)\s*;/g;

  for (const [, variavel, argumentos] of codigo.matchAll(declaracao)) {
    if (argumentos.includes('SERVICE_ROLE_KEY')) clientes.add(variavel);
  }

  if (clientes.size === 0) continue;

  for (const variavel of clientes) {
    const uso = new RegExp(`\\b${variavel}\\s*\\n?\\s*\\.from\\(\\s*['"\`]([\\w]+)['"\`]`, 'g');

    for (const encontro of codigo.matchAll(uso)) {
      const tabela = encontro[1];
      if (!NEGADAS.has(tabela)) continue;

      const linha = codigo.slice(0, encontro.index).split('\n').length;
      problemas.push(
        `${caminho.replace(RAIZ, '')}:${linha} — \`${variavel}.from('${tabela}')\` usa a chave ` +
          `de serviço numa tabela negada a ela (migração 0030).`,
      );
    }
  }
}

if (problemas.length > 0) {
  console.error('conferir-privilegios: a chave de serviço não pode ler estas tabelas.\n');
  for (const p of problemas) console.error('  ' + p);
  console.error(
    '\nO banco recusa com 403, e o erro costuma chegar ao cliente disfarçado de outra coisa.\n' +
      'Crie uma função `security definer` com a pergunta exata e conceda execute ao\n' +
      '`service_role` — como `contratacao_situacao` (0051) e\n' +
      '`contratacao_email_do_gestor` (0052) — e chame por `.rpc()`.',
  );
  process.exit(1);
}

console.log('conferir-privilegios: nenhuma Edge Function lê tabela negada à chave de serviço.');
