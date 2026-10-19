# Bancada de verificação — `tests/verificacao/`

Verificações **zero-build, só Node** (como o resto de `tests/`). Complementam
`tests/run.js` (regressões do motor) e `tests/match-stats.js` (balanceamento).

## Como rodar

```bash
node tests/verificacao/run.js                 # todos os harnesses
node tests/verificacao/run.js audio atmosfera # só alguns
node tests/verificacao/run.js --index outro/index.html
```

Um harness isolado também roda sozinho:

```bash
node tests/verificacao/audio.js
node tests/verificacao/a11y.js
node tests/verificacao/atmosfera.js
node tests/verificacao/visual.js
node tests/verificacao/save.js
node tests/verificacao/temporada.js
node tests/verificacao/workflow.js
```

## Códigos de saída (importam para o gate)

| Código | Significado |
|---|---|
| `0` | tudo passou |
| `1` | alguma verificação falhou (o harness rodou e reprovou) |
| `2` | erro de **infraestrutura**: harness não pôde rodar (arquivo ausente, index inválido) |
| `3` | (harness isolado) não conseguiu ler um index.html utilizável |

A distinção entre `1` e `2` existe de propósito: "o código está errado" e "eu não consegui
medir" são problemas diferentes e não devem ser confundidos no fechamento da rodada.

## O que cada harness cobre

| Harness | Cobre |
|---|---|
| `atmosfera.js` | `MatchUI._atmosfera` (função pura): reage a momento/placar/relógio, goleada esfria o estádio, e a faixa do leito da torcida fica entre 0.05 e 0.20 — sempre abaixo dos picos de replay (0.22) e gol (0.26) |
| `audio.js` | ausência da locução humana, saída comum com limitador, apito de início ≠ fim, pênaltis com som, torcida ligada a `settings.sfx` e a trilha de tensão que responde ao momentum (leito +55%, passa-baixa 1100→3700 Hz) |
| `a11y.js` | os toggles de acessibilidade têm efeito real (não são placebo), `prefers-reduced-motion` vale de verdade (CSS + os três caminhos programáticos), alvos de 44px, `aria-label` nos botões de fechar, semântica de modal e foco, e as guardas do projeto (`backdrop-filter`, `aria-live`) |
| `visual.js` | a **fiação visual** da partida: o estádio não volta a ser `display:none` nem o board a ter fundo opaco, `.fx-shake`/`.fx-flash`/`.fx-floating` têm regra CSS de verdade, o campo é um SVG único (gol, rede, marca do pênalti, meia-lua, arcos) usado nas duas renderizações, `Inter` não voltou à pilha de fontes, o placar do resultado mantém a cor por desfecho, os rótulos pequenos têm piso e a engrenagem mantém 44px sem cobrir o cabeçalho. Pixels e estética seguem EXIGE HUMANO |
| `save.js` | extrai o `SaveRepository` **real** do `index.html` e prova que gravação e leitura produzem o mesmo checksum (saves de jogadores seguem válidos), que adulteração é detectada e que o round-trip funciona |
| `temporada.js` | a **fiação** do ciclo de temporada: a virada repõe o elenco da IA depois de envelhecer/aposentar, o carregamento do save repara liga já afetada (e só a da IA), o pós-rodada cura lesões pela função compartilhada, e a lesão de partida grava prazo com aviso no Rádio. O comportamento em si é testado em `tests/run.js`; aqui se garante que o app **chama** quem deve, nos três pontos que já fecharam o ciclo no passado (P0/B28 e B29) |
| `workflow.js` | o workflow de publicação não volta a expor o repositório (`path: '.'`), a limpeza de deployments é o último passo e inativa antes de excluir, e o script embutido é bash válido (`bash -n`, quando houver bash no host) |

## Como estender

`_lib.js` tem o que você precisa: `lerIndex()` (com validação do arquivo),
`blocosDeScript()`/`blocoCom()`, `semComentarios()`/`estiloDo()`, `sandboxComDom()` +
`avaliar()` + `exportar()` para rodar código do jogo em VM, e `criarRelatorio()`/`encerrar()`.

Ao acrescentar um harness novo, adicione o nome ao array `HARNESSES` em `run.js`.

Duas armadilhas que já custaram tempo aqui e valem lembrar:

1. **Comentários enganam asserção por texto.** Um comentário explicando "sem `will-change`"
   casa com a busca por `will-change`. Use `semComentarios()`/`estiloDo()` antes de casar.
2. **`const X` de dentro de um bloco não vira propriedade do sandbox.** Resolva o binding
   com `exportar(sb, 'X.metodo.bind(X)')`, que avalia a expressão dentro do contexto.
