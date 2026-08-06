/**
 * Tela Funcionários — Seção 7.8.
 *
 * "Acesso EXCLUSIVO do Gestor."
 *
 * Ações: Adicionar funcionário (convite, Seção 5.2), Alterar permissão
 * (Seção 5.3) e Remover acesso (Seção 5.6). O Gestor Principal aparece na
 * lista, mas sem ações — é imutável (Seção 4.3).
 */
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { Icone } from '@/componentes/Icone';
import { useSessao } from '@/contexto/SessaoContexto';
import {
  listarFuncionarios,
  observarFuncionarios,
  ROTULO_PAPEL,
  type Funcionario,
} from '@/dados/funcionarios';

export default function Funcionarios() {
  const { conta, podeEscrever } = useSessao();
  const empresaId = conta?.empresa.id;

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    try {
      setFuncionarios(await listarFuncionarios(empresaId));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os funcionários.');
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useFocusEffect(
    useCallback(() => {
      if (!empresaId) return;
      void carregar();
      return observarFuncionarios(empresaId, () => void carregar());
    }, [empresaId, carregar]),
  );

  if (!conta) return <TelaCarregando />;

  // Seção 7.8 — acesso exclusivo do Gestor.
  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="A gestão de funcionários é exclusiva do Gestor." />;
  }

  if (carregando) return <TelaCarregando />;
  if (erro) return <TelaMensagem mensagem={erro} aoTentarNovamente={carregar} />;

  const ativos = funcionarios.filter((f) => f.status === 'ativo');
  const convidados = funcionarios.filter((f) => f.status === 'convidado');
  const removidos = funcionarios.filter((f) => f.status === 'removido');

  const secoes = [
    { titulo: 'Ativos', dados: ativos },
    { titulo: 'Convites pendentes', dados: convidados },
    { titulo: 'Sem acesso', dados: removidos },
  ].filter((s) => s.dados.length > 0);

  return (
    <SafeAreaView style={estilos.tela}>
      <FlatList
        data={secoes}
        keyExtractor={(item) => item.titulo}
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => {
              setAtualizando(true);
              void carregar();
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={estilos.titulo}>Funcionários</Text>
            <Text style={estilos.descricao}>
              Convide colaboradores e defina o que cada um pode fazer. Quem é removido perde o
              acesso, mas continua identificado no histórico.
            </Text>

            <Botao
              titulo="Adicionar funcionário"
              aoPressionar={() => router.push('/funcionarios/novo')}
              desabilitado={!podeEscrever}
              estilo={{ marginBottom: tema.espacamento.md }}
            />

            {!podeEscrever ? (
              <Aviso
                tom="alerta"
                mensagem="Sua conta está em modo de consulta. Não é possível convidar ou alterar funcionários."
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View>
            <Text style={estilos.secao}>{item.titulo}</Text>
            {item.dados.map((funcionario) => (
              <ItemFuncionario key={funcionario.id} funcionario={funcionario} />
            ))}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 1).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function ItemFuncionario({ funcionario }: { funcionario: Funcionario }) {
  // O Gestor Principal não pode ser rebaixado nem removido (Seção 4.3), então
  // não abre a tela de ações.
  const imutavel = funcionario.papel === 'gestor_principal';
  const semAcesso = funcionario.status === 'removido';

  return (
    <Pressable
      disabled={imutavel}
      onPress={() => router.push(`/funcionarios/${funcionario.id}`)}
      style={({ pressed }) => [estilos.item, pressed && !imutavel && { opacity: 0.85 }]}
    >
      <View
        style={[
          estilos.avatar,
          semAcesso && { backgroundColor: tema.cores.fundo },
        ]}
      >
        <Text style={[estilos.iniciais, semAcesso && { color: tema.cores.textoSuave }]}>
          {iniciais(funcionario.nome)}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={estilos.nome} numberOfLines={1}>
          {funcionario.nome}
        </Text>
        <Text style={estilos.email} numberOfLines={1}>
          {funcionario.email}
        </Text>

        <View style={estilos.etiquetas}>
          <Etiqueta texto={ROTULO_PAPEL[funcionario.papel]} cor={tema.cores.primaria} />

          {funcionario.status === 'convidado' ? (
            <Etiqueta
              texto={funcionario.convite_expirado ? 'Convite expirado' : 'Convite pendente'}
              cor={funcionario.convite_expirado ? tema.cores.negativo : tema.cores.alerta}
            />
          ) : null}

          {funcionario.status === 'removido' ? (
            <Etiqueta texto="Sem acesso" cor={tema.cores.textoSuave} />
          ) : null}
        </View>
      </View>

      {!imutavel ? <Icone nome="seta" cor={tema.cores.textoSuave} tamanho={18} /> : null}
    </Pressable>
  );
}

function Etiqueta({ texto, cor }: { texto: string; cor: string }) {
  return (
    <View style={[estilos.etiqueta, { backgroundColor: tema.clarear(cor) }]}>
      <Text style={[estilos.textoEtiqueta, { color: tema.escurecer(cor, 0.18) }]}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  descricao: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.lg,
  },
  secao: {
    ...tema.tipografia.h2,
    color: tema.cores.texto,
    marginTop: tema.espacamento.sm,
    marginBottom: tema.espacamento.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tema.espacamento.md,
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    marginBottom: tema.espacamento.sm,
    ...tema.elevacao.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: tema.raio.pill,
    backgroundColor: tema.cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: { ...tema.tipografia.corpoDestacado, color: tema.cores.destaque },
  nome: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  email: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  etiquetas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tema.espacamento.xs,
    marginTop: tema.espacamento.sm,
  },
  etiqueta: {
    borderRadius: tema.raio.pill,
    paddingHorizontal: tema.espacamento.sm,
    paddingVertical: 3,
  },
  textoEtiqueta: tema.tipografia.rotulo,
});
