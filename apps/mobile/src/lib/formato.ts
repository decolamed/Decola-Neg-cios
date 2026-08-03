/** Formatação pt-BR. Centralizada para valores monetários não divergirem entre telas. */

export function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor);
}

/**
 * Converte a chave técnica de uma funcionalidade de plano
 * (ex: `relatorios_avancados`) em rótulo legível.
 *
 * A especificação define `planos.funcionalidades` como uma lista de chaves
 * (Seção 4.12.1) mas não define rótulos de exibição — esta é a apresentação
 * mínima possível, sem inventar nomes comerciais.
 */
export function rotuloDeFuncionalidade(chave: string): string {
  const texto = chave.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
