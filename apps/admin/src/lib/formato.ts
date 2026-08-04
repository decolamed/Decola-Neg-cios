/** Formatação pt-BR, igual à do app cliente. */

export function moeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

export function dataBR(valor: string | null | undefined): string {
  if (!valor) return '—';
  const data = valor.length === 10 ? new Date(`${valor}T12:00:00`) : new Date(valor);
  return data.toLocaleDateString('pt-BR');
}

export function dataHoraBR(valor: string | null | undefined): string {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR');
}

/** Para preencher `<input type="date">` a partir de um timestamp do banco. */
export function paraCampoData(valor: string | null | undefined): string {
  if (!valor) return '';
  return new Date(valor).toISOString().slice(0, 10);
}

/**
 * Slug do link direto de plano (Seções 6.3 e 7.15 C): minúsculas, sem acento,
 * separado por hífen.
 */
export function paraSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
