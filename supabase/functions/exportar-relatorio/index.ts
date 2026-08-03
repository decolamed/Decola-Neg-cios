/**
 * Exportação de relatórios — Seção 10.3.
 *
 * "Geração de PDF/Excel: feita no BACKEND (Supabase Edge Function), que monta
 * o arquivo e retorna um link de download — evita processamento pesado no
 * dispositivo do usuário (especialmente relevante para relatórios de períodos
 * longos) e mantém a lógica de formatação centralizada."
 *
 * O usuário chega com o próprio JWT. A função NÃO usa a service key para ler
 * dados de negócio: ela cria um cliente com o token do chamador, de modo que a
 * RLS e as permissões da Seção 5.3 continuam valendo — um funcionário sem
 * `exportar_relatorios` recebe erro da própria RPC de agregação.
 *
 * Formatos (Seção 10.2):
 *   csv ... abre no Excel e em qualquer planilha ("Excel/tabela")
 *   pdf ... documento paginado, gerado sem dependência externa
 *
 * Filtros de conteúdo (Seção 10.2): o Gestor escolhe quais informações
 * aparecem no arquivo — funcionário responsável, forma de pagamento, produtos
 * vendidos e quantidade.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

type Colunas = {
  funcionario?: boolean;
  formaPagamento?: boolean;
  produtos?: boolean;
  quantidade?: boolean;
};

type Corpo = {
  formato?: 'csv' | 'pdf';
  desde: string;
  ate: string;
  colunas?: Colunas;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function erro(mensagem: string, status: number): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const moeda = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

// -----------------------------------------------------------------------------
// CSV — separador ";" e BOM UTF-8, que é o que o Excel em pt-BR espera.
// -----------------------------------------------------------------------------
function celula(valor: unknown): string {
  const texto = String(valor ?? '');
  return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function montarCsv(relatorio: any, colunas: Colunas, empresa: string): string {
  const linhas: string[][] = [];

  linhas.push([`Relatório de vendas — ${empresa}`]);
  linhas.push([`Período: ${data(relatorio.periodo.desde)} a ${data(relatorio.periodo.ate)}`]);
  linhas.push([]);

  linhas.push(['Resumo']);
  linhas.push(['Total vendido', moeda(Number(relatorio.totais.total_vendido))]);
  linhas.push(['Quantidade de vendas', String(relatorio.totais.quantidade_vendas)]);
  linhas.push(['Ticket médio', moeda(Number(relatorio.totais.ticket_medio))]);
  linhas.push(['Desconto concedido', moeda(Number(relatorio.totais.desconto_concedido))]);
  linhas.push(['Vendas canceladas', String(relatorio.canceladas.quantidade)]);
  linhas.push([]);

  linhas.push(['Evolução das vendas']);
  linhas.push(['Dia', 'Total', ...(colunas.quantidade !== false ? ['Vendas'] : [])]);
  for (const dia of relatorio.evolucao) {
    linhas.push([
      data(dia.dia),
      moeda(Number(dia.total)),
      ...(colunas.quantidade !== false ? [String(dia.quantidade)] : []),
    ]);
  }
  linhas.push([]);

  if (colunas.produtos !== false) {
    linhas.push(['Produtos mais vendidos']);
    linhas.push(['Produto', ...(colunas.quantidade !== false ? ['Quantidade'] : []), 'Total']);
    for (const produto of relatorio.produtos_mais_vendidos) {
      linhas.push([
        produto.nome,
        ...(colunas.quantidade !== false ? [String(produto.quantidade)] : []),
        moeda(Number(produto.total)),
      ]);
    }
    linhas.push([]);
  }

  if (colunas.formaPagamento !== false) {
    linhas.push(['Formas de pagamento']);
    linhas.push(['Forma', 'Total', ...(colunas.quantidade !== false ? ['Vendas'] : [])]);
    for (const forma of relatorio.formas_pagamento) {
      linhas.push([
        forma.forma,
        moeda(Number(forma.total)),
        ...(colunas.quantidade !== false ? [String(forma.quantidade)] : []),
      ]);
    }
    linhas.push([]);
  }

  if (colunas.funcionario !== false) {
    linhas.push(['Vendas por funcionário']);
    linhas.push(['Funcionário', 'Total', ...(colunas.quantidade !== false ? ['Vendas'] : [])]);
    for (const pessoa of relatorio.por_funcionario) {
      linhas.push([
        pessoa.nome,
        moeda(Number(pessoa.total)),
        ...(colunas.quantidade !== false ? [String(pessoa.quantidade)] : []),
      ]);
    }
  }

  return '﻿' + linhas.map((linha) => linha.map(celula).join(';')).join('\r\n');
}

// -----------------------------------------------------------------------------
// PDF — gerador mínimo, sem dependência externa.
//
// Usa apenas a fonte base Helvetica (presente em todo leitor de PDF) e texto
// em WinAnsiEncoding, que cobre o português. Suficiente para um relatório
// tabular; se um dia o layout exigir mais, vale trocar por uma biblioteca.
// -----------------------------------------------------------------------------
/**
 * WinAnsiEncoding cobre até U+00FF. Acentos do português passam direto, mas
 * caracteres como travessão e aspas tipográficas não — e virariam bytes de
 * controle na conversão final para Latin-1. Aqui eles são trocados por
 * equivalentes ASCII antes de entrar no arquivo.
 */
function paraWinAnsi(texto: string): string {
  return texto
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\u0020-\u00ff]/g, '?');
}

function escaparPdf(texto: string): string {
  return paraWinAnsi(texto)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

type LinhaPdf = { texto: string; tamanho: number; negrito: boolean };

function montarPdf(relatorio: any, colunas: Colunas, empresa: string): Uint8Array {
  const linhas: LinhaPdf[] = [];
  const titulo = (texto: string) => linhas.push({ texto, tamanho: 16, negrito: true });
  const secao = (texto: string) => {
    // Linha em branco antes do título da seção.
    linhas.push({ texto: '', tamanho: 6, negrito: false });
    linhas.push({ texto, tamanho: 12, negrito: true });
  };
  const item = (texto: string) => linhas.push({ texto, tamanho: 10, negrito: false });

  titulo(`Relatorio de vendas — ${empresa}`);
  item(`Periodo: ${data(relatorio.periodo.desde)} a ${data(relatorio.periodo.ate)}`);

  secao('Resumo');
  item(`Total vendido: ${moeda(Number(relatorio.totais.total_vendido))}`);
  item(`Vendas: ${relatorio.totais.quantidade_vendas}`);
  item(`Ticket medio: ${moeda(Number(relatorio.totais.ticket_medio))}`);
  item(`Desconto concedido: ${moeda(Number(relatorio.totais.desconto_concedido))}`);
  item(`Vendas canceladas: ${relatorio.canceladas.quantidade}`);

  const anterior = Number(relatorio.periodo_anterior.total_vendido);
  const atual = Number(relatorio.totais.total_vendido);
  if (anterior > 0) {
    const variacao = ((atual - anterior) / anterior) * 100;
    item(
      `Periodo anterior: ${moeda(anterior)} (${variacao >= 0 ? '+' : ''}${variacao.toFixed(1)}%)`,
    );
  }

  secao('Evolucao das vendas');
  for (const dia of relatorio.evolucao) {
    item(
      `${data(dia.dia)}  ${moeda(Number(dia.total))}` +
        (colunas.quantidade !== false ? `  (${dia.quantidade} venda(s))` : ''),
    );
  }

  if (colunas.produtos !== false) {
    secao('Produtos mais vendidos');
    for (const produto of relatorio.produtos_mais_vendidos) {
      item(
        `${produto.nome}` +
          (colunas.quantidade !== false ? `  ${produto.quantidade} un.` : '') +
          `  ${moeda(Number(produto.total))}`,
      );
    }
  }

  if (colunas.formaPagamento !== false) {
    secao('Formas de pagamento');
    for (const forma of relatorio.formas_pagamento) {
      item(`${forma.forma}  ${moeda(Number(forma.total))}`);
    }
  }

  if (colunas.funcionario !== false) {
    secao('Vendas por funcionario');
    for (const pessoa of relatorio.por_funcionario) {
      item(`${pessoa.nome}  ${moeda(Number(pessoa.total))}`);
    }
  }

  // Paginação A4 (595 x 842 pt).
  const paginas: LinhaPdf[][] = [];
  let paginaAtual: LinhaPdf[] = [];
  let y = 0;
  for (const linha of linhas) {
    const altura = linha.tamanho + 6;
    if (y + altura > 742) {
      paginas.push(paginaAtual);
      paginaAtual = [];
      y = 0;
    }
    paginaAtual.push(linha);
    y += altura;
  }
  if (paginaAtual.length > 0) paginas.push(paginaAtual);

  const fluxos = paginas.map((pagina) => {
    let conteudo = 'BT\n';
    let posicao = 800;
    for (const linha of pagina) {
      posicao -= linha.tamanho + 6;
      if (linha.texto === '') continue;
      conteudo += `/${linha.negrito ? 'F2' : 'F1'} ${linha.tamanho} Tf\n`;
      conteudo += `1 0 0 1 50 ${posicao} Tm\n`;
      conteudo += `(${escaparPdf(linha.texto)}) Tj\n`;
    }
    conteudo += 'ET';
    return conteudo;
  });

  // Montagem do arquivo PDF com tabela de referências cruzadas.
  const objetos: string[] = [];
  const totalPaginas = fluxos.length || 1;
  const idPaginas = 2;
  const primeiroConteudo = 3;
  const primeiraPagina = primeiroConteudo + totalPaginas;
  const idFonte1 = primeiraPagina + totalPaginas;
  const idFonte2 = idFonte1 + 1;

  objetos.push(`1 0 obj\n<< /Type /Catalog /Pages ${idPaginas} 0 R >>\nendobj\n`);

  const filhos = Array.from({ length: totalPaginas }, (_, i) => `${primeiraPagina + i} 0 R`).join(' ');
  objetos.push(
    `${idPaginas} 0 obj\n<< /Type /Pages /Kids [${filhos}] /Count ${totalPaginas} >>\nendobj\n`,
  );

  for (let i = 0; i < totalPaginas; i += 1) {
    const fluxo = fluxos[i] ?? 'BT ET';
    objetos.push(
      `${primeiroConteudo + i} 0 obj\n<< /Length ${fluxo.length} >>\nstream\n${fluxo}\nendstream\nendobj\n`,
    );
  }

  for (let i = 0; i < totalPaginas; i += 1) {
    objetos.push(
      `${primeiraPagina + i} 0 obj\n<< /Type /Page /Parent ${idPaginas} 0 R ` +
        `/MediaBox [0 0 595 842] /Contents ${primeiroConteudo + i} 0 R ` +
        `/Resources << /Font << /F1 ${idFonte1} 0 R /F2 ${idFonte2} 0 R >> >> >>\nendobj\n`,
    );
  }

  objetos.push(
    `${idFonte1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );
  objetos.push(
    `${idFonte2} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
  );

  let pdf = '%PDF-1.4\n';
  const deslocamentos: number[] = [];
  for (const objeto of objetos) {
    deslocamentos.push(pdf.length);
    pdf += objeto;
  }

  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const deslocamento of deslocamentos) {
    pdf += `${String(deslocamento).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

  // Latin-1: casa com o WinAnsiEncoding declarado nas fontes.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

Deno.serve(async (requisicao) => {
  if (requisicao.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (requisicao.method !== 'POST') {
    return erro('Método não suportado.', 405);
  }

  const autorizacao = requisicao.headers.get('Authorization');
  if (!autorizacao) {
    return erro('Autenticação necessária.', 401);
  }

  let corpo: Corpo;
  try {
    corpo = await requisicao.json();
  } catch {
    return erro('Requisição inválida.', 400);
  }

  if (!corpo.desde || !corpo.ate) {
    return erro('Informe o período do relatório.', 400);
  }

  // Cliente com o JWT do usuário: a RLS e as permissões continuam valendo.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: autorizacao } } },
  );

  const { data: relatorio, error } = await supabase.rpc('relatorio_vendas', {
    p_desde: corpo.desde,
    p_ate: corpo.ate,
  });

  if (error) {
    // A própria RPC recusa quem não tem `exportar_relatorios` (Seção 10.3).
    return erro(error.message, error.code === '42501' ? 403 : 400);
  }

  const { data: empresas } = await supabase.from('empresas').select('nome').limit(1);
  const nomeEmpresa = empresas?.[0]?.nome ?? 'Minha empresa';

  const colunas = corpo.colunas ?? {};
  const sufixo = new Date(corpo.desde).toISOString().slice(0, 10);

  if (corpo.formato === 'pdf') {
    return new Response(montarPdf(relatorio, colunas, nomeEmpresa), {
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="relatorio-${sufixo}.pdf"`,
      },
    });
  }

  return new Response(montarCsv(relatorio, colunas, nomeEmpresa), {
    headers: {
      ...CORS,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="relatorio-${sufixo}.csv"`,
    },
  });
});
