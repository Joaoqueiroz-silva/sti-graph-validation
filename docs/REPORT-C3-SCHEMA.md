# Esquema dos relatórios da Campanha 3

## Versões e compatibilidade

- `c3-v1` é o formato histórico da campanha executada em 2026-07-13. Os arquivos
  publicados nessa versão permanecem imutáveis.
- `c3-v2` é uma extensão aditiva para campanhas futuras. Todos os campos usados por
  consumidores de `c3-v1` permanecem no mesmo lugar e com a mesma semântica.
- `schemaCompatibleWith: ["c3-v1"]` declara essa compatibilidade no relatório. Leitores
  antigos podem ignorar `retentionPolicy` e `cases[].audit`.

O aumento de versão não reclassifica nem altera resultados históricos. Uma campanha
nova deve produzir novos arquivos; não se deve sobrescrever um relatório `c3-v1`.

## Artefatos retidos em `c3-v2`

Cada caso cuja autoria foi concluída recebe `audit.schemaVersion = "c3-audit-v1"` e:

| Campo | Conteúdo |
| --- | --- |
| `audit.robot.graph` | Grafo EducaOFF completo produzido pelo montador |
| `audit.robot.neutral` | Representação neutra v1 completa do grafo gerado |
| `audit.robot.traces` | Saídas estruturadas entregues pelos agentes ao montador |
| `audit.robot.neutralV2` | Grafo gerado convertido para o esquema comportamental v2 |
| `audit.reference.neutralV2` | Grafo CTAT de referência convertido para o mesmo esquema v2 |
| `audit.traceConformance` | Resultado completo, inclusive `items[]` com vereditos passo a passo |
| `audit.intrinsic` | Relatório completo do verificador, com `hard`, `soft` e contagens |
| `audit.hashes` | SHA-256 do JSON compacto de cada artefato retido |

Os campos resumidos de `cases[]` continuam presentes para manter os leitores e scripts
de análise existentes. O bloco de auditoria é a fonte para recomputar, conferir ou
aplicar uma política alternativa de correspondência sem repetir a autoria por LLM.

Se a autoria falhar antes de produzir `robot`, `audit` é `null` e a falha permanece
registrada em `status`/`error`. Se uma etapa posterior falhar, os artefatos produzidos
antes dela permanecem no bloco, e os campos ainda indisponíveis ficam `null`.

## Política de privacidade e retenção

O relatório retém somente estruturas de saída necessárias à auditoria. Ele não retém:

- prompts de sistema ou de usuário;
- chaves de API, credenciais ou cabeçalhos do provedor;
- texto bruto devolvido pelo provedor.

`manifestRunId` continua ligando o relatório ao manifesto JSONL, que conserva hashes
de prompt e envelope, modelo, temperatura, tokens, custo, latência e estado da chamada,
sem gravar prompts ou segredos.

### Limitação do texto bruto

Os simuladores atuais analisam a resposta do provedor e devolvem a
`authorFromEnvelopeA` apenas `traces` estruturados. O objeto `robot` nunca recebe o
texto bruto original; portanto, o runner não pode armazená-lo nem recuperá-lo depois.
O formato `c3-v2` permite auditar integralmente a transformação a partir dos traces
estruturados, mas não erros de parsing que dependam do texto original. Reter esse texto
no futuro exigiria uma alteração separada na camada de chamada, com revisão explícita
de privacidade e segurança; não deve ser habilitado implicitamente pelo runner.

## Verificação dos hashes

Cada hash é calculado como SHA-256 de `JSON.stringify(artefato)` sobre o snapshot que
foi efetivamente incluído no relatório. Os hashes servem para detectar alterações dos
artefatos retidos; os hashes de prompt e de envelope permanecem no manifesto e no campo
`envelopeSha256`.
