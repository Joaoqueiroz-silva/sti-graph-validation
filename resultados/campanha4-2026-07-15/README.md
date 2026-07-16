# Mapa dos resultados da Campanha 4

A Campanha 4 é o experimento principal da versão 6.0. Este diretório separa
fontes analíticas retidas, derivados canônicos e lançamentos técnicos excluídos.

## Fontes da geração

Os seis diretórios abaixo representam duas metades de batch em três réplicas:

- `pilot-real-batches-01-03-r1/`;
- `full-real-r1-batches-04-06/`;
- `full-real-r2-batches-01-03/`;
- `full-real-r2-batches-04-06/`;
- `full-real-r3-batches-01-03/`;
- `full-real-r3-batches-04-06/`.

Em cada pasta, `campaign4-real-pilot.json` é a cópia pública redigida da execução
e `campaign4-real-pilot-metrics-v2.json` contém a análise determinística v2.1.
Os campos de conta removidos não são dados científicos; a relação entre hashes
privados e públicos está em `protocol/publication-redactions-v6.0.json`.

O quinto grupo falhou no terceiro estado e foi preservado sem retry. Por isso o
conjunto contém 17/18 estados completos, 53/54 chamadas planejadas e 68/72
unidades exercício–réplica observadas por agente.

## Derivados canônicos

- `campaign4-final-analysis-v2.1.json`: estimandos principais, transporte,
  GraphForge, falha e custos de geração;
- `campaign4-batch-cluster-sensitivity-v1.json`: sensibilidade pós-hoc com seis
  clusters de chamada;
- `campaign4-completion-manifest-v1.json`: conclusão observada, separada do plano
  prospectivo congelado.

## Painel auxiliar

- `judge-panel-v5/`: única rodada analítica incluída no artigo;
- `judge-panel-v1/`, `judge-panel-v2/` e `judge-panel-v4/`: lançamentos técnicos
  excluídos por inteiro. Seus escores nunca foram misturados ao painel v5.

O arquivo v5.1 corrige apenas a representação de alfa/kappa quando existe uma
única categoria observada: nesses casos o coeficiente passa a `null`/não
estimável. Notas, contagens e concordância bruta permanecem inalteradas.

## Recalcular

```bash
bash scripts/replay-campaign4-analysis.sh
```

O comando é offline. Não execute os lançadores históricos de coleta para
verificar o artigo. Consulte `docs/REPRODUCAO-V6.md` e
`docs/MODELOS-E-CUSTOS.md`.
