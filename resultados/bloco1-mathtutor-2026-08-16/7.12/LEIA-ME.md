# 7.12 Conversion Factors — corpus PREPARADO, coleta INTERROMPIDA (19/08/2026)

**Status: NÃO entra no artigo.** A coleta foi cancelada por decisão do autor:
os 5 corpora concluídos (6.17, 6.19, 6.18, 6.20, 8.12 — 105 problemas, 630
grafos) já sustentam o argumento, e o 7.12 seria confirmação, não fundação.

O que existe aqui e por que fica preservado:
- `datasets/conversion-factors-7.12/` — dataset completo (18 problemas,
  envelopes A/B, interface-params), 0 vazamentos, pronto para uso futuro;
- `cases/ctat-7.12/` — `.brd` do especialista, interface e
  `campos-enunciado.json` declarados;
- `interface-ctat.js: descreverInterface712` — descrição da interface, com
  teste anti-vazamento nos 18 problemas;
- `piloto/` e `piloto-materializado/` — piloto de 2 exercícios (gate por
  enunciado 2/2; cobertura 0,500; caminho íntegro 0);
- `fixa-custo-beneficio/` — coleta do braço flash-lite COMPLETA (54 runs), e
  `fixa-estudantes-qwen/` interrompida. **Nenhum destes é analisado nem entra
  em qualquer tabela** (o consolidador só lê `materializado-v3-*`, que aqui não
  existe).

A regra de exclusão descoberta neste corpus — arestas de CONFIGURAÇÃO do
problema (`_root`/`inverseProb`), que não agem sobre componente algum da tela —
foi incorporada à régua e vale para todos os corpora; ela marca 18/18 problemas
aqui e NENHUM nos cinco publicados (teste em `__tests__/comparar-caminho.test.mjs`).

Para retomar: `scripts/cadeia-712b.sh` (coleta qwen + materialização dos dois
braços) e acrescentar a linha do 7.12 em `CORPORA` de `consolidar-corpora.mjs`.
