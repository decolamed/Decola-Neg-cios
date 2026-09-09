/**
 * Chave Pix — validação e normalização.
 *
 * POR QUE ISTO EXISTE. O campo "Chave Pix" aceitava qualquer texto. Quem
 * digitava o próprio telefone como `74999300306` — que é como todo mundo
 * escreve telefone — salvava isso, e a tela Finalizar Venda montava um BR Code
 * perfeitamente bem formado em cima de uma chave que não existe em banco
 * nenhum. O QR abria no aplicativo do cliente, parecia certo, e o dinheiro não
 * chegava. Um QR errado é pior do que QR nenhum, porque ninguém desconfia dele.
 *
 * O Banco Central define exatamente cinco formatos de chave, e cada um tem uma
 * forma canônica. Telefone só vale com o país na frente (`+55` + DDD + número);
 * CPF e CNPJ só valem com os dígitos verificadores corretos; chave aleatória é
 * um UUID. Fora disso, não é chave — é texto.
 *
 * A normalização é determinística, não um chute: onze dígitos que passam no
 * dígito verificador são CPF; onze dígitos que não passam, começando por um DDD
 * existente, só podem ser telefone. Por isso dá para consertar o que a pessoa
 * digitou em vez de só reclamar.
 */

import {
  cnpjValido,
  cpfValido,
  formatarCnpj,
  formatarCpf,
} from './documento';

export type TipoDeChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export type ChavePixValida = {
  tipo: TipoDeChavePix;
  /** A chave no formato que o banco espera — é esta que se grava. */
  valor: string;
  /** Como mostrar ao gestor: legível, para ele conferir. */
  exibicao: string;
};

export class ErroChavePix extends Error {}

/** DDDs em uso no Brasil. Serve para separar telefone de "onze dígitos". */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const SO_DIGITOS = /\D/g;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;





function formatarTelefone(e164: string): string {
  const d = e164.slice(3); // tira o "+55"
  const ddd = d.slice(0, 2);
  const numero = d.slice(2);
  const meio = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, meio)}-${numero.slice(meio)}`;
}

/**
 * Interpreta o que a pessoa digitou. Lança `ErroChavePix` com uma explicação
 * do que está errado — nunca devolve uma chave "mais ou menos".
 */
export function interpretarChavePix(entrada: string): ChavePixValida {
  const texto = entrada.trim();

  if (texto === '') {
    throw new ErroChavePix('Digite a chave Pix ou deixe o campo vazio para não usar Pix.');
  }

  if (texto.includes('@')) {
    const email = texto.toLowerCase();
    if (!EMAIL.test(email)) {
      throw new ErroChavePix(
        'Este e-mail não parece completo. Uma chave de e-mail é como "loja@provedor.com.br".',
      );
    }
    if (email.length > 77) {
      throw new ErroChavePix('A chave de e-mail do Pix pode ter no máximo 77 caracteres.');
    }
    return { tipo: 'email', valor: email, exibicao: email };
  }

  if (UUID.test(texto)) {
    const valor = texto.toLowerCase();
    return { tipo: 'aleatoria', valor, exibicao: valor };
  }

  const digitos = texto.replace(SO_DIGITOS, '');

  if (digitos === '') {
    throw new ErroChavePix(
      'Não reconhecemos esta chave. Use CPF, CNPJ, e-mail, telefone com DDD ou a chave ' +
        'aleatória que o seu banco gerou.',
    );
  }

  if (cnpjValido(digitos)) {
    return { tipo: 'cnpj', valor: digitos, exibicao: formatarCnpj(digitos) };
  }

  if (cpfValido(digitos)) {
    return { tipo: 'cpf', valor: digitos, exibicao: formatarCpf(digitos) };
  }

  // Telefone: aceita com ou sem "+55", celular (9 dígitos, começa em 9) ou
  // fixo (8 dígitos, começa em 2–5). Sem esta segunda checagem, um CPF com um
  // dígito trocado vira "telefone" e o erro volta a passar despercebido.
  const semPais = digitos.startsWith('55') && digitos.length > 11 ? digitos.slice(2) : digitos;
  const numero = semPais.slice(2);
  const telefonePlausivel =
    DDDS.has(Number(semPais.slice(0, 2))) &&
    ((numero.length === 9 && numero.startsWith('9')) ||
      (numero.length === 8 && /^[2-5]/.test(numero)));

  if (telefonePlausivel) {
    const e164 = `+55${semPais}`;
    return { tipo: 'telefone', valor: e164, exibicao: formatarTelefone(e164) };
  }

  if (digitos.length === 11) {
    throw new ErroChavePix(
      'Estes 11 números não formam um CPF válido nem um telefone com DDD. ' +
        'Confira se digitou algum dígito errado.',
    );
  }

  if (digitos.length === 14) {
    throw new ErroChavePix('Este CNPJ não é válido. Confira os números digitados.');
  }

  throw new ErroChavePix(
    'Não reconhecemos esta chave. Use CPF, CNPJ, e-mail, telefone com DDD ou a chave ' +
      'aleatória que o seu banco gerou.',
  );
}

/**
 * Versão que não lança: devolve `null` para campo vazio (é o jeito de dizer
 * "esta loja não recebe por Pix") e a chave normalizada quando dá.
 */
export function normalizarChavePix(entrada: string): ChavePixValida | null {
  if (entrada.trim() === '') return null;
  return interpretarChavePix(entrada);
}

export const ROTULO_DO_TIPO: Record<TipoDeChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Chave aleatória',
};
