# Reprodução e auditoria da versão 6.0

Este depósito oferece dois níveis distintos de verificabilidade.

1. **Reanálise offline:** recalcula métricas, sensibilidades, tabelas e checksums
   a partir das saídas retidas. Não usa rede, chave ou API e não gera custo.
2. **Nova coleta:** volta a chamar modelos remotos. Isso não é necessário para
   conferir o artigo e ainda não é uma replicação externa exata, pois a imagem
   OCI de produção não está publicada e os identificadores comerciais dos
   modelos não congelam os pesos remotos.

## Verificação recomendada

Requisitos: Git e Node.js 20.19 ou posterior. A integração contínua usa Node.js 22.12.

```bash
git clone https://github.com/Joaoqueiroz-silva/sti-graph-validation.git
cd sti-graph-validation
npm ci
npm run verify:offline
```

O gate executa testes, valida os derivados C1–C4, confronta o LaTeX v6 com os
JSONs canônicos, verifica links, privacidade e o manifesto SHA-256. Nenhuma
variável de credencial é necessária.

Para apenas inspecionar os modelos configurados na bancada histórica:

```bash
npm run models
```

Esse comando é offline. `npm run models:ping`, diferentemente, autoriza chamadas
diagnósticas pagas e não faz parte da reprodução.

## Recalcular a Campanha 4

O wrapper abaixo usa apenas arquivos locais:

```bash
bash scripts/replay-campaign4-analysis.sh
```

Ele:

1. recalcula as métricas v2.1 dos seis grupos a partir dos brutos públicos
   redigidos;
2. recompõe a análise principal e a sensibilidade por batch;
3. reaplica a correção de coeficientes degenerados do painel;
4. materializa um manifesto final separado do plano prospectivo;
5. valida as afirmações centrais do artigo.

Os timestamps derivados vêm das próprias fontes, de modo que uma segunda rodada
produz os mesmos bytes. Os geradores científicos ignoram `SOURCE_DATE_EPOCH` do
ambiente para que essa variável externa não altere os derivados canônicos.

## Ordem e cronologia

- métricas v2 foram congeladas antes da primeira chamada real;
- nove chamadas de um piloto foram incorporadas à amostra;
- o plano das 45 chamadas restantes foi formalizado depois desse piloto, antes
  da primeira chamada adicional;
- uma falha de parse foi mantida como ausência/zero, sem nova tentativa;
- quatro taxas descritivas do transporte 3a foram corrigidas pós-resultado na
  errata v2.1;
- uma auditoria pós-hoc encontrou que o gate inicial cobria somente três dos
  quatro KCs. A [emenda do quarto KC](../protocol/production-freeze-2026-07-15/AMENDMENT-C4-ONTOLOGY-KC4-POST-AUDIT-2026-07-15.md)
  e a [atestação v2](../protocol/production-freeze-2026-07-15/ontology-fixture-kc-attestation-v2.json)
  registram a equivalência operacional observada entre `404 → []` no snapshot
  e `200 + []` no bridge implantado;
- a sensibilidade por batch e a correção de concordância v5.1 são pós-hoc.

Assim, C4 é um estudo exploratório auditável; não é descrita como pré-registro
integral anterior a toda coleta. O plano original não foi reescrito como
“concluído”; `campaign4-completion-manifest-v1.json` registra o estado observado
em arquivo separado.

A atestação ontológica v2 tem SHA-256
`00dc41394488d56299a23e39fa14dccdd9dbfc369aab372b0651d80ef3f19394`.
Ela é uma atestação operacional produzida pelo pesquisador depois da coleta, não
uma verificação externamente reproduzível: as respostas HTTP brutas da consulta
ao bridge não foram preservadas. A evidência permite documentar que nenhum
enriquecimento diferente foi observado, mas não transforma o gate original em
uma verificação prospectiva completa.

O código e os testes das métricas v2 foram recuperados com os hashes exatos do
congelamento: `4f8ae7d374bb08fe9ac59cedc622fde92f40379f635b47a05fc69d9044dfd6fa`
e `eb9be4ff5f651b858e6b6d0038796bf930e67bab849132ad4af139803340b335`,
respectivamente. O JSON piloto v2 original, de hash iniciado por `35dee4`, foi
sobrescrito e não foi recuperado byte a byte; o timestamp original se perdeu.
Os valores científicos continuam recomputáveis com o código arquivado, e a
versão pública v2.1 preservada não deve ser apresentada como o arquivo v2
original.

## Redação dos artefatos públicos

Os resultados brutos públicos removem saldo, uso acumulado, rótulos e sufixos de
credencial da conta OpenRouter. Tokens, custos por chamada, modelos, falhas,
latências e saídas científicas foram preservados. A ponte entre cada hash privado
original e seu hash público consta em
`protocol/publication-redactions-v6.0.json`. Os originais não devem ser enviados
ao GitHub.

O `privacy:check` inspeciona a árvore publicável atual, não o histórico Git. O
mapeamento humano removido do `HEAD` continua recuperável no histórico e em
`origin/main`; portanto, o cegamento e a confidencialidade desse pacote somente
poderiam ser restaurados por reescrita/purge do histórico combinada com rotação
dos IDs. Nenhum purge foi executado nesta auditoria.

## Limites da reprodução integral

O manifesto de produção ancora a imagem por digest local e hashes de arquivos,
mas o repositório não inclui a imagem OCI nem um snapshot fonte verificavelmente
reconstruível. Os cinco lançadores de coleta preservados em `scripts/` dependem
de caminhos pessoais e do alias SSH `minha-vps`; permanecem byte a byte porque
seus hashes constam dos freezes e estão marcados como históricos em
`scripts/HISTORICAL-LAUNCHERS.md`.

Uma nova coleta defensável deve criar um protocolo e um freeze novos, publicar a
imagem/snapshot quando juridicamente possível, registrar preços e versões atuais
e exigir autorização financeira explícita. Ela nunca deve sobrescrever a C4.

## Corpus e licença

A integridade dos BRDs é verificável por hash, mas autoria, instituição e licença
de redistribuição seguem pendentes. MIT cobre o código original, não concede
automaticamente licença sobre o corpus. Veja `DATA-LICENSE.md` antes de criar
release pública ou depósito em OSF/Zenodo.
