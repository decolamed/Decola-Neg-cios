/**
 * Configurações da vitrine — o que torna a loja pública possível.
 *
 * Escrita direta em `empresas`, como o resto das configurações: a política
 * `empresas_edicao` já exige Gestor, e não há regra composta a revalidar —
 * ligar a loja é gravar uma coluna.
 *
 * O que NÃO está aqui, de propósito: endereço, telefone e chave Pix já existem
 * em "Dados da empresa" e alimentam a vitrine de lá. Repetir os campos criaria
 * dois lugares para editar a mesma coisa.
 *
 * A LOGO é a exceção, e a exceção tem razão: ela deixou de ser um dado
 * cadastral e virou a cara da vitrine, ao lado do nome, da cor e dos banners.
 * Quem está escolhendo como a loja se parece precisa vê-la ali, não em outra
 * tela. `empresas.logo_url` continua sendo a mesma coluna — o que mudou é onde
 * se decide sobre ela.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import type { BannerDaLoja, Empresa } from '@decola/types';
import { medirImagem } from '@/dados/imagensProduto';
import { supabase } from '@/lib/supabase';
import { lerBinario } from '@/lib/arquivos';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';
import { recorteCentralizado, type AreaDeRecorte } from '@/lib/recorte';

export type ConfiguracaoDaLoja = {
  loja_slug: string | null;
  loja_ativa: boolean;
  whatsapp: string | null;
  /** Só o usuário, sem @ — quem monta o endereço é a vitrine. */
  loja_instagram: string | null;
  loja_descricao: string | null;
  reserva_horas: number | null;
};

/**
 * Aceita o que a pessoa colar: "@loja", "instagram.com/loja", "loja".
 * Devolve só o usuário, que é o que a constraint do banco admite.
 */
export function normalizarInstagram(valor: string): string | null {
  const limpo = valor
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
  return limpo === '' ? null : limpo;
}

export function instagramValido(usuario: string): boolean {
  return /^[A-Za-z0-9._]{1,30}$/.test(usuario);
}

/**
 * A cara da loja — o que o cliente do lojista vê antes de ler qualquer coisa.
 *
 * Separado de `ConfiguracaoDaLoja` porque são decisões de naturezas
 * diferentes: aquela define SE a loja existe e como ela funciona; esta define
 * como ela se parece. Salvar uma não deveria exigir mexer na outra.
 */
export type PersonalizacaoDaLoja = {
  loja_nome: string | null;
  logo_url: string | null;
  loja_cor: string | null;
  loja_banners: BannerDaLoja[];
  loja_banners_ativos: boolean;
};

export const MAXIMO_DE_BANNERS = 5;

const BUCKET = 'loja';

/** Caminho → URL pública. Guardamos caminho, nunca URL (ver 0043). */
export function urlDaImagemDaLoja(caminho: string): string {
  if (/^https?:\/\//.test(caminho)) return caminho;
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}

/**
 * MEDIDAS DO BANNER — e por que elas são fixas.
 *
 * O carrossel do site é `aspect-ratio: 16/7` com `object-fit: cover`. Isso
 * significa que o navegador JÁ recorta qualquer imagem fora dessa proporção —
 * ele só não avisa e não deixa escolher o que cortar. Uma foto de celular em
 * pé perdia a metade de cima e a metade de baixo, e o lojista via o resultado
 * na loja publicada, sem entender por quê.
 *
 * Recortando ANTES de subir, com a tela de ajuste, o que o lojista enquadrou é
 * o que o cliente vê: o navegador não tem mais nada para cortar.
 */
export const LARGURA_DO_BANNER = 1400;
export const ALTURA_DO_BANNER = 613; // 1400 × 7/16, arredondado
export const PROPORCAO_DO_BANNER = 16 / 7;

/** A logo aparece dentro de um quadrado, no topo da vitrine e na prévia. */
export const PROPORCAO_DA_LOGO = 1;
const LADO_DA_LOGO = 512;

/**
 * Sobe uma imagem da loja e devolve o CAMINHO.
 *
 * O `recorte` vem da tela de ajuste — é o pedaço que a pessoa escolheu. Quando
 * não vem, cai no recorte do meio, que é o melhor palpite possível sem uma
 * escolha para respeitar.
 *
 * Redimensionar não é enfeite: foto de celular passa dos 5 MB que o bucket
 * aceita, e a vitrine é aberta no 4G pelo cliente do lojista.
 */
export async function enviarImagemDaLoja(params: {
  empresaId: string;
  tipo: 'logo' | 'banners';
  uriLocal: string;
  recorte?: AreaDeRecorte;
}): Promise<string> {
  await exigirConexao();

  const ehBanner = params.tipo === 'banners';
  const proporcao = ehBanner ? PROPORCAO_DO_BANNER : PROPORCAO_DA_LOGO;

  const { largura, altura } = await medirImagem(params.uriLocal);
  const area = params.recorte ?? recorteCentralizado(largura, altura, proporcao);

  // Teto, não alvo: esticar uma foto pequena só acrescenta peso e borrão.
  const larguraFinal = Math.min(ehBanner ? LARGURA_DO_BANNER : LADO_DA_LOGO, area.width);
  const alturaFinal = Math.round(larguraFinal / proporcao);

  const reduzida = await ImageManipulator.manipulateAsync(
    params.uriLocal,
    [{ crop: area }, { resize: { width: larguraFinal, height: alturaFinal } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );

  const binario = await lerBinario(reduzida.uri);

  const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const caminho = `${params.empresaId}/${params.tipo}/${nome}`;

  const { error } = await supabase.storage.from(BUCKET).upload(caminho, binario, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    const texto = error.message.toLowerCase();
    if (texto.includes('row-level security') || texto.includes('unauthorized')) {
      throw new Error('Só o Gestor pode alterar a aparência da loja.');
    }
    if (texto.includes('exceeded') || texto.includes('too large')) {
      throw new Error('Esta imagem é grande demais. Tente outra.');
    }
    throw new Error(mensagemDeErro(error));
  }

  return caminho;
}

/**
 * Apaga o arquivo do bucket.
 *
 * Falha aqui não interrompe quem chama: o que a vitrine mostra é a lista
 * gravada em `empresas`. Arquivo órfão custa alguns KB; travar a remoção
 * porque o Storage recusou custa o lojista não conseguir tirar do ar um banner
 * errado.
 */
export async function apagarImagemDaLoja(caminho: string): Promise<void> {
  if (/^https?:\/\//.test(caminho)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) console.warn('[loja] arquivo não removido:', error.message);
}

/** Sugestões prontas: escolher de uma paleta é mais fácil do que digitar hex. */
export const CORES_SUGERIDAS = [
  { nome: 'Azul Decola', valor: '#01395E' },
  { nome: 'Vermelho', valor: '#C0392B' },
  { nome: 'Laranja', valor: '#F47A20' },
  { nome: 'Verde', valor: '#1E8449' },
  { nome: 'Roxo', valor: '#6C3483' },
  { nome: 'Rosa', valor: '#C2185B' },
  { nome: 'Turquesa', valor: '#117A65' },
  { nome: 'Grafite', valor: '#2C3E50' },
] as const;

export function corValida(valor: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(valor.trim());
}

/**
 * Texto legível sobre uma cor de fundo, decidido pela luminância.
 *
 * Existe para que o lojista não precise escolher isto. Ele escolhe a cor da
 * fachada dele; amarelo recebe texto escuro e azul-marinho recebe texto claro
 * sem que ninguém tenha de pensar no assunto — e sem que uma escolha inocente
 * produza uma vitrine ilegível.
 *
 * Coeficientes da recomendação de luminância relativa da W3C.
 */
export function textoSobre(cor: string): string {
  const hex = cor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminancia > 0.6 ? '#01395E' : '#FFFFFF';
}

export function extrairPersonalizacao(empresa: Empresa): PersonalizacaoDaLoja {
  return {
    loja_nome: empresa.loja_nome,
    logo_url: empresa.logo_url,
    loja_cor: empresa.loja_cor,
    loja_banners: Array.isArray(empresa.loja_banners) ? empresa.loja_banners : [],
    loja_banners_ativos: empresa.loja_banners_ativos,
  };
}

export async function salvarPersonalizacao(
  empresaId: string,
  dados: PersonalizacaoDaLoja,
): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('empresas')
    .update({
      loja_nome: dados.loja_nome?.trim() || null,
      logo_url: dados.logo_url,
      loja_cor: dados.loja_cor,
      loja_banners: dados.loja_banners,
      loja_banners_ativos: dados.loja_banners_ativos,
    })
    .eq('id', empresaId);

  if (error) {
    const texto = error.message.toLowerCase();
    if (texto.includes('empresas_loja_cor_formato')) {
      throw new Error('A cor precisa estar no formato #RRGGBB.');
    }
    if (texto.includes('empresas_loja_banners_formato')) {
      throw new Error(`A loja aceita no máximo ${MAXIMO_DE_BANNERS} banners.`);
    }
    if (texto.includes('empresas_loja_nome_nao_vazio')) {
      throw new Error('O nome da loja não pode ficar em branco. Deixe vazio para usar o nome da empresa.');
    }
    throw new Error(mensagemDeErro(error));
  }
}

/**
 * Converte um nome em endereço de loja.
 *
 * O formato tem que casar com a constraint `empresas_loja_slug_formato`:
 * minúsculas, números e hífen, começando e terminando em caractere
 * alfanumérico. Acento vira letra simples — "Padaria São João" precisa virar
 * um endereço que alguém consiga ditar por telefone.
 */
export function sugerirEndereco(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

export function enderecoValido(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$/.test(slug);
}

/** Só dígitos: é o que a API do WhatsApp aceita. O DDI 55 entra se faltar. */
export function normalizarWhatsapp(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

export function extrairConfiguracao(empresa: Empresa): ConfiguracaoDaLoja {
  return {
    loja_slug: empresa.loja_slug,
    loja_ativa: empresa.loja_ativa,
    whatsapp: empresa.whatsapp,
    loja_instagram: empresa.loja_instagram,
    loja_descricao: empresa.loja_descricao,
    reserva_horas: empresa.reserva_horas,
  };
}

export async function salvarConfiguracaoDaLoja(
  empresaId: string,
  dados: ConfiguracaoDaLoja,
): Promise<void> {
  await exigirConexao();

  const { error } = await supabase
    .from('empresas')
    .update({
      loja_slug: dados.loja_slug,
      loja_ativa: dados.loja_ativa,
      whatsapp: dados.whatsapp,
      loja_instagram: dados.loja_instagram,
      loja_descricao: dados.loja_descricao,
      reserva_horas: dados.reserva_horas,
    })
    .eq('id', empresaId);

  if (error) {
    // A unicidade do endereço é do banco. Traduzir aqui evita que a mensagem
    // técnica do Postgres chegue à tela.
    const texto = error.message.toLowerCase();
    if (texto.includes('empresas_loja_slug_unico')) {
      throw new Error('Este endereço já está sendo usado por outra loja. Escolha outro.');
    }
    if (texto.includes('empresas_loja_instagram_formato')) {
      throw new Error(
        'O Instagram aceita apenas letras, números, ponto e sublinhado — sem espaços.',
      );
    }
    if (texto.includes('empresas_loja_slug_formato')) {
      throw new Error(
        'O endereço da loja aceita apenas letras minúsculas, números e hífen, ' +
          'e deve começar e terminar com letra ou número.',
      );
    }
    throw new Error(mensagemDeErro(error));
  }
}

/** Quantos produtos estão de fato aparecendo na vitrine. */
export async function contarProdutosNaVitrine(empresaId: string): Promise<number> {
  const { count, error } = await supabase
    .from('produtos')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .eq('visivel_na_loja', true)
    .eq('ciclo_vida', 'ativo');

  if (error) throw new Error(mensagemDeErro(error));
  return count ?? 0;
}

/**
 * Onde o site público mora — e, portanto, onde as lojas dos clientes moram.
 *
 * É o domínio da Vercel de propósito, e não um domínio comprado. Este endereço
 * vai para dentro de link que o lojista imprime, salva e manda no WhatsApp:
 * ele precisa durar mais do que uma renovação anual. `decola.pro` é usado
 * SOMENTE como remetente de e-mail, onde o link é clicado em minutos e expira
 * sozinho — lá, um domínio que muda não deixa cliente na mão.
 *
 * `EXPO_PUBLIC_URL_SITE` existe para apontar a um ambiente de teste sem
 * recompilar a decisão; sem ela vale a produção.
 */
export const URL_DO_SITE = (
  process.env.EXPO_PUBLIC_URL_SITE ?? 'https://site-kappa-five-66.vercel.app'
).replace(/\/$/, '');

/** Só o miolo do endereço, para a tela mostrar sem o "https://" na frente. */
export const BASE_DA_LOJA_VISIVEL = `${URL_DO_SITE.replace(/^https?:\/\//, '')}/loja`;

export function enderecoCompleto(slug: string): string {
  return `${URL_DO_SITE}/loja/${slug}`;
}
