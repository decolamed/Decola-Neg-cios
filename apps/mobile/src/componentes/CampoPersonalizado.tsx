/**
 * Renderiza um campo personalizado de produto conforme seu `tipo_campo`
 * (Seção 4.5): texto, número, seleção, booleano e data.
 *
 * O valor trafega como JSON para casar com `produtos.atributos` — número vira
 * `number`, sim/não vira `boolean`, os demais viram `string`. É exatamente o
 * que o trigger de validação do banco (0016) espera.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import tema from '@decola/theme';
import type { CampoConfigurado } from '@/dados/camposProduto';
import { CampoTexto } from './CampoTexto';
import { Seletor } from './Seletor';

type Props = {
  campo: CampoConfigurado;
  valor: unknown;
  aoMudar: (valor: unknown) => void;
  erro?: string | null;
  bloqueado?: boolean;
};

export function CampoPersonalizado({ campo, valor, aoMudar, erro, bloqueado }: Props) {
  const rotulo = campo.obrigatorio ? `${campo.nome_exibicao} *` : campo.nome_exibicao;

  if (campo.tipo_campo === 'booleano') {
    return (
      <View style={estilos.container}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        <View style={estilos.linhaBooleano}>
          <OpcaoBooleana
            rotulo="Sim"
            ativo={valor === true}
            bloqueado={bloqueado}
            aoPressionar={() => aoMudar(valor === true ? null : true)}
          />
          <OpcaoBooleana
            rotulo="Não"
            ativo={valor === false}
            bloqueado={bloqueado}
            aoPressionar={() => aoMudar(valor === false ? null : false)}
          />
        </View>
        {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
      </View>
    );
  }

  if (campo.tipo_campo === 'selecao') {
    return (
      <Seletor
        rotulo={rotulo}
        opcoes={(campo.opcoes ?? []).map((o) => ({ valor: o, rotulo: o }))}
        selecionado={typeof valor === 'string' ? valor : null}
        aoSelecionar={(novo) => aoMudar(novo)}
        bloqueado={bloqueado}
        erro={erro}
      />
    );
  }

  if (campo.tipo_campo === 'numero') {
    return (
      <CampoTexto
        rotulo={rotulo}
        valor={valor === null || valor === undefined ? '' : String(valor)}
        aoMudar={(texto) => {
          const limpo = texto.replace(',', '.');
          if (limpo.trim() === '') {
            aoMudar(null);
            return;
          }
          const numero = Number(limpo);
          // Texto não numérico é mantido como string para o usuário poder
          // corrigir; a validação do banco rejeita se sobrar assim.
          aoMudar(Number.isFinite(numero) ? numero : limpo);
        }}
        erro={erro}
        bloqueado={bloqueado}
        tipoTeclado="default"
      />
    );
  }

  // `data` usa entrada textual em AAAA-MM-DD — o banco valida o formato.
  return (
    <CampoTexto
      rotulo={rotulo}
      valor={typeof valor === 'string' ? valor : ''}
      aoMudar={(texto) => aoMudar(texto === '' ? null : texto)}
      erro={erro}
      bloqueado={bloqueado}
      placeholder={campo.tipo_campo === 'data' ? 'AAAA-MM-DD' : undefined}
    />
  );
}

function OpcaoBooleana({
  rotulo,
  ativo,
  bloqueado,
  aoPressionar,
}: {
  rotulo: string;
  ativo: boolean;
  bloqueado?: boolean;
  aoPressionar: () => void;
}) {
  return (
    <Pressable
      onPress={aoPressionar}
      disabled={bloqueado}
      accessibilityRole="button"
      accessibilityState={{ selected: ativo, disabled: bloqueado }}
      style={({ pressed }) => [
        estilos.opcao,
        ativo && estilos.opcaoAtiva,
        bloqueado && { opacity: tema.estados.disabledOpacidade },
        pressed && !bloqueado && { opacity: 0.85 },
      ]}
    >
      <Text style={[estilos.opcaoTexto, ativo && estilos.opcaoTextoAtivo]}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  container: { marginBottom: tema.espacamento.md },
  rotulo: {
    ...tema.tipografia.legenda,
    color: tema.cores.texto,
    marginBottom: tema.espacamento.xs,
  },
  linhaBooleano: { flexDirection: 'row', gap: tema.espacamento.sm },
  opcao: {
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.lg,
    paddingVertical: tema.espacamento.sm,
    backgroundColor: tema.cores.superficie,
  },
  opcaoAtiva: { backgroundColor: tema.cores.primaria, borderColor: tema.cores.primaria },
  opcaoTexto: { ...tema.tipografia.legenda, color: tema.cores.texto },
  opcaoTextoAtivo: { color: tema.cores.textoInverso },
  erro: { ...tema.tipografia.legenda, color: tema.cores.erro, marginTop: tema.espacamento.xs },
});
