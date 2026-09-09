/**
 * CPF e CNPJ — os dígitos verificadores, num lugar só.
 *
 * POR QUE SAIU DE `chave.ts`. Nasceram lá, a serviço da chave Pix, e passaram a
 * fazer falta longe dali: a contratação precisa do documento do pagador porque
 * o Asaas recusa criar cobrança sem ele — "Para criar esta cobrança é
 * necessário preencher o CPF ou CNPJ do cliente" foi o que o cliente leu na
 * tela. Copiar a conta do módulo 11 para um segundo arquivo é como as duas
 * cópias passam a discordar; então a conta ficou aqui e `chave.ts` importa.
 *
 * VALIDAR NÃO É CONFERIR SE EXISTE. O dígito verificador só prova que o número
 * é bem formado — quem diz se o documento existe é a Receita, e quem recusa de
 * fato é o Asaas. O que isto evita é a pessoa descobrir o erro de digitação
 * depois de preencher o cadastro inteiro, numa mensagem em inglês do gateway.
 */

const SO_DIGITOS = /\D/g;

export type TipoDeDocumento = 'cpf' | 'cnpj';

/** Dígitos verificadores de CPF (módulo 11). */
export function cpfValido(digitos: string): boolean {
  if (digitos.length !== 11) return false;
  // 00000000000, 11111111111… passam na conta e não são CPF de ninguém.
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  for (const [tamanho, peso] of [
    [9, 10],
    [10, 11],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(digitos[i]) * (peso - i);
    const resto = (soma * 10) % 11;
    const esperado = resto === 10 ? 0 : resto;
    if (esperado !== Number(digitos[tamanho])) return false;
  }

  return true;
}

/** Dígitos verificadores de CNPJ (módulo 11, pesos 2..9 cíclicos). */
export function cnpjValido(digitos: string): boolean {
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  for (const tamanho of [12, 13]) {
    let soma = 0;
    let peso = tamanho - 7;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(digitos[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    const esperado = resto < 2 ? 0 : 11 - resto;
    if (esperado !== Number(digitos[tamanho])) return false;
  }

  return true;
}

export function formatarCpf(d: string): string {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCnpj(d: string): string {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Só os dígitos — é neste formato que o documento é gravado e enviado. */
export function digitosDoDocumento(entrada: string): string {
  return (entrada ?? '').replace(SO_DIGITOS, '');
}

/**
 * O que a pessoa digitou é um CPF, um CNPJ, ou nenhum dos dois?
 *
 * O comprimento decide qual conta fazer; o dígito verificador decide se vale.
 * Devolver o tipo — e não só um booleano — permite à tela dizer "CPF inválido"
 * em vez de "documento inválido", que é a diferença entre a pessoa achar o erro
 * e a pessoa desistir.
 */
export function tipoDoDocumento(entrada: string): TipoDeDocumento | null {
  const digitos = digitosDoDocumento(entrada);
  if (digitos.length === 11) return cpfValido(digitos) ? 'cpf' : null;
  if (digitos.length === 14) return cnpjValido(digitos) ? 'cnpj' : null;
  return null;
}

export function documentoValido(entrada: string): boolean {
  return tipoDoDocumento(entrada) !== null;
}

/** Como mostrar ao usuário, para ele conferir o que digitou. */
export function formatarDocumento(entrada: string): string {
  const digitos = digitosDoDocumento(entrada);
  if (digitos.length === 11) return formatarCpf(digitos);
  if (digitos.length === 14) return formatarCnpj(digitos);
  return digitos;
}

/**
 * Máscara enquanto se digita.
 *
 * Vai revelando a pontuação conforme os dígitos entram, e para em 14 — o maior
 * documento possível. Sem isto, o campo aceita colar um texto inteiro e só
 * reclama no fim.
 */
export function mascararDocumento(entrada: string): string {
  const d = digitosDoDocumento(entrada).slice(0, 14);

  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}
