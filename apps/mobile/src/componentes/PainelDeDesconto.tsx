/**
 * Desconto da venda — Seção 7.3.
 *
 * Por percentual ou valor fixo. Sem teto configurável na V1: aceita qualquer
 * valor entre 0% e 100% do subtotal (ou valor fixo até o limite do subtotal),
 * nunca deixando o total negativo. O servidor revalida na hora de registrar.
 */
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import { Botao } from './Botao';
import { CampoTexto } from './CampoTexto';
import { Seletor } from './Seletor';
import type { DescontoTipo } from '@/dados/vendas';
import { moeda } from '@/lib/formato';

type Props = {
  subtotal: number;
  tipoAtual: DescontoTipo | null;
  valorAtual: number;
  aoFechar: () => void;
  aoAplicar: (tipo: DescontoTipo | null, valor: number) => void;
};

export function PainelDeDesconto({ subtotal, tipoAtual, valorAtual, aoFechar, aoAplicar }: Props) {
  const [tipo, setTipo] = useState<DescontoTipo>(tipoAtual ?? 'percentual');
  const [valor, setValor] = useState(valorAtual > 0 ? String(valorAtual).replace('.', ',') : '');
  const [erro, setErro] = useState<string | null>(null);

  const numero = Number(valor.replace(',', '.'));
  const previa =
    Number.isFinite(numero) && numero > 0
      ? tipo === 'percentual'
        ? Math.min(Math.round(subtotal * Math.min(numero, 100)) / 100, subtotal)
        : Math.min(numero, subtotal)
      : 0;

  const aplicar = () => {
    setErro(null);

    if (valor.trim() === '') {
      aoAplicar(null, 0);
      return;
    }

    if (!Number.isFinite(numero) || numero < 0) {
      setErro('Informe um valor válido.');
      return;
    }

    if (tipo === 'percentual' && numero > 100) {
      setErro('O desconto não pode passar de 100%.');
      return;
    }

    if (tipo === 'valor_fixo' && numero > subtotal) {
      setErro('O desconto não pode ser maior que o valor da venda.');
      return;
    }

    aoAplicar(tipo, numero);
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={estilos.fundo}>
        <View style={estilos.painel}>
          <Text style={estilos.titulo}>Desconto</Text>

          <Seletor
            opcoes={[
              { valor: 'percentual', rotulo: 'Percentual (%)' },
              { valor: 'valor_fixo', rotulo: 'Valor fixo (R$)' },
            ]}
            selecionado={tipo}
            aoSelecionar={(v) => setTipo((v as DescontoTipo) ?? 'percentual')}
          />

          <CampoTexto
            rotulo={tipo === 'percentual' ? 'Percentual' : 'Valor em reais'}
            valor={valor}
            aoMudar={setValor}
            erro={erro}
            placeholder={tipo === 'percentual' ? '10' : '0,00'}
          />

          <Text style={estilos.previa}>
            Desconto: {moeda(previa)} · Total: {moeda(subtotal - previa)}
          </Text>

          <Botao titulo="Aplicar desconto" aoPressionar={aplicar} variante="secundario" />
          <Botao
            titulo="Remover desconto"
            variante="texto"
            aoPressionar={() => aoAplicar(null, 0)}
          />
          <Botao titulo="Cancelar" variante="texto" aoPressionar={aoFechar} />
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    flex: 1,
    backgroundColor: 'rgba(1, 57, 94, 0.45)',
    justifyContent: 'center',
    padding: tema.espacamento.lg,
  },
  painel: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
  },
  titulo: { ...tema.tipografia.h2, color: tema.cores.texto, marginBottom: tema.espacamento.md },
  previa: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.primaria,
    marginBottom: tema.espacamento.md,
  },
});
