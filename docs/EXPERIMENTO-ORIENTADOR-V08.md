# Execução segura do experimento prospectivo v0.8

Este documento operacionaliza a Trilha P do
[`PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md`](PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md).
O desenho exato e a regra de ancoragem estruturada estão congelados na
[`EMENDA-V0.8-01-ANCORAGEM-E-COLETA-2026-08-20.md`](EMENDA-V0.8-01-ANCORAGEM-E-COLETA-2026-08-20.md).
O comando padrão **apenas calcula e exibe o plano**: não consulta a OpenRouter,
não cria diretório de resultados e não exige credencial.

```bash
npm run experiment:v08
```

## Desenho congelado

- 5 corpora, 105 problemas: unidades 6.17, 6.18, 6.19, 6.20 e 8.12;
- 3 modelos de geração: `google/gemini-3.1-flash-lite`,
  `qwen/qwen3-max` e `google/gemini-3.5-flash`;
- 2 políticas de entrada: `historico-v1` e `somente-enunciado-v1`;
- 10 réplicas por problema, modelo e política;
- topologia livre, sem o corte estático de passos;
- temperaturas congeladas em 0,2/0,7/0,4 para agents 3a/3b/3c e 0,5/0,35
  para planner/worker do agent 6;
- raciocínio do provedor desativado e excluído da resposta em todas as chamadas
  (`STI_SEM_RACIOCINIO=1`);
- estágio bruto do GraphForge e estágio materializado por agent 6 + agent 7,
  sempre pareados pelo mesmo problema e réplica.

Isso produz 6.300 grafos brutos e 6.300 grafos materializados. O orquestrador
divide a execução em 132 células de, no máximo, 5 problemas × 10 réplicas. Uma
célula só começa depois do preflight e da trava global; o orçamento é conferido
novamente depois da geração e depois da materialização.

O `manifesto-plano-v08.json` não contém data, credencial ou caminho absoluto.
Ele inclui IDs e hashes dos 105 pares de envelopes, hashes do software, todas as
células e as premissas de custo. Além dos arquivos nucleares nomeados, um
digest cobre toda a árvore executável (`config/`, `producao/`, `scripts/` e os
módulos JS/MJS da raiz). Uma retomada só é aceita se o manifesto local
for idêntico ao plano recalculado.

## Custo planejado

| fase/modelo | runs | chamadas lógicas | estimativa |
|---|---:|---:|---:|
| Gemini 3.1 Flash-Lite | 2.100 | 6.300 | US$ 14,15 |
| Qwen3 Max | 2.100 | 6.300 | US$ 79,54 |
| Gemini 3.5 Flash | 2.100 | 6.300 | US$ 84,91 |
| Materialização, GPT-5.6 Luna | 6.300 | 12.600 | US$ 37,80 |
| **Total esperado** |  | **31.500** | **US$ 216,40** |

O teto recomendado é **US$ 250**, aproximadamente 15% acima da estimativa e
arredondado para a próxima dezena. A estimativa usa os tokens médios observados
nos braços já executados; ela não garante o preço final. O ledger usa o `usage`
registrado em cada chamada. Se não houver margem conservadora para a célula
seguinte, ela não começa.

Preços congelados na estimativa de geração, em US$/milhão de tokens de
entrada/saída: Flash-Lite 0,25/1,50; Qwen3 Max 0,78/3,90; Gemini 3.5 Flash
1,50/9,00. A materialização usa a média empírica de US$ 0,006 por run.

## Travas de segurança

1. `--executar`, `--budget-usd` e `--out` são obrigatórios em conjunto.
2. O preflight valida Node, credencial e saldo informados pela OpenRouter,
   disponibilidade dos quatro modelos, permissão de escrita, os 210 envelopes,
   os arquivos do pipeline e, por padrão, exige worktree limpa. As consultas de
   preflight remoto não geram completions nem custo de inferência.
3. `STI_BUDGET_DIR` mantém um único `budget.json` para todas as células. Os
   manifests continuam junto de cada célula.
4. Antes de cada chamada há uma reserva conservadora específica do modelo; uma
   chamada não começa se essa reserva não couber no saldo global.
5. O modelo primário e a nova tentativa são pinados no mesmo identificador.
   Depois de cada fase, qualquer chamada com outro modelo invalida a execução.
   Overrides de modelo, temperatura e raciocínio herdados do shell/`.env` são
   removidos; os valores congelados são reinseridos no ambiente de cada célula.
6. Cada run é gravado por `rename` atômico. Run concluído nunca é sobrescrito.
7. Se houver recibo de chamada sem o JSON final — por exemplo, queda de energia
   depois da resposta — a retomada bloqueia em vez de cobrar de novo.
8. O materializador retorna código de saída não-zero se qualquer registro falhar.
9. O ledger é reconciliado com todos os manifests antes e depois das células;
   custo desconhecido bloqueia a campanha em vez de ser contado como zero.
10. Um lock exclusivo impede dois orquestradores de gastar simultaneamente no
    mesmo destino; `--retomar` só substitui lock local cujo processo já morreu.

Uma segunda tentativa no **mesmo** modelo pode aparecer como
`fallbackUsed: true`; não há troca para outro modelo. A flag não autoriza mudar
o braço experimental.

## Execução — somente após autorização explícita do orçamento

Com a chave em `.env`, worktree limpa e autorização para um teto de US$ 250:

```bash
node -r dotenv/config scripts/experimento-orientador-v08.mjs \
  --executar \
  --budget-usd 250 \
  --out resultados/experimento-orientador-v08
```

Retomada idempotente após interrupção normal:

```bash
node -r dotenv/config scripts/experimento-orientador-v08.mjs \
  --executar \
  --retomar \
  --budget-usd 250 \
  --out resultados/experimento-orientador-v08
```

Se a retomada apontar recibo órfão, primeiro inspecione o JSONL citado. Repetir
a chamada pode gerar nova cobrança e, por isso, exige uma autorização adicional
e explícita:

```bash
node -r dotenv/config scripts/experimento-orientador-v08.mjs \
  --executar \
  --retomar \
  --autorizar-repetir-chamadas-orfas \
  --budget-usd 250 \
  --out resultados/experimento-orientador-v08
```

## Estrutura de saída

```text
resultados/experimento-orientador-v08/
├── manifesto-plano-v08.json
├── checkpoint.json
├── _budget/budget.json
└── cells/
    └── <corpus>/<modelo>/<politica>/chunk-NN/
        ├── bruto/
        │   ├── collection-plan.json
        │   ├── manifests/*.jsonl
        │   └── runs/*.json
        └── materializado/
            ├── materialization-plan.json
            ├── manifests/*.jsonl
            └── runs/*.json
```

O `checkpoint.json` é operacional e contém horários. O manifesto do plano é o
artefato determinístico usado para verificar identidade da campanha.
