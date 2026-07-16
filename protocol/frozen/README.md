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

## Relação com a versão atual

Este congelamento serve somente para reproduzir e auditar o legado. Decisões posteriores ficam nas
emendas datadas e nos manifestos da versão atual, sem sobrescrever o estado histórico. O manifesto
`MANIFEST-v6.0.sha256` permanece ligado ao relatório técnico histórico, enquanto
`MANIFEST-v6.1.sha256` cobre a versão científica vigente. O manuscrito v6.1 trata as Campanhas 1–3
como históricas e a Campanha 4 como avaliação principal; nenhuma
estimativa é combinada entre campanhas.
