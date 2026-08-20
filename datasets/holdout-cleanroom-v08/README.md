# Holdout clean-room v0.8

Corpus sintético original de 50 problemas (cinco famílias × dez), gerado offline e deterministicamente por `scripts/gerar-holdout-cleanroom-v08.mjs`. Nenhum enunciado ou gabarito foi derivado do CTAT/Mathtutor/CMU.

- entrada dos agentes: somente `envelope-a.json`, que contém apenas `id` e `problem`;
- referência pós-geração: `envelope-b.json` e `reference-v08.json`;
- licença dos dados: CC0-1.0; código: MIT;
- semente: `8042026`;
- protocolo: `docs/EMENDA-V0.8-02-HOLDOUT-CLEANROOM-2026-08-20.md`.

Reproduza com `node scripts/gerar-holdout-cleanroom-v08.mjs --check`. Para materializar novamente os arquivos a partir do gerador, use `--write`.
