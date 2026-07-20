# Congelamento legado G0 (2026-07-12)

A tag anotada `legacy-campaigns-2026-07` aponta para o commit
`84601b3dd719aa1dc05908e55b03a595ee838e35`, estado histórico das Campanhas 1 e 2
considerado na versão 2.1 do relatório. Não mova nem recrie essa tag.

O arquivo [`hashes-legacy-2026-07-12.sha256`](hashes-legacy-2026-07-12.sha256) contém
o SHA-256 de 219 artefatos daquele estado: corpus e interface, envelopes materializados,
resultados brutos, pacote de anotação, scripts e documentos.

## Por que o manifesto não aparece dentro da tag

O manifesto foi acrescentado ao repositório **depois** do commit marcado e, por isso, não existe
dentro da árvore da tag. Ele descreve a tag, mas não faz parte dela. A antiga instrução de executar
o manifesto “com a tag em checkout” sem primeiro obtê-lo da branch atual era incompleta.

Essa separação não exige mover a tag: leia o manifesto da branch atual e verifique seus hashes em
um checkout descartável da tag.

## Verificação sem alterar o checkout atual

A partir de um clone limpo:

```bash
git fetch origin main --tags

manifest_file="$(mktemp)"
legacy_parent="$(mktemp -d)"
legacy_checkout="$legacy_parent/checkout"

git show origin/main:protocol/frozen/hashes-legacy-2026-07-12.sha256 > "$manifest_file"
git worktree add --detach "$legacy_checkout" legacy-campaigns-2026-07

# macOS
(cd "$legacy_checkout" && shasum -a 256 -c "$manifest_file")

# Linux: use esta linha no lugar da anterior
# (cd "$legacy_checkout" && sha256sum -c "$manifest_file")

git worktree remove "$legacy_checkout"
rm -rf "$legacy_parent"
rm -f "$manifest_file"
```

O comando deve confirmar os 219 caminhos. Uma ausência ou divergência é falha de integridade e
não deve ser corrigida alterando a tag; investigue o clone, o manifesto ou a procedência do
arquivo.

## Manifestos por versão do pacote (v6.0 congelado, v7.0 vivo)

Além do congelamento legado, este diretório guarda os manifestos de integridade POR VERSÃO
do pacote:

- [`MANIFEST-v6.0.sha256`](MANIFEST-v6.0.sha256) descreve o estado consolidado da **v6.0**
  (merge do PR #1). Está **congelado como histórico**: os arquivos evoluíram depois com a
  Campanha 5/v7.0 e regravar este manifesto esconderia a divergência
  (docs/VERSOES.md, regras 1 e 4). `scripts/verify-manifest-v6.mjs` recusa `--write` desde
  2026-07-20; `npm run manifest:v6:verify` contra a árvore ATUAL falha por desenho (a árvore
  não é mais a v6) — para auditar a v6.0, verifique-o contra um checkout descartável do
  commit do merge do PR #1, no mesmo espírito da verificação do legado acima.
- `MANIFEST-v7.0.sha256` é o manifesto **vivo** da versão atual, mantido por
  `npm run manifest:v7:write` (`scripts/verify-manifest-v7.mjs`) e verificado pelo gate
  `manifest:v7:verify` dentro de `npm run verify:offline`. Ele cobre todo arquivo do
  depósito visto pelo git, inclusive os 432 runs brutos da Campanha 5.

## Relação com a versão atual

Este congelamento serve somente para reproduzir e auditar o legado. Decisões posteriores ficam nas
emendas datadas e nos manifestos da versão atual, sem sobrescrever o estado histórico. O manuscrito
v6.0 trata as Campanhas 1–3 como históricas e a Campanha 4 como avaliação principal; nenhuma
estimativa é combinada entre campanhas.
