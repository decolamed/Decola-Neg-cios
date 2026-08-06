/**
 * Ícones — traços simples desenhados com react-native-svg (já uma dependência
 * do projeto), na paleta da marca.
 *
 * Puramente visual: nenhum ícone adiciona ação. Cada tela escolhe o nome do
 * ícone que corresponde ao item que JÁ existe na sua estrutura.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';
import tema from '@decola/theme';

export type NomeDeIcone =
  | 'inicio'
  | 'vendas'
  | 'mais'
  | 'menu'
  | 'financeiro'
  | 'produtos'
  | 'estoque'
  | 'alerta'
  | 'equipe'
  | 'configuracoes'
  | 'perfil'
  | 'relatorios'
  | 'sino'
  | 'busca'
  | 'seta'
  | 'plano'
  | 'senha'
  | 'sair'
  | 'dinheiro'
  | 'pix'
  | 'cartao'
  | 'outros'
  | 'entrada'
  | 'saida';

type Props = { nome: NomeDeIcone; cor?: string; tamanho?: number };

export function Icone({ nome, cor = tema.cores.primaria, tamanho = 22 }: Props) {
  const comum = {
    stroke: cor,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      {nome === 'inicio' ? (
        <Path d="M3.5 10.5 12 3.8l8.5 6.7V20a.8.8 0 0 1-.8.8h-4.4v-6h-6.6v6H4.3a.8.8 0 0 1-.8-.8Z" {...comum} />
      ) : null}

      {nome === 'vendas' ? (
        <>
          <Path d="M3 4.5h2.2l2.3 10.2h9.8l2.2-7.2H6.4" {...comum} />
          <Circle cx="9.2" cy="19" r="1.5" {...comum} />
          <Circle cx="16.6" cy="19" r="1.5" {...comum} />
        </>
      ) : null}

      {nome === 'mais' ? (
        <>
          <Path d="M12 5.5v13" {...comum} />
          <Path d="M5.5 12h13" {...comum} />
        </>
      ) : null}

      {nome === 'menu' ? (
        <>
          <Circle cx="6" cy="12" r="1.4" fill={cor} />
          <Circle cx="12" cy="12" r="1.4" fill={cor} />
          <Circle cx="18" cy="12" r="1.4" fill={cor} />
        </>
      ) : null}

      {nome === 'financeiro' ? (
        <>
          <Rect x="3" y="6" width="18" height="12.5" rx="2.4" {...comum} />
          <Path d="M3 10.5h18" {...comum} />
          <Circle cx="16.4" cy="14.6" r="1.3" fill={cor} />
        </>
      ) : null}

      {nome === 'produtos' ? (
        <>
          <Path d="M12 3.4 20.2 8v8L12 20.6 3.8 16V8Z" {...comum} />
          <Path d="M3.8 8 12 12.6 20.2 8M12 12.6v8" {...comum} />
        </>
      ) : null}

      {nome === 'estoque' ? (
        <>
          <Rect x="3.4" y="9.6" width="7" height="10.4" rx="1.2" {...comum} />
          <Rect x="13.6" y="4" width="7" height="16" rx="1.2" {...comum} />
        </>
      ) : null}

      {nome === 'alerta' ? (
        <>
          <Path d="M12 4.2 21 19.6H3Z" {...comum} />
          <Path d="M12 10v3.6" {...comum} />
          <Circle cx="12" cy="16.6" r="1" fill={cor} />
        </>
      ) : null}

      {nome === 'equipe' ? (
        <>
          <Circle cx="9" cy="8.4" r="3.2" {...comum} />
          <Path d="M3.4 20c.6-3.2 2.9-5 5.6-5s5 1.8 5.6 5" {...comum} />
          <Path d="M16.2 6.6a3 3 0 0 1 0 5.6M17.6 15.6c1.6.7 2.7 2.2 3 4.4" {...comum} />
        </>
      ) : null}

      {nome === 'configuracoes' ? (
        <>
          <Circle cx="12" cy="12" r="3" {...comum} />
          <Path
            d="M12 3.2v2M12 18.8v2M4.8 12h2M17.2 12h2M6.9 6.9l1.4 1.4M15.7 15.7l1.4 1.4M17.1 6.9l-1.4 1.4M8.3 15.7l-1.4 1.4"
            {...comum}
          />
        </>
      ) : null}

      {nome === 'perfil' ? (
        <>
          <Circle cx="12" cy="8.6" r="3.6" {...comum} />
          <Path d="M4.6 20.4c.9-3.6 3.8-5.6 7.4-5.6s6.5 2 7.4 5.6" {...comum} />
        </>
      ) : null}

      {nome === 'relatorios' ? (
        <>
          <Path d="M4 19.4h16" {...comum} />
          <Path d="M6.6 19.4v-5M11 19.4V7.6M15.4 19.4v-8M19.8 19.4V4.6" {...comum} />
        </>
      ) : null}

      {nome === 'sino' ? (
        <>
          <Path d="M6.4 17.2V11a5.6 5.6 0 0 1 11.2 0v6.2H6.4Z" {...comum} />
          <Path d="M5 17.2h14M10.4 20h3.2" {...comum} />
        </>
      ) : null}

      {nome === 'busca' ? (
        <>
          <Circle cx="10.8" cy="10.8" r="6" {...comum} />
          <Path d="M15.4 15.4 20 20" {...comum} />
        </>
      ) : null}

      {nome === 'seta' ? <Path d="M9.5 5.5 16 12l-6.5 6.5" {...comum} /> : null}

      {nome === 'plano' ? (
        <>
          <Rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2.4" {...comum} />
          <Path d="M7.4 15.4h4.2M7.4 11.4h9.2" {...comum} />
        </>
      ) : null}

      {nome === 'senha' ? (
        <>
          <Rect x="5" y="10.6" width="14" height="9.4" rx="2.2" {...comum} />
          <Path d="M8.4 10.6V8.2a3.6 3.6 0 0 1 7.2 0v2.4" {...comum} />
        </>
      ) : null}

      {nome === 'sair' ? (
        <>
          <Path d="M14.4 4.6H6.6a1.6 1.6 0 0 0-1.6 1.6v11.6a1.6 1.6 0 0 0 1.6 1.6h7.8" {...comum} />
          <Path d="M13.6 12h6.4M17.4 9 20 12l-2.6 3" {...comum} />
        </>
      ) : null}

      {nome === 'dinheiro' ? (
        <>
          <Rect x="2.8" y="7" width="18.4" height="10" rx="2" {...comum} />
          <Circle cx="12" cy="12" r="2.4" {...comum} />
          <Path d="M6 12h.6M17.4 12h.6" {...comum} />
        </>
      ) : null}

      {nome === 'pix' ? (
        <Path
          d="M12 3.6 20.4 12 12 20.4 3.6 12Zm0 4.4L7.9 12 12 16.1 16.1 12Z"
          fill={cor}
          stroke="none"
        />
      ) : null}

      {nome === 'cartao' ? (
        <>
          <Rect x="2.8" y="5.6" width="18.4" height="12.8" rx="2.2" {...comum} />
          <Path d="M2.8 10h18.4" {...comum} />
          <Path d="M6.4 14.4h4" {...comum} />
        </>
      ) : null}

      {nome === 'outros' ? (
        <>
          <Circle cx="12" cy="12" r="8.4" {...comum} />
          <Circle cx="8.6" cy="12" r="1.2" fill={cor} />
          <Circle cx="12" cy="12" r="1.2" fill={cor} />
          <Circle cx="15.4" cy="12" r="1.2" fill={cor} />
        </>
      ) : null}

      {nome === 'entrada' ? (
        <>
          <Path d="M12 19V5.6" {...comum} />
          <Path d="M6.8 10.8 12 5.6l5.2 5.2" {...comum} />
        </>
      ) : null}

      {nome === 'saida' ? (
        <>
          <Path d="M12 5v13.4" {...comum} />
          <Path d="M6.8 13.2 12 18.4l5.2-5.2" {...comum} />
        </>
      ) : null}
    </Svg>
  );
}

/**
 * Ladrilho colorido de ícone — o quadradinho arredondado que aparece à
 * esquerda dos itens de lista e nos atalhos, sempre com o tom da própria cor.
 */
export function LadrilhoDeIcone({
  nome,
  cor = tema.cores.primaria,
  tamanho = tema.alturas.ladrilho,
  solido = false,
}: {
  nome: NomeDeIcone;
  cor?: string;
  tamanho?: number;
  solido?: boolean;
}) {
  return (
    <View
      style={[
        estilos.ladrilho,
        {
          width: tamanho,
          height: tamanho,
          borderRadius: tema.raio.md,
          backgroundColor: solido ? cor : tema.clarear(cor),
        },
      ]}
    >
      <Icone
        nome={nome}
        cor={solido ? tema.cores.textoInverso : cor}
        tamanho={Math.round(tamanho * 0.5)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  ladrilho: { alignItems: 'center', justifyContent: 'center' },
});
