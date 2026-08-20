# Experimento consolidado (2026-08) — um desenho, vários corpora

Esta pasta junta, num único experimento, o corpus original (Mathtutor 6.17,
24 problemas — rodadas 1–4) e os corpora públicos do Mathtutor do bloco 1
(6.19, 6.18, 6.20, 8.12, 7.12 — `resultados/bloco1-mathtutor-2026-08-16/`),
todos sob o MESMO desenho vigente:

- entrada dos agentes = **problema + interface do especialista** (envelope A;
  o grafo do especialista, envelope B, jamais entra);
- cadeia de produção completa: agents 3a/3b/3c → GraphForge (passos-livres) →
  agent 6 + agent 7 (materialização), problema fixo com gate objetivo;
- régua de estados do orientador: caminho de referência lido do `.brd`
  (estado de valor = aresta do **aluno** — `<Actor>` — com entrada não
  mecânica), subsequência ordenada exata (LCS), cobertura sem ordem, caminho
  íntegro, erros e dicas no estado certo, extras; unidade = grafo; BCa em
  cluster de exercício; 3 réplicas justificadas por decomposição de variância;
- agentes espelhados byte a byte da PRODUÇÃO em execução (commit 5263488,
  `producao/COMMIT-FONTE.txt` + `ESPELHO.sha256`; verificável com
  `node scripts/espelhar-producao.mjs --fonte <repo> --verify`);
- dois braços de modelo nos alunos simulados (flash-lite; qwen), materialização
  gpt-5.6-luna, temperaturas de produção.

`RESULTADOS.md` e `consolidado.json` são REGERADOS por
`node analysis/bancada-v2/consolidar-corpora.mjs` a cada corpus concluído
(a lista `CORPORA` no script é a fonte). Cada corpus mantém sua pasta com
pré-registro, logs, registros brutos, análise por braço e comparações — esta
pasta é a visão agregada, não substitui as fontes.

Como o 6.17 entra: pela rodada 4 (interface fixa), que é a versão do 6.17 sob o
desenho vigente; as rodadas 1–3 (bancada v2, estágio 3, materialização sem
interface) ficam como história do instrumento e como comparação pareada
(`rodada4-…/comparacao-r4-vs-r3-*.json`).

Para o artigo: `docs/GUIA-DO-ARTIGO.md` (§8–§9) e
`docs/PROMPT-ATUALIZAR-ARTIGO-2026-08-16.md` *(removido da árvore em 19-20/08/2026; no histórico git)* apontam para estes arquivos.


## Atualização de 19/08/2026 (pós-auditoria)

- Todos os 5 corpora re-materializados com o espelho **5263488** (registro de
  componentes completo). Pastas `materializado-v3-*`; v2/v1 preservadas para a
  comparação de versão (`comparacao-espelho-v3-vs-v2-*.json`).
- Recorte: **gate por enunciado**, 100 % nos 630 grafos → a tabela usa TODOS os
  grafos, sem exclusão.
- Métricas complementares obrigatórias, por corpus e braço:
  `linha-de-base-v3-*.json` (base de acaso, cobertura ajustada, precisão, F1) e
  `contrafactual-*.json` (o efeito de cada redefinição da régua).
- Comparação entre braços pareada: `comparacao-bracos.json` por corpus.
- Achados, correções e limitações: `docs/AUDITORIA-CIENTIFICA-2026-08-18.md`.
