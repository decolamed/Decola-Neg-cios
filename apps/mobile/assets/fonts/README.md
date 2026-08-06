# Fontes da marca

Coloque aqui os arquivos das fontes da identidade visual (Seção 2.2), com
exatamente estes nomes:

| Arquivo                             | Uso                          |
| ----------------------------------- | ---------------------------- |
| `GlacialIndifference-Regular.ttf`   | Títulos (h2)                 |
| `GlacialIndifference-Bold.ttf`      | Títulos fortes (h1, números) |
| `Montserrat-Regular.ttf`            | Corpo de texto e legendas    |
| `Montserrat-SemiBold.ttf`           | Destaques, rótulos e botões  |

Depois de copiar os arquivos, faça os dois passos finais descritos em
`src/lib/fontes.ts`: descomentar as linhas de `MAPA_DE_FONTES` e virar
`FONTES_PERSONALIZADAS_DISPONIVEIS` para `true` em `packages/theme`.

Nada mais precisa mudar — o carregamento, a espera antes da primeira tela e o
aviso de inconsistência já estão implementados.
