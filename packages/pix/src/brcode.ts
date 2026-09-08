/**
 * Geração do BR Code (Pix copia-e-cola / QR Code) — Seção 7.4.
 *
 * "Gera QR Code Pix usando a chave cadastrada pela empresa
 * (`empresas.chave_pix`), com valor e descrição opcional. NÃO há confirmação
 * automática — é geração de cobrança; o usuário confirma manualmente ao tocar
 * 'Confirmar venda'."
 *
 * É um sistema TECNICAMENTE INDEPENDENTE da integração Asaas (Seção 6.4), que
 * serve só para a cobrança da assinatura SaaS. Aqui não há chamada de API
 * nenhuma: o payload é montado no dispositivo a partir da chave da empresa,
 * seguindo o padrão EMV MPM do Banco Central.
 */

/** Monta um campo no formato EMV: ID + tamanho (2 dígitos) + valor. */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
}

/**
 * Normaliza texto para os campos do BR Code: sem acento, maiúsculas, apenas
 * caracteres seguros, e truncado no limite do campo.
 */
function normalizar(texto: string, limite: number): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, limite);
}

/** CRC16/CCITT-FALSE — polinômio 0x1021, valor inicial 0xFFFF. */
function crc16(payload: string): string {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type DadosDoPix = {
  chave: string;
  valor: number;
  nomeRecebedor: string;
  /** Descrição opcional que aparece para o pagador. */
  descricao?: string | null;
  /**
   * Cidade do recebedor. O schema da empresa não tem campo de cidade separado
   * (`endereco` é texto livre, Seção 4.1), então o chamador informa ou usamos
   * o padrão abaixo. Os PSPs não validam este campo de forma estrita.
   */
  cidade?: string | null;
};

export const CIDADE_PADRAO = 'BRASIL';

/**
 * Retorna o payload "copia e cola" — o mesmo texto que vira o QR Code.
 * Lança se a empresa não tiver chave Pix cadastrada.
 */
export function gerarPayloadPix({
  chave,
  valor,
  nomeRecebedor,
  descricao,
  cidade,
}: DadosDoPix): string {
  const chaveLimpa = chave.trim();
  if (chaveLimpa === '') {
    throw new Error(
      'Nenhuma chave Pix cadastrada. Configure a chave em Configurações para gerar o QR Code.',
    );
  }

  if (!(valor > 0)) {
    throw new Error('O valor da cobrança Pix precisa ser maior que zero.');
  }

  const descricaoLimpa = descricao ? normalizar(descricao, 72) : '';

  const contaComerciante =
    campo('00', 'br.gov.bcb.pix') +
    campo('01', chaveLimpa) +
    (descricaoLimpa ? campo('02', descricaoLimpa) : '');

  const semCrc =
    campo('00', '01') +
    // 12 = QR de uso único (um pagamento), que é o caso de uma venda.
    campo('01', '12') +
    campo('26', contaComerciante) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valor.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', normalizar(nomeRecebedor, 25) || 'RECEBEDOR') +
    campo('60', normalizar(cidade ?? CIDADE_PADRAO, 15) || CIDADE_PADRAO) +
    campo('62', campo('05', '***')) +
    // O CRC é calculado sobre a string já contendo "6304".
    '6304';

  return semCrc + crc16(semCrc);
}
