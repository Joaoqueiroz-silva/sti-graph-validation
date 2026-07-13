# Bateria congelada de traços — frac-numberline-6.17-v1

- **Versão**: v1 (congelada; qualquer mudança de regra exige v2 em novo diretório)
- **Data de congelamento**: 2026-07-13
- **Escopo**: 24 exercícios do corpus CTAT 6.17 (frações na reta numérica), 1 arquivo
  `<exercicio>.json` por exercício
- **Integridade**: `MANIFEST.sha256` lista o sha256 de cada arquivo (formato `sha256sum -c`)
- **Gerador**: `battery-gen.mjs` (determinístico: sem aleatoriedade, sem datas em conteúdo,
  decimais por aritmética inteira; rodar 2x produz bytes idênticos)

## Regras de geração

### Família A — "referencia" (extraída do BRD lacrado do especialista)
Permitido porque a bateria congela ANTES da próxima geração de grafos; o robô nunca lê
estes arquivos. Por exercício:
1. o traço correto completo (1ª transição correta de cada estado, do start ao estado final);
2. um traço por transição buggy: menor caminho correto (BFS) até o estado de origem + o SAI buggy;
3. um `hintRequest` no estado inicial.

### Família B — "mutado" (transformações determinísticas dos traços da família A)
Passo-alvo de resposta = o ÚLTIMO passo do traço correto com input semanticamente igual à
resposta do exercício (o AddPoint da reta). Mutações, nesta ordem:
1. **selecao-errada** — selection do passo de resposta trocada pela do passo anterior com
   selection diferente (outra selection EXISTENTE no traço);
2. **input-equivalente-fracao** — input do passo de resposta vira `2·num/2·den` (k=2);
3. **input-equivalente-decimal** — forma decimal exata, SÓ quando o denominador reduzido
   é da forma 2^a·5^b (senão o item não existe);
4. **ordem-alternativa** — os dois primeiros passos trocados;
5. **repeticao-primeiro-passo** — o primeiro passo duplicado;
6. **acao-apos-objetivo** — o último passo repetido após a conclusão.

### Família C — "probe" (gerador de domínio puro)
Entrada: SOMENTE numerador, denominador e rBound/line_name do answer key
(`answer-key/frac-numberline-6.17.json`) — nunca o BRD. O prefixo de setup é o template
fixo da interface compartilhada do dataset (showAnswer → writeFractionStep → set_maximum
→ F1 → F2 → denom), seguido de um AddPoint com o valor da sonda:
`0`, `1`, `num/num`, `den/den`, `den/num` (invertida), `(num±1)/den`, `num/(den±1)`
(omitida quando den−1=0), `-num/den`, decimal equivalente (só quando exata) e decimal
próxima NÃO equivalente (exata: +1 na última casa, mínimo 2 casas; dízima: truncamento em
2 casas). Dedupe LITERAL dentro da família (1ª ocorrência vence).

Nota de honestidade metodológica: algumas sondas COINCIDEM semanticamente com distratores
templatizados do especialista (ex.: `(num−1)/den` é o distrator "badCount" do corpus).
A independência da família C é de PROVENIÊNCIA (derivável do answer key sozinho), não de
disjunção de valores — é isso que o teste de regeneração trava.

## Limites
- **Profundidade máxima**: 64 eventos por traço.
- **Política para ciclos**: nenhum traço visita o mesmo estado mais de 2 vezes
  (guard nos construtores; o corpus 6.17 é acíclico no caminho correto).

## Formato do item
`{ id, family: "referencia"|"mutado"|"probe", kind, trace[], expectedNote }` — `expectedNote`
explica o porquê do item SEM prescrever veredito; `trace[]` são eventos
`{ selection, action, input }` ou `{ hintRequest: true }` executáveis pelo `trace-executor.js`.
