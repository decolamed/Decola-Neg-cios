/**
 * Horário de funcionamento — Configurações.
 *
 * O QUE ISSO RESOLVE. A loja virtual atende 24 horas e o balcão não. Um pedido
 * que entra às 23h de domingo fica parado até segunda sem que ninguém tenha
 * dito isso ao cliente — ele volta em vinte minutos achando que foi ignorado.
 * Com o horário cadastrado, a vitrine mostra "aberta/fechada", lista a semana
 * no rodapé, e quem compra fora do horário lê, antes e depois de pagar, que o
 * pedido só vai ser atendido quando a loja abrir.
 *
 * A TELA É UMA LISTA DE SETE DIAS, cada um com um interruptor e dois horários.
 * Não há "copiar para os outros dias" nem faixas múltiplas por dia: são os dois
 * pedidos que mais aparecem e os dois que mais custam em tela pequena. O que
 * existe é "aplicar de segunda a sexta", que é o gesto que economiza quatro
 * preenchimentos idênticos — e é onde está quase todo o trabalho repetido.
 *
 * UM INTERVALO POR DIA. Muita loja fecha para o almoço, e a vontade de suportar
 * isso é grande. Mas cada intervalo a mais é uma linha a mais em SETE dias, e o
 * que o lojista perde por não ter o almoço aqui é pequeno perto do que perde
 * desistindo de preencher a tela inteira.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import tema from '@decola/theme';
import type { HorarioSemanal, IntervaloDoDia } from '@decola/types';
import { Aviso } from '@/componentes/Aviso';
import { Botao } from '@/componentes/Botao';
import { Cabecalho } from '@/componentes/Cabecalho';
import { TelaCarregando, TelaMensagem } from '@/componentes/EstadoDaTela';
import { useSessao } from '@/contexto/SessaoContexto';
import { salvarHorarioDeFuncionamento } from '@/dados/configuracoesEmpresa';
import { textoDoErro } from '@/lib/erros';

/** Domingo a sábado, na ordem do `Date.getDay()`. */
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** O que aparece quando a pessoa liga um dia que estava fechado. */
const PADRAO: IntervaloDoDia = { abre: '08:00', fecha: '18:00' };

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Sete posições vazias — o ponto de partida de quem nunca configurou.
 *
 * Começa com a semana comercial preenchida e o fim de semana fechado, e não com
 * tudo fechado: é o horário da maioria das lojas, e quem tem outro só mexe no
 * que difere. Uma tela que começa toda vazia pede sete decisões antes de dar
 * qualquer resultado.
 */
function sugestaoInicial(): HorarioSemanal {
  return [null, PADRAO, PADRAO, PADRAO, PADRAO, PADRAO, { abre: '08:00', fecha: '12:00' }];
}

/**
 * Digitação de hora que se conserta sozinha.
 *
 * Num campo livre a pessoa digita "8", "8h", "0800", "8:0" — e todos viram
 * horário inválido na hora de salvar, com a tela dizendo "corrija" sem dizer o
 * quê. Aqui só os dígitos contam e os dois pontos entram sozinhos: digitar
 * "0800" produz "08:00" enquanto se digita.
 */
function mascaraDeHora(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

export default function HorarioDeFuncionamento() {
  const { carregando, conta, podeEscrever, recarregar } = useSessao();

  const [dias, setDias] = useState<HorarioSemanal>(sugestaoInicial);
  const [carregou, setCarregou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  // O que já está gravado manda; a sugestão só vale para quem nunca configurou.
  useEffect(() => {
    if (carregou || !conta) return;
    const gravado = conta.empresa.horario_funcionamento;
    if (Array.isArray(gravado) && gravado.length === 7) setDias(gravado as HorarioSemanal);
    setCarregou(true);
  }, [conta, carregou]);

  const trocarDia = useCallback((indice: number, valor: IntervaloDoDia | null) => {
    setDias((atual) => atual.map((dia, i) => (i === indice ? valor : dia)));
    setMensagem(null);
  }, []);

  /** O primeiro dia útil ligado — é dele que "aplicar a todos" copia. */
  const modelo = useMemo(() => dias.slice(1, 6).find((d) => d !== null) ?? PADRAO, [dias]);

  const aplicarNaSemana = useCallback(() => {
    setDias((atual) => atual.map((dia, i) => (i >= 1 && i <= 5 ? { ...modelo } : dia)));
    setMensagem(null);
  }, [modelo]);

  const invalido = useMemo(
    () =>
      dias.findIndex(
        (dia) => dia !== null && (!HORA.test(dia.abre) || !HORA.test(dia.fecha)),
      ),
    [dias],
  );

  const salvar = useCallback(async () => {
    if (!conta) return;

    if (invalido >= 0) {
      setErro(`Confira o horário de ${DIAS[invalido].toLowerCase()}. Use o formato 08:00.`);
      return;
    }

    setErro(null);
    setSalvando(true);
    try {
      await salvarHorarioDeFuncionamento(conta.empresa.id, dias);
      // Recarrega a conta: a tela da loja e a vitrine leem daqui, e deixar a
      // memória do app com o valor antigo faria a próxima tela mentir.
      await recarregar();
      setMensagem('Horário salvo. Ele já aparece na sua loja virtual.');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível salvar o horário.'));
    } finally {
      setSalvando(false);
    }
  }, [conta, dias, invalido, recarregar]);

  const limpar = useCallback(async () => {
    if (!conta) return;
    setErro(null);
    setSalvando(true);
    try {
      await salvarHorarioDeFuncionamento(conta.empresa.id, null);
      await recarregar();
      setDias(sugestaoInicial());
      setMensagem('Horário removido. Sua loja deixa de informar horário de atendimento.');
    } catch (e) {
      setErro(textoDoErro(e, 'Não foi possível remover o horário.'));
    } finally {
      setSalvando(false);
    }
  }, [conta, recarregar]);

  if (carregando) return <TelaCarregando />;
  if (!conta) return <TelaMensagem mensagem="Não foi possível carregar sua empresa." />;
  if (!conta.ehGestor) {
    return <TelaMensagem mensagem="Só o Gestor pode alterar o horário de funcionamento." />;
  }

  const bloqueado = salvando || !podeEscrever;
  const jaTemGravado = Array.isArray(conta.empresa.horario_funcionamento);

  return (
    <SafeAreaView style={estilos.tela} edges={['top', 'left', 'right']}>
      <Cabecalho />

      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Horário de funcionamento</Text>
        <Text style={estilos.subtitulo}>
          Aparece na sua loja virtual. Quem comprar fora do horário é avisado de que o pedido será
          atendido quando você abrir — o pedido continua entrando normalmente.
        </Text>

        {erro ? <Aviso mensagem={erro} /> : null}
        {mensagem ? <Aviso tom="sucesso" mensagem={mensagem} /> : null}

        <View style={estilos.card}>
          {dias.map((dia, indice) => (
            <View key={DIAS[indice]} style={estilos.linha}>
              <View style={estilos.cabecalhoDoDia}>
                <Text style={estilos.nomeDoDia}>{DIAS[indice]}</Text>
                <Switch
                  value={dia !== null}
                  onValueChange={(ligado) => trocarDia(indice, ligado ? { ...PADRAO } : null)}
                  disabled={bloqueado}
                  trackColor={{ true: tema.cores.primariaFundo, false: tema.cores.borda }}
                  thumbColor={dia !== null ? tema.cores.destaque : tema.cores.fundoCard}
                />
              </View>

              {dia === null ? (
                <Text style={estilos.fechado}>Fechado</Text>
              ) : (
                <View style={estilos.horas}>
                  <CampoDeHora
                    rotulo="Abre"
                    valor={dia.abre}
                    bloqueado={bloqueado}
                    aoMudar={(v) => trocarDia(indice, { ...dia, abre: v })}
                  />
                  <Text style={estilos.ate}>às</Text>
                  <CampoDeHora
                    rotulo="Fecha"
                    valor={dia.fecha}
                    bloqueado={bloqueado}
                    aoMudar={(v) => trocarDia(indice, { ...dia, fecha: v })}
                  />
                </View>
              )}
            </View>
          ))}
        </View>

        {/* O atalho que economiza quatro preenchimentos iguais — e só ele. */}
        <Pressable onPress={aplicarNaSemana} disabled={bloqueado} style={estilos.atalho}>
          <Text style={estilos.atalhoTexto}>
            Aplicar {modelo.abre} às {modelo.fecha} de segunda a sexta
          </Text>
        </Pressable>

        <Text style={estilos.nota}>
          Fecha depois da meia-noite? Escreva assim mesmo: abre 18:00, fecha 02:00.
        </Text>

        <Botao titulo="Salvar horário" aoPressionar={salvar} carregando={salvando} desabilitado={!podeEscrever} />

        {jaTemGravado ? (
          <Botao
            titulo="Não informar horário"
            variante="texto"
            aoPressionar={limpar}
            desabilitado={bloqueado}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CampoDeHora({
  rotulo,
  valor,
  aoMudar,
  bloqueado,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  bloqueado: boolean;
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        value={valor}
        onChangeText={(texto) => aoMudar(mascaraDeHora(texto))}
        editable={!bloqueado}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={5}
        placeholder="08:00"
        placeholderTextColor={tema.cores.textoSuave}
        style={estilos.entrada}
        accessibilityLabel={rotulo}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: tema.cores.fundo },
  conteudo: { padding: tema.espacamento.lg, paddingBottom: tema.espacamento.xl, gap: tema.espacamento.sm },
  titulo: { ...tema.tipografia.h1, color: tema.cores.texto },
  subtitulo: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginTop: tema.espacamento.xs,
    marginBottom: tema.espacamento.sm,
    lineHeight: 20,
  },
  card: {
    backgroundColor: tema.cores.fundoCard,
    borderRadius: tema.raio.lg,
    padding: tema.espacamento.md,
    ...tema.elevacao.card,
  },
  linha: {
    paddingVertical: tema.espacamento.sm,
    borderBottomWidth: 1,
    borderBottomColor: tema.cores.bordaSuave,
  },
  cabecalhoDoDia: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nomeDoDia: { ...tema.tipografia.corpoDestacado, color: tema.cores.texto },
  fechado: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginTop: 2 },
  horas: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tema.espacamento.sm,
    marginTop: tema.espacamento.xs,
  },
  campo: { flex: 1 },
  rotulo: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, marginBottom: 2 },
  entrada: {
    ...tema.tipografia.corpo,
    color: tema.cores.texto,
    backgroundColor: tema.cores.fundoCampo,
    borderWidth: 1,
    borderColor: tema.cores.borda,
    borderRadius: tema.raio.md,
    paddingHorizontal: tema.espacamento.md,
    minHeight: 46,
    textAlign: 'center',
  },
  ate: { ...tema.tipografia.legenda, color: tema.cores.textoSuave, paddingBottom: 14 },
  atalho: { paddingVertical: tema.espacamento.sm, alignSelf: 'flex-start' },
  atalhoTexto: {
    ...tema.tipografia.corpoDestacado,
    color: tema.cores.primaria,
    textDecorationLine: 'underline',
  },
  nota: {
    ...tema.tipografia.legenda,
    color: tema.cores.textoSuave,
    marginBottom: tema.espacamento.sm,
  },
});
