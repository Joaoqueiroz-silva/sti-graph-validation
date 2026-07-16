# Emenda pós-auditoria C4 — cobertura do quarto KC

**Momento:** após todas as chamadas de geração e julgamento da Campanha 4, durante a auditoria de correspondência entre artigo e depósito.

## Defeito encontrado

As fixtures contêm quatro identificadores distintos de KC. Três aparecem nos 24 exercícios e `kc_fracao_impropria_reta` aparece adicionalmente nos 12 exercícios de fração imprópria. A atestação v1 e o snapshot local enumeravam somente os três KCs comuns.

Consequentemente, durante a execução, o snapshot local retornou HTTP 404 para os três endpoints do quarto KC. O gate original não cobria metade do corpus quanto a esse identificador.

## Verificação complementar

Em consulta somente leitura à implantação, realizada em 15 de julho de 2026 às 18:51:35Z, os endpoints de pré-requisitos, relacionamentos e misconceptions de `kc_fracao_impropria_reta` retornaram HTTP 200 e vetores vazios.

O cliente de ontologia congelado na imagem trata respostas não-2xx como `null`; as três funções consumidas pelo GraphForge convertem qualquer resposta que não seja vetor em `[]`. Portanto:

- execução com snapshot local: HTTP 404 → `null` → `[]`;
- implantação auditada: HTTP 200 + `[]` → `[]`;
- enriquecimento efetivo recebido pelo GraphForge: idêntico e vazio.

Hashes de apoio:

- GraphForge de produção: `dbe769fdf0066dd3bb76370f99d1fe1c24b84c8277eef72d4376e2454a196f51`;
- cliente de ontologia de produção: `0b0306e01bf0f1dc1879207f1386e781cd1c53adb956e430f7763ce67053d79d`;
- snapshot local executado: `2a19138e1d86e7b57c60b03eb7f99fdcc9658ca018993e106e765274492b3172`.

## Efeito analítico

Nenhum grafo, saída de agente, contagem ou estimando é alterado. A correção é de cobertura do gate e de redação: o artigo passa a declarar quatro KCs distintos, com três ou quatro KCs por exercício, e identifica a verificação como pós-hoc.

O arquivo v1 e seus hashes permanecem inalterados para preservar a cronologia. A evidência complementar está em `ontology-fixture-kc-attestation-v2.json`.
