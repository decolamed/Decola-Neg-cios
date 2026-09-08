/**
 * O diálogo de confirmação do aplicativo.
 *
 * Montado uma vez na raiz e acionado por `Dialogo.alert` de qualquer lugar.
 * Substitui o `window.confirm` do navegador, que anunciava
 * "decolanegocios.vercel.app diz", empilhava título e mensagem em parágrafos
 * soltos e oferecia "OK/Cancelar" no lugar do verbo da ação — parecendo um
 * aviso do navegador invadindo a tela, e não uma pergunta do produto.
 *
 * O BOTÃO DIZ O QUE VAI ACONTECER. "Arquivar", "Cancelar venda", "Sair" — não
 * "OK". Quem lê depressa lê só o botão, e um "OK" sozinho não distingue
 * arquivar um produto de excluí-lo.
 *
 * Ação destrutiva sai em vermelho e o "Cancelar" fica à esquerda, que é onde o
 * polegar erra menos quando a intenção é desistir.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AlertButton } from 'react-native';
import tema from '@decola/theme';
import { registrarHospedeiroDeDialogos, type PedidoDeDialogo } from '@/lib/dialogo';

export function HospedeiroDeDialogos() {
  const [pedido, setPedido] = useState<PedidoDeDialogo | null>(null);

  useEffect(() => {
    registrarHospedeiroDeDialogos(setPedido);
    return () => registrarHospedeiroDeDialogos(null);
  }, []);

  const responder = useCallback((botao: AlertButton) => {
    setPedido(null);
    // Depois de fechar: se o `onPress` navegar, a tela some junto com o
    // diálogo em vez de deixá-lo piscando por cima da próxima.
    botao.onPress?.();
  }, []);

  if (!pedido) return null;

  const cancelamento = pedido.botoes.find((b) => b.style === 'cancel');
  const acoes = pedido.botoes.filter((b) => b.style !== 'cancel');

  return (
    <View style={estilos.fundo}>
      {/* Tocar fora equivale a cancelar — mas só quando existe um "cancelar":
          num aviso de um botão só, sair pelo lado deixaria a ação por fazer. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={() => (cancelamento ? responder(cancelamento) : undefined)}
      />

      <View style={estilos.caixa} accessibilityViewIsModal>
        <Text style={estilos.titulo}>{pedido.titulo}</Text>
        {pedido.mensagem ? <Text style={estilos.mensagem}>{pedido.mensagem}</Text> : null}

        <View style={estilos.acoes}>
          {cancelamento ? (
            <Pressable
              onPress={() => responder(cancelamento)}
              accessibilityRole="button"
              style={({ pressed }) => [estilos.botao, pressed && estilos.pressionado]}
            >
              <Text style={estilos.textoCancelar}>{cancelamento.text ?? 'Cancelar'}</Text>
            </Pressable>
          ) : null}

          {acoes.map((botao, indice) => (
            <Pressable
              key={`${botao.text ?? 'acao'}-${indice}`}
              onPress={() => responder(botao)}
              accessibilityRole="button"
              style={({ pressed }) => [
                estilos.botao,
                estilos.botaoPrincipal,
                botao.style === 'destructive' && estilos.botaoDestrutivo,
                pressed && estilos.pressionado,
              ]}
            >
              <Text
                style={[
                  estilos.textoPrincipal,
                  botao.style === 'destructive' && estilos.textoDestrutivo,
                ]}
              >
                {botao.text ?? 'OK'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  fundo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tema.espacamento.lg,
    backgroundColor: 'rgba(1, 41, 70, 0.55)',
  },
  caixa: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.lg,
    gap: tema.espacamento.sm,
    ...tema.elevacao.flutuante,
  },
  titulo: { ...tema.tipografia.h2, color: tema.cores.texto },
  mensagem: { ...tema.tipografia.corpo, color: tema.cores.textoSuave, lineHeight: 22 },
  acoes: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tema.espacamento.sm,
    marginTop: tema.espacamento.md,
    flexWrap: 'wrap',
  },
  botao: {
    minHeight: 44,
    paddingHorizontal: tema.espacamento.lg,
    borderRadius: tema.raio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoPrincipal: { backgroundColor: tema.cores.acaoPrimaria },
  botaoDestrutivo: { backgroundColor: tema.cores.destrutiva },
  pressionado: { opacity: 0.85 },
  textoCancelar: { ...tema.tipografia.corpoDestacado, color: tema.cores.textoSuave },
  textoPrincipal: { ...tema.tipografia.corpoDestacado, color: tema.cores.textoSobreAcao },
  textoDestrutivo: { color: tema.cores.textoInverso },
});
