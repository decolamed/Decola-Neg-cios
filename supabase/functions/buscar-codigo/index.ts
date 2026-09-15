/**
 * O que é este código de barras?
 *
 * TRÊS LUGARES, NESTA ORDEM, e a ordem é a coisa mais importante do arquivo:
 *
 *   1. CATÁLOGO DA DECOLA (`catalogo_codigos`). Instantâneo, não gasta cota de
 *      ninguém e melhora sozinho: todo código que uma API já respondeu uma vez
 *      mora aqui, para todas as lojas. O primeiro lojista que escaneia um
 *      produto resolve a consulta para todos os outros.
 *   2. OPEN FOOD FACTS e as duas irmãs dele (beleza e produtos gerais). Base
 *      aberta, sem chave, com cobertura boa de alimento, higiene e cosmético —
 *      três dos segmentos que a Decola atende.
 *   3. UPCITEMDB, plano de teste. Cobre o que as outras não cobrem (eletrônico,
 *      acessório, vestuário), mas é limitado: cem consultas por dia, POR IP. É
 *      a última porta de propósito.
 *
 * O QUE ELA NUNCA FAZ: INVENTAR. Se nenhuma das três souber, a resposta é
 * "não achei" e o campo do nome chega vazio ao lojista. Um nome plausível
 * preenchido sozinho é pior do que campo vazio — ele parece conferido, vai para
 * a etiqueta, para a loja e para a nota, e ninguém revisa o que já veio escrito.
 *
 * A FOTO É COPIADA PARA CASA. A URL da API pode sair do ar amanhã, e aí o
 * produto do lojista fica sem imagem sem que nada tenha mudado do lado dele.
 *
 * O PREÇO NÃO VEM DE LUGAR NENHUM. É de cada loja, e sugerir o preço de outra
 * pessoa seria o pior tipo de ajuda.
 *
 * NOTA SOBRE ESTE ARQUIVO E O QUE ESTÁ NO AR: são o mesmo código, com este
 * cabeçalho mais longo. A função publicada leva um resumo dele; as notas sobre
 * os defeitos encontrados (o dígito verificador e o `Accept` da imagem) estão
 * nos dois, porque são elas que impedem a volta.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** O achado, na forma que o aplicativo entende. */
type Achado = {
  codigo: string;
  nome: string;
  marca: string | null;
  categoria: string | null;
  /** URL pública da imagem — nossa, quando deu para copiar. */
  imagem: string | null;
  origem: string;
  dados: Record<string, unknown>;
};

/**
 * Só dígitos, e só se for um código de barras DE VERDADE.
 *
 * ISTO AQUI FOI UM DEFEITO ENCONTRADO NO TESTE, e vale contar: a primeira
 * versão aceitava qualquer coisa de 8 a 14 dígitos. Mandei `00000000000000`
 * esperando "não achei", e a terceira API respondeu com "ORGANIC BLUE CORN
 * TORTILLA CHIPS", marca "N/A", foto de um produto de cabelo. A promessa de
 * NUNCA INVENTAR não se cumpre só não inventando do nosso lado — um lixo que
 * chega de fora com cara de resposta é igualmente mentira, e pior, parece
 * conferida.
 *
 * O filtro certo é o do próprio padrão: todo GTIN (EAN-8, UPC-A, EAN-13,
 * GTIN-14) termina num dígito verificador calculado dos anteriores. Um código
 * digitado errado quase nunca fecha a conta.
 *
 * O dígito sozinho não basta: `00000000000000` fecha a conta (soma zero, dígito
 * zero). Por isso códigos de um dígito só são recusados à parte — não existe
 * produto com código assim, e é exatamente o que alguém digita para testar.
 */
function limparCodigo(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const digitos = bruto.replace(/\D/g, '');

  if (![8, 12, 13, 14].includes(digitos.length)) return null;
  if (/^(\d)\1+$/.test(digitos)) return null;

  // Dígito verificador: pesos 3 e 1 alternados, da direita para a esquerda.
  const corpo = digitos.slice(0, -1);
  const informado = Number(digitos.slice(-1));
  let soma = 0;
  for (let i = 0; i < corpo.length; i += 1) {
    const peso = (corpo.length - i) % 2 === 1 ? 3 : 1;
    soma += Number(corpo[i]) * peso;
  }
  const esperado = (10 - (soma % 10)) % 10;

  return informado === esperado ? digitos : null;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

/** Tempo máximo de espera por uma API externa. */
const PACIENCIA_MS = 6000;

/**
 * A imagem ganha mais prazo — e ele não custa nada a quem está esperando.
 *
 * Ela é baixada DEPOIS da resposta, em segundo plano (ver `EdgeRuntime.waitUntil`
 * lá embaixo), então esperar quinze segundos por um servidor de fotos lento não
 * atrasa o lojista em nada. Na primeira versão a cópia era feita antes de
 * responder, com os mesmos seis segundos: o servidor de imagens do Open Food
 * Facts estourou o prazo e o catálogo guardou a URL externa em vez da nossa —
 * "The signal has been aborted" no log, e nada na tela.
 */
const PACIENCIA_DA_IMAGEM_MS = 15000;

/**
 * `fetch` com prazo.
 *
 * Sem isto, uma API lenta trava a tela do lojista pelo tempo que ela quiser —
 * e o lojista está com o leitor na mão, esperando para bipar o próximo. Seis
 * segundos é mais do que o suficiente para uma resposta boa e menos do que o
 * ponto em que a pessoa desiste e digita o nome à mão.
 */
async function buscar(url: string): Promise<Response | null> {
  const desistir = new AbortController();
  const relogio = setTimeout(() => desistir.abort(), PACIENCIA_MS);
  try {
    return await fetch(url, {
      signal: desistir.signal,
      headers: {
        // As bases abertas pedem identificação de quem consulta; é educado e
        // evita bloqueio por parecer robô anônimo.
        'User-Agent': 'DecolaNegocios/1.0 (https://sitedecolanegocios.vercel.app)',
        Accept: 'application/json',
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/* ============================================ 2. as bases abertas ======== */

/**
 * Open Food Facts e as irmãs.
 *
 * São três bases com a MESMA API em domínios diferentes: alimento, beleza e
 * "produtos gerais". Consultadas em ordem de cobertura — a de alimentos é de
 * longe a maior, e a maioria dos códigos que um mercadinho bipa está lá.
 */
const BASES_ABERTAS = [
  { nome: 'openfoodfacts', host: 'world.openfoodfacts.org' },
  { nome: 'openbeautyfacts', host: 'world.openbeautyfacts.org' },
  { nome: 'openproductsfacts', host: 'world.openproductsfacts.org' },
];

async function nasBasesAbertas(codigo: string): Promise<Achado | null> {
  for (const base of BASES_ABERTAS) {
    const resposta = await buscar(
      `https://${base.host}/api/v2/product/${codigo}.json` +
        '?fields=product_name,product_name_pt,brands,categories,image_front_url,image_url,quantity',
    );
    if (!resposta?.ok) continue;

    let corpo: Record<string, unknown>;
    try {
      corpo = await resposta.json();
    } catch {
      continue;
    }

    if (corpo.status !== 1 || typeof corpo.product !== 'object' || corpo.product === null) continue;
    const produto = corpo.product as Record<string, unknown>;

    // O nome em português quando existe; é a loja brasileira que vai vender.
    const nome = texto(produto.product_name_pt) ?? texto(produto.product_name);
    // SEM NOME NÃO É ACHADO. Uma ficha com marca e foto mas sem nome não
    // resolve o problema de quem está cadastrando, e aceitar isso faria a
    // busca "achar" coisas inúteis e parar de procurar nas outras bases.
    if (!nome) continue;

    return {
      codigo,
      nome,
      marca: texto(produto.brands),
      categoria: texto(produto.categories)?.split(',')[0]?.trim() ?? null,
      imagem: texto(produto.image_front_url) ?? texto(produto.image_url),
      origem: base.nome,
      dados: { quantidade: texto(produto.quantity) },
    };
  }
  return null;
}

/* ============================================ 3. UPCitemdb (teste) ======= */

async function noUpcItemDb(codigo: string): Promise<Achado | null> {
  const resposta = await buscar(`https://api.upcitemdb.com/prod/trial/lookup?upc=${codigo}`);
  // 429 é a cota diária do plano de teste. Não é erro nosso e não é motivo
  // para o lojista ver mensagem: é só o fim da fila de tentativas.
  if (!resposta?.ok) return null;

  let corpo: Record<string, unknown>;
  try {
    corpo = await resposta.json();
  } catch {
    return null;
  }

  const itens = Array.isArray(corpo.items) ? (corpo.items as Record<string, unknown>[]) : [];
  const item = itens[0];
  if (!item) return null;

  const nome = texto(item.title);
  if (!nome) return null;

  const imagens = Array.isArray(item.images) ? (item.images as unknown[]) : [];

  return {
    codigo,
    nome,
    marca: texto(item.brand),
    categoria: texto(item.category)?.split('>').pop()?.trim() ?? null,
    imagem: texto(imagens[0]),
    origem: 'upcitemdb',
    dados: { modelo: texto(item.model) },
  };
}

/* ================================================= a cópia da imagem ===== */

const TIPOS_DE_IMAGEM: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Traz a foto para o nosso armazenamento.
 *
 * Devolve a URL pública NOSSA, ou `null` quando não deu. `null` significa
 * "deixa como está": o catálogo já foi gravado com a URL externa, que é melhor
 * do que nenhuma foto.
 */
async function copiarImagem(
  admin: ReturnType<typeof createClient>,
  codigo: string,
  url: string,
): Promise<string | null> {
  /**
   * O prazo cobre o download INTEIRO, corpo incluído.
   *
   * Primeiro eu limpava o relógio assim que o `fetch` resolvia — e ele resolve
   * quando chegam os CABEÇALHOS, não a imagem. O corpo ficava sem prazo
   * nenhum, e um servidor que abre a conexão e não manda nada seguraria a
   * tarefa para sempre.
   */
  const desistir = new AbortController();
  const relogio = setTimeout(() => desistir.abort(), PACIENCIA_DA_IMAGEM_MS);
  try {
    /**
     * FETCH PRÓPRIO, com `Accept: image/*`.
     *
     * A primeira versão reaproveitava o `buscar()` das APIs, que manda
     * `Accept: application/json` — pedir JSON a um servidor de imagem e
     * estranhar que a cópia nunca acontecia. O sintoma era mudo: a função
     * devolvia a URL original e ninguém via diferença até a URL externa sair
     * do ar, meses depois.
     */
    const resposta = await fetch(url, {
      signal: desistir.signal,
      headers: {
        Accept: 'image/*',
        'User-Agent': 'DecolaNegocios/1.0 (https://sitedecolanegocios.vercel.app)',
      },
    });

    if (!resposta.ok) {
      console.warn(`imagem ${codigo}: servidor respondeu ${resposta.status}`);
      return null;
    }

    const tipo = (resposta.headers.get('content-type') ?? '').split(';')[0].trim();
    const extensao = TIPOS_DE_IMAGEM[tipo];
    if (!extensao) {
      console.warn(`imagem ${codigo}: tipo inesperado "${tipo}"`);
      return null;
    }

    const binario = new Uint8Array(await resposta.arrayBuffer());
    // Dois megabytes é o teto do bucket; acima disso é foto de catálogo grande
    // demais para o 4G do cliente da loja de qualquer forma.
    if (binario.byteLength === 0 || binario.byteLength > 2_000_000) return null;

    const caminho = `${codigo}.${extensao}`;
    const { error } = await admin.storage
      .from('catalogo')
      .upload(caminho, binario, { contentType: tipo, upsert: true });
    if (error) {
      console.warn(`imagem ${codigo}: upload recusado — ${error.message}`);
      return null;
    }

    return admin.storage.from('catalogo').getPublicUrl(caminho).data.publicUrl;
  } catch (e) {
    console.warn(`imagem ${codigo}: ${e instanceof Error ? e.message : 'falhou'}`);
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Copia a foto DEPOIS de responder, e troca a URL no catálogo quando terminar.
 *
 * O lojista está com o leitor na mão: fazê-lo esperar o download de uma foto
 * que ele vai ver de qualquer jeito (pela URL externa) é cobrar dele um tempo
 * que não compra nada. A cópia serve para daqui a seis meses, quando a URL de
 * fora sair do ar — e esse prazo não tem pressa.
 *
 * `EdgeRuntime.waitUntil` é o que segura a função viva depois do `return`. Onde
 * ele não existir, a cópia simplesmente não acontece e o catálogo fica com a
 * URL externa: degrada, não quebra.
 */
function copiarDepois(
  admin: ReturnType<typeof createClient>,
  codigo: string,
  url: string,
): void {
  const tarefa = copiarImagem(admin, codigo, url).then(async (nossa) => {
    if (!nossa) return;
    const { error } = await admin
      .from('catalogo_codigos')
      .update({ imagem: nossa })
      .eq('codigo', codigo);
    if (error) console.warn(`imagem ${codigo}: catálogo não atualizado — ${error.message}`);
  });

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(tarefa);
  else void tarefa;
}

/* ========================================================== a função ===== */

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (requisicao.method !== 'POST') return responder({ erro: 'Método não suportado.' }, 405);

  let corpo: { codigo?: unknown };
  try {
    corpo = await requisicao.json();
  } catch {
    return responder({ erro: 'Requisição inválida.' }, 400);
  }

  const codigo = limparCodigo(corpo.codigo);
  if (!codigo) return responder({ encontrado: false, motivo: 'codigo_invalido' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // ------------------------------------------- 1. o catálogo da Decola
  const { data: guardado, error: erroDeLeitura } = await admin
    .from('catalogo_codigos')
    .select('codigo, nome, marca, categoria, imagem, origem')
    .eq('codigo', codigo)
    .maybeSingle();

  // FALHA DE CONSULTA NÃO É "NÃO ACHEI". Se o banco recusou, seguir para as
  // APIs externas gastaria cota para descobrir o que já estava guardado — e
  // esconderia um problema nosso atrás de uma resposta plausível.
  if (erroDeLeitura) {
    console.error('catalogo_codigos indisponível:', erroDeLeitura.message);
    return responder({ erro: 'Não foi possível consultar o catálogo agora.' }, 500);
  }

  if (guardado) {
    return responder({ encontrado: true, origem: 'decola', produto: guardado });
  }

  // --------------------------------------------- 2 e 3. as APIs externas
  const achado = (await nasBasesAbertas(codigo)) ?? (await noUpcItemDb(codigo));

  if (!achado) {
    // Nada inventado. O campo do nome chega vazio ao lojista, de propósito.
    return responder({ encontrado: false, motivo: 'nao_encontrado' });
  }

  // Grava JÁ com a URL externa; a nossa entra por cima quando a cópia terminar.
  const imagem = achado.imagem;

  const { error: erroDeGravacao } = await admin.from('catalogo_codigos').upsert(
    {
      codigo: achado.codigo,
      nome: achado.nome,
      marca: achado.marca,
      categoria: achado.categoria,
      imagem,
      origem: achado.origem,
      dados: achado.dados,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'codigo' },
  );

  // Guardar é otimização, não é a resposta. Falhar aqui não pode custar ao
  // lojista o produto que a API acabou de achar.
  if (erroDeGravacao) console.error('catálogo não gravado:', erroDeGravacao.message);

  if (imagem) copiarDepois(admin, codigo, imagem);

  return responder({
    encontrado: true,
    origem: achado.origem,
    produto: {
      codigo: achado.codigo,
      nome: achado.nome,
      marca: achado.marca,
      categoria: achado.categoria,
      imagem,
    },
  });
});
