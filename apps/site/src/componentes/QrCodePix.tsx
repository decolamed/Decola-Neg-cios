/**
 * QR Code Pix da loja — com o valor do pedido dentro.
 *
 * POR QUE ISTO PASSOU A EXISTIR. A página do pedido mostrava só a chave e um
 * "Copiar chave". Copiar a chave é o pior caminho que o Pix oferece: o cliente
 * ainda precisa abrir o banco, colar, DIGITAR o valor e conferir o nome de
 * quem recebe — e é aí que ele erra a vírgula, paga R$ 3,29 em vez de R$ 32,90
 * e a loja perde a manhã acertando.
 *
 * O BR Code carrega o valor e o nome do recebedor. O cliente aponta a câmera e
 * confirma. O "copia e cola" continua aqui embaixo para quem prefere colar no
 * banco pelo próprio celular, e ele também já vem com o valor — não é a chave
 * crua.
 *
 * A montagem do payload é a MESMA do aplicativo (`@decola/pix`). Um BR Code
 * errado abre no banco, parece certo e não paga ninguém: não é lugar para duas
 * implementações que podem divergir.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { gerarPayloadPix, normalizarChavePix } from '@decola/pix';

type Props = {
  chave: string;
  valor: number;
  nomeRecebedor: string;
  descricao?: string;
};

export function QrCodePix({ chave, valor, nomeRecebedor, descricao }: Props) {
  const [imagem, setImagem] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let ativo = true;

    const montar = async () => {
      try {
        // Chave malformada não vira QR. Gerar assim mesmo produziria um código
        // que abre no banco do cliente e não chega em ninguém.
        const normalizada = normalizarChavePix(chave);
        if (!normalizada) throw new Error('Esta loja ainda não configurou a chave Pix.');

        const texto = gerarPayloadPix({
          chave: normalizada.valor,
          valor,
          nomeRecebedor,
          descricao,
        });

        const url = await QRCode.toDataURL(texto, {
          width: 460,
          margin: 1,
          // Nível médio de correção: sobra tolerância para tela suja ou foto
          // tremida sem inflar o desenho a ponto de fechar os módulos.
          errorCorrectionLevel: 'M',
        });

        if (!ativo) return;
        setPayload(texto);
        setImagem(url);
        setErro(null);
      } catch (e) {
        if (!ativo) return;
        setImagem(null);
        setPayload(null);
        setErro(e instanceof Error ? e.message : 'Não foi possível gerar o QR Code.');
      }
    };

    void montar();
    return () => {
      ativo = false;
    };
  }, [chave, valor, nomeRecebedor, descricao]);

  const copiar = async () => {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Área de transferência bloqueada: o código continua visível na tela.
    }
  };

  if (erro) {
    return <p className="legenda">{erro}</p>;
  }

  return (
    <div className="pix-qr">
      {imagem ? (
        <img src={imagem} alt="QR Code para pagamento por Pix" width={230} height={230} />
      ) : (
        <div className="pix-qr-vazio" aria-hidden="true" />
      )}

      <p className="legenda">
        Aponte a câmera do seu banco. O valor já vem preenchido — você não precisa digitar nada.
      </p>

      <button type="button" className="botao discreto" onClick={copiar} disabled={!payload}>
        {copiado ? 'Código copiado' : 'Copiar código Pix'}
      </button>

      {payload ? (
        <details className="pix-copia">
          <summary>Ver o código para colar</summary>
          <code>{payload}</code>
        </details>
      ) : null}
    </div>
  );
}
