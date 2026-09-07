/**
 * Configurações da vitrine — o que torna a loja pública possível.
 *
 * Escrita direta em `empresas`, como o resto das configurações: a política
 * `empresas_edicao` já exige Gestor, e não há regra composta a revalidar —
 * ligar a loja é gravar uma coluna.
 *
 * O que NÃO está aqui, de propósito: logo, endereço, telefone e chave Pix já
 * existem em "Dados da empresa" e alimentam a vitrine de lá. Repetir os campos
 * criaria dois lugares para editar a mesma coisa.
 */
import type { Empresa } from '@decola/types';
import { supabase } from '@/lib/supabase';
import { exigirConexao } from '@/lib/conectividade';
import { mensagemDeErro } from '@/lib/erros';

export type ConfiguracaoDaLoja = {
  loja_slug: string | null;
  loja_ativa: boolean;
  whatsapp: string | null;
  loja_descricao: string | null;
  reserva_horas: number | null;
};

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
  process.env.EXPO_PUBLIC_URL_SITE ?? 'https://decolanegocios.vercel.app'
).replace(/\/$/, '');

/** Só o miolo do endereço, para a tela mostrar sem o "https://" na frente. */
export const BASE_DA_LOJA_VISIVEL = `${URL_DO_SITE.replace(/^https?:\/\//, '')}/loja`;

export function enderecoCompleto(slug: string): string {
  return `${URL_DO_SITE}/loja/${slug}`;
}
