# Arquivo histórico das métricas C4 v2

Este diretório preserva, sem substituir os arquivos correntes, a versão exata do
código e do teste que foram congelados antes da primeira chamada real da
Campanha 4. Os hashes abaixo coincidem com
`campaign4-metrics-v2-manifest.json`:

- `production-fidelity/campaign4-metrics-v2.mjs` —
  `4f8ae7d374bb08fe9ac59cedc622fde92f40379f635b47a05fc69d9044dfd6fa`;
- `__tests__/campaign4-metrics-v2.test.mjs` —
  `eb9be4ff5f651b858e6b6d0038796bf930e67bab849132ad4af139803340b335`.

O arquivo `pilot-metrics-v2.1-original-source.json` é a cópia byte a byte do
derivado do piloto depois da errata v2.1 e antes da redação do depósito público;
seu hash é `392f7e14b97114ffecfc20c1f1c3403656706bce201699b806a78d95a4d306ce`.

O derivado v2 original cujo hash era
`35dee4…` foi sobrescrito durante a execução histórica e não foi recuperado byte
a byte. Não se afirma o contrário: os números podem ser recalculados a partir
das fontes, mas o timestamp original perdido impede reconstrução binária exata.

Os arquivos correntes no topo do repositório implementam a errata v2.1. Este
arquivo existe para permitir auditoria da sequência v2 → v2.1, não para orientar
novas análises.
