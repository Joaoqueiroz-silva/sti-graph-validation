# Congelamento G0 (2026-07-12)

A tag `legacy-campaigns-2026-07` marca o estado exato do repositório no momento em que
as campanhas 1 (2026-07-02) e 2 (2026-07-08) foram reportadas na versão 2.1 do relatório.

O arquivo `hashes-legacy-2026-07-12.sha256` registra o SHA-256 de todos os 219 artefatos
daquele estado: corpus (.brd e interface), envelopes materializados, resultados brutos das
campanhas, pacote de anotação humana, scripts e documentos.

Regra deste diretório: nada aqui é editado depois de criado. Toda decisão metodológica
posterior ao congelamento entra em `protocol/deviations/` com data, motivo e efeito,
sem sobrescrever histórico.

Verificação: `sha256sum -c protocol/frozen/hashes-legacy-2026-07-12.sha256` a partir da
raiz do repositório, com a tag `legacy-campaigns-2026-07` em checkout.
