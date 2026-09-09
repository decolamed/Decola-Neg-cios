/**
 * CPF e CNPJ — a validação do lado do servidor.
 *
 * POR QUE ESTE ARQUIVO É UMA CÓPIA. As Edge Functions rodam em Deno e não
 * enxergam os pacotes do workspace: não há como importar `@decola/pix` aqui.
 * O original é `packages/pix/src/documento.ts`; mudou lá, muda aqui.
 *
 * POR QUE VALIDAR DE NOVO. A tela já confere antes de enviar — e isso não vale
 * nada como garantia: o pedido chega por HTTP e qualquer um pode montá-lo à
 * mão. Vale a regra do projeto: nenhuma validação importante depende do
 * aplicativo. Aqui o custo de refazer a conta é zero, e o que se evita é criar
 * empresa e conta para um documento que o Asaas vai recusar depois — deixando a
 * pessoa cadastrada e sem pagar, que é exatamente o beco que já custou caro.
 */

const SO_DIGITOS = /\D/g;

export function digitosDoDocumento(entrada: string): string {
  return (entrada ?? '').replace(SO_DIGITOS, '');
}

/** Dígitos verificadores de CPF (módulo 11). */
function cpfValido(digitos: string): boolean {
  if (digitos.length !== 11) return false;
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
function cnpjValido(digitos: string): boolean {
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

export function documentoValido(entrada: string): boolean {
  const digitos = digitosDoDocumento(entrada);
  if (digitos.length === 11) return cpfValido(digitos);
  if (digitos.length === 14) return cnpjValido(digitos);
  return false;
}
