# Congelamento da implantação auditada (2026-07-15)

Este diretório registra a identidade observada, em auditoria somente leitura, do
subsistema legado de autoria comportamental implantado na EducaOFF.

`production-image-manifest.json` contém o digest da imagem, o hash da
configuração do Compose, os hashes dos agentes 3, do cliente LLM, do GraphForge
e do catálogo, além das configurações efetivas dos três agentes.

O commit indicado no manifesto é um candidato fortemente corroborado, não uma
identificação absoluta: a imagem não possui label VCS. O digest da imagem e os
hashes dos arquivos são as âncoras normativas para a Campanha 4.

Este congelamento não contém credenciais, dados de usuários nem estados reais de
autoria. Os preflights e atestados de lançamento registram os hashes dos prompts
efetivos antes das respectivas chamadas.

As entradas CTAT compatíveis com o contrato de produção ficam em
`production-fidelity/fixtures/`. O manifesto correspondente documenta seis
estados de quatro seeds, cobre 24 exercícios e registra que sua construção não
fez chamadas de rede nem consultou os BRDs de referência.

## Como ler a cronologia

- `campaign4-metrics-v2-manifest.json` antecede a primeira chamada real;
- o piloto de nove chamadas foi retido no resultado final;
- `campaign4-full-execution-plan.json` foi fechado depois desse piloto e antes
  das 45 chamadas adicionais;
- seus campos `pending` não foram reescritos depois da execução;
- o estado observado final está em
  `resultados/campanha4-2026-07-15/campaign4-completion-manifest-v1.json`;
- emendas pós-resultado e pós-auditoria são identificadas nominalmente e não
  transformadas em decisões prospectivas.

Logo, a Campanha 4 é exploratória e auditável, não um pré-registro integral
concluído antes de toda coleta.

## Erratas e auditoria da ontologia

A errata v2.1 altera somente quatro taxas descritivas de preservação por campo do
agente 3a. Os snapshots exatos v2 permanecem em
`protocol/archive/metrics-v2/`, com os hashes originais.

A atestação inicial da ontologia listou três KCs, mas as fixtures usam quatro.
`ontology-fixture-kc-attestation-v2.json` e a emenda KC4 documentam que o quarto
KC retorna listas vazias na implantação; o cliente congelado convertia a resposta
404 do stub histórico para as mesmas listas vazias. O teste de cobertura impede
nova omissão. Nenhuma saída LLM ou métrica foi alterada por essa correção.

## Publicação e privacidade

Os brutos públicos removem somente metadados da conta OpenRouter. Alguns hashes
em atestados históricos continuam, corretamente, apontando para os originais
privados. `protocol/publication-redactions-v6.0.json` liga cada hash privado ao
hash público redigido. Não modifique os manifestos congelados para fazê-los
apontar retrospectivamente às cópias públicas.

## Limite de reprodutibilidade

O digest local e os hashes de arquivos identificam a imagem executada, mas a
imagem OCI não está publicada. Portanto, terceiros podem recalcular as análises
offline, mas ainda não podem repetir de forma byte-equivalente toda a coleta. Os
lançadores originais com caminhos pessoais permanecem históricos e não portáveis;
veja `scripts/HISTORICAL-LAUNCHERS.md`.
