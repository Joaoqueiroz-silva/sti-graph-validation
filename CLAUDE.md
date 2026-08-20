# Continuação obrigatória — estudo e artigo v0.8

Este arquivo é o handoff operacional para o Claude Code. Não reinicie a
investigação e não trate o estado atual como produto final. Continue na branch
`codex/orientacoes-orientador-v0.8`, preserve os dados históricos e complete as
etapas abaixo na ordem indicada.

## Objetivo do usuário

Concluir o estudo, o artigo e o repositório de modo cientificamente defensável,
reprodutível e compreensível por professores de qualquer área. O artigo deve
responder explicitamente às cinco perguntas do orientador, explicar os
resultados em linguagem comum e usar figuras, fluxogramas, exemplos e tabelas
legíveis. O usuário não dispõe de avaliadores humanos; portanto, toda avaliação
por modelos deve ser denominada **evidência automatizada exploratória**, nunca
validação pedagógica ou substituição de professores/alunos.

Não prometa estudo “irrefutável”. A meta correta é produzir a evidência mais
robusta, auditável e honesta permitida pelo desenho. Não omita ameaças à
validade para tornar a narrativa mais favorável.

## Regras de segurança e autorização

1. **Não faça nenhuma chamada paga, coleta OpenRouter ou execução com
   `--executar` sem nova autorização expressa do usuário para o teto monetário.**
2. Nenhuma chamada paga foi feita na preparação atual.
3. Nunca sobrescreva, regenere ou edite os 630 runs históricos depositados.
4. Não use `--allow-dirty` na coleta final. Congele código, protocolo, dados e
   hashes em commit público antes da primeira chamada.
5. Não repita chamada órfã sem autorização específica do usuário.
6. Não faça merge em `main`, release, reescrita de histórico, exclusão em massa
   ou mudança do repositório para privado sem confirmação explícita.
7. Código original: MIT. Holdout original: CC0-1.0. Materiais CMU/CTAT não
   recebem MIT ou CC0 e não podem ser declarados abertos sem permissão escrita.

## Estado verificado no handoff

- Branch: `codex/orientacoes-orientador-v0.8`.
- Último commit público anterior a este checkpoint: `6371b01`.
- Em 20/08/2026, antes deste handoff: `npm test` passou com **62 arquivos e
  650/650 testes**; `git diff --check` passou.
- `npm run results:verify`, `links:check`, `artifacts:check` e
  `license:verify` passaram após a regeneração dos dez controles derivados.
- `npm run mirror:verify` ainda falha nos três arquivos listados na seção de
  bloqueadores; por isso este checkpoint é deliberadamente WIP e não deve ser
  confundido com release pronto.
- Nenhuma chamada de rede/paga foi feita pelos novos comandos.
- A campanha histórica contém 105 problemas, 2 braços e 3 réplicas: 630 runs.
- A prova offline separa 105 BRDs de referência e 630 grafos gerados finais.
- O painel atual é somente planejador offline; ainda não há runner pago.
- O holdout foi materializado, mas ainda contém duas referências de erro
  inválidas descritas abaixo. Não o congele nem colete antes de corrigi-las.

## O que já está implementado

### Reanálise histórica

Em `analysis/orientador-v08/`:

- três LCS independentes e 1:1, com desempate lexicográfico:
  `valueOnly`, `operational` (componente+valor) e `sai`
  (componente+família de ação+valor);
- métricas coerentes de precisão, revocação e F1 usando o mesmo matching;
- inventário de extras por ocorrência;
- auditoria do teto de passos;
- comparação bruto versus materializado;
- estabilidade de réplicas, ICC, k=1/2/3 e leave-one-replica-out;
- consolidado dos 630 registros.

Resultados exploratórios que devem ser preservados e explicados sem misturar
macro e micro:

- métrica histórica value-only macro: precisão geral 0,5901
  [0,5768; 0,6038] e F1 0,6198 [0,6088; 0,6307];
- F1 value-only por braço: Flash-Lite 0,6303 [0,6148; 0,6456] e Qwen
  0,6093 [0,5960; 0,6229];
- micro sobre átomos: value-only M=2.329, R=0,4810, P=0,5211, F1=0,5003;
  operacional M=1.437, R=0,2968, P=0,3215, F1=0,3087; SAI M=698,
  R=0,1442, P=0,1562, F1=0,1499;
- família de ação resolvida em 940/4.469 átomos; entre os resolvíveis, precisão
  SAI 0,7426.

### Execução desacoplada

`analysis/orientador-v08/executar-tutoria-desacoplada.mjs` e
`executor-grafo-gerado.mjs` instalam um tripwire antes dos imports e auditam:

- 105 referências CTAT sob a semântica representada no schema neutro v2;
- 630 `materializado.behaviorGraph` finais sob a semântica declarada;
- zero rede e zero LLM;
- 4.469 steps em backbones concluídos;
- 17.876 dicas, 6.021 misconceptions e 6.021 rotas de remediação exercidas;
- determinismo em 6.300 execuções dos grafos gerados.

Não chamar esses artefatos de “implantáveis” sem qualificação. As políticas
`skip_if_mastered` e `struggles` são inventariadas, mas não executadas.

### Entrada estrita e pipeline

`input-policy.js` e as alterações no pipeline implementam
`somente-enunciado-v1`, sanitização recursiva, auditoria de entrada/saída,
rejeição de placeholders e preservação estruturada de `action`,
`interactionFamily` e `targetRole`.

O pipeline também ganhou checkpoint, retomada, saída atômica, modelo pinado,
budget global e recusa de diretórios incompatíveis. Audite novamente antes de
usar dinheiro.

### Protocolos

- `docs/PROTOCOLO-REANALISE-ORIENTADOR-V0.8-2026-08-20.md`
- `docs/EMENDA-V0.8-01-ANCORAGEM-E-COLETA-2026-08-20.md`
- `docs/EMENDA-V0.8-02-HOLDOUT-CLEANROOM-2026-08-20.md`
- `docs/EXPERIMENTO-ORIENTADOR-V08.md`
- `docs/PROTOCOLO-PAINEL-AUTOMATIZADO-V08.md`

### Holdout original

`datasets/holdout-cleanroom-v08/` contém 50 problemas originais, cinco
famílias × dez, gerados deterministicamente por
`scripts/gerar-holdout-cleanroom-v08.mjs`, com envelopes A/B separados,
referência SAI, manifest e data card. Os dados são CC0-1.0; o gerador é MIT.

O desfecho primário confirmatório deve agregar dez réplicas dentro de modelo e
depois os três modelos dentro de cada problema. Unidade inferencial primária:
**problema, n=50**, não problema×modelo n=150. Teste de inversão de sinal no
nível problema, 100.000 permutações, seed 8042026; bootstrap de cluster sobre
50 problemas, 10.000 reamostragens, seed 8042027.

### Painel automatizado

`analysis/orientador-v08/painel-automatizado.mjs` implementa:

- 33 estratos planejados: 30 CTAT exploratórios + 3 clean-room;
- até 528 itens de estudo + 60 controles;
- cegamento, cotas por subtipo e no máximo um item por run-cluster/subtipo;
- três famílias de juiz, rubricas fechadas, controles 99%/80%/80%;
- alfa nominal de Krippendorff e regra fail-closed;
- estimativa US$10,58; reserva US$52,92; teto sugerido US$60.

## Bloqueadores que devem ser corrigidos primeiro

### 1. Duas referências inválidas no holdout

Atualmente o `wrongValue` é igual ao valor correto em:

- `porcentagem-09`, `s1-valor_da_reducao`: 40;
- `porcentagem-10`, `s1-valor_da_reducao`: 25.

A causa é preço igual a R$100, fazendo “confundir percentual com valor” gerar o
próprio resultado correto. Corrija **no gerador**, não nos JSONs derivados, e
regenere todos os arquivos/hashes. Elimine também por construção a colisão
potencial em proporcionalidade quando `baseGroups=2` e `scale=2`.

Adicione testes exaustivos dos 50 problemas e propriedades sobre múltiplas
seeds:

- toda matemática e resposta final corretas;
- MDC real na família de frações;
- `wrongValue !== value` no mesmo estado;
- IDs únicos; valores, feedbacks e dicas não vazios;
- envelopes A contendo apenas `id` e `problem`;
- nenhuma frase extensa copiada dos corpora CTAT presentes no repositório;
- `node scripts/gerar-holdout-cleanroom-v08.mjs --check` byte a byte.

### 2. Política de raciocínio incompleta no orquestrador principal

`reasoning-policy.js` já congela a política correta por modelo:

- Gemini 3.1 Flash-Lite: `minimal+exclude`;
- Qwen3 Max: omitir o campo `reasoning`;
- Gemini 3.5 Flash: `minimal+exclude` — `none` é rejeitado porque reasoning é
  obrigatório;
- GPT-5.6 Luna: `none+exclude`.

O orquestrador principal `scripts/experimento-orientador-v08.mjs` ainda contém
trechos antigos com `STI_SEM_RACIOCINIO=1` e plano `effort:none` global.
Substitua-os pela política por célula/modelo. `cleanChildEnv` deve remover e
reinserir `STI_REASONING_EFFORT`/`STI_REASONING_EXCLUDE`. Registre a política no
plano, checkpoint, manifests e resultados. Atualize testes e documentação.

Fontes oficiais verificadas em 20/08/2026:

- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- https://openrouter.ai/api/v1/models

### 3. Orquestração combinada inexistente

`scripts/experimento-holdout-cleanroom-v08.mjs --plano` funciona, mas imprime
um comando para `scripts/experimento-completo-v08.mjs`, que ainda não existe.
Implemente o orquestrador combinado ou corrija o comando/documentação para dois
orquestradores que compartilhem comprovadamente o mesmo ledger e teto global.
O padrão deve continuar sendo dry-run, zero rede.

### 4. Runner do painel ainda inexistente

`scripts/painel-automatizado-v08.mjs` recusa `--executar`. Falta:

- construtor offline do frame a partir dos resultados prospectivos;
- plano byte a byte e ordens cegas por juiz;
- executor pago separado, liberado somente por flags explícitas;
- preflight de credencial, saldo, disponibilidade e preço dos três modelos;
- JSON Schema/saída estruturada, retry somente no mesmo modelo;
- checkpoint item a item, escrita atômica, lock, intent/recibo e budget
  fail-closed;
- consolidação offline, gates e relatório por trilha CTAT/clean-room.

Congele Claude Sonnet 5 em `low+exclude`; Mistral Large 2512 e Llama 4 Maverick
devem omitir reasoning. Não use o default `high` do Claude.

### 5. Durabilidade antes da chamada

O manifesto atual é gravado depois da resposta. Acrescente um journal/marker de
intenção durável **antes** de cada chamada paga. Se houver intent sem run final,
a retomada deve bloquear. Isso cobre a queda entre a resposta remota e o recibo
local. Não conte markers como custos no JSONL do ledger.

### 6. Estatística confirmatória e artefatos finais ainda não existem

Depois da coleta, implemente/regere:

- pontuação bruto/final nas três réguas;
- análise ITT: run definitivamente ausente recebe F1 SAI=0 e é também contado
  separadamente como falha;
- teste/IC primários pré-especificados no nível problema n=50;
- desfechos secundários com Holm nas três comparações de modelos;
- inventário de erros, dicas e extras;
- execução offline dos novos grafos;
- painel exploratório e concordância, somente se os gates passarem.

### 7. Três arquivos do espelho de produção foram alterados diretamente

`npm run mirror:verify` reprova atualmente:

- `producao/agents/graphforge.js`;
- `producao/agents/nodes/agent7-adapter.js`;
- `producao/agents/nodes/agents3-students.js`.

Essas mudanças preservam `action`, `interactionFamily`, `targetRole` e o prompt
estrito, mas o diretório `producao/` é declarado como espelho byte a byte do
commit em `producao/COMMIT-FONTE.txt`. Não atualize apenas os hashes para
silenciar o gate. Resolva de uma destas formas auditáveis:

1. aplicar a alteração no repositório-fonte de produção, criar commit e rodar o
   espelhador com `--write --fonte <repo>`; ou
2. restaurar o espelho original e implementar a extensão em adaptadores locais
   explicitamente versionados, mantendo equivalência e testes.

Registre no artigo qual caminho foi adotado. O gate deve voltar a 85/85 antes
da coleta.

## Orçamento — autorização ainda ausente

- Experimento principal esperado: US$216,40.
- Holdout esperado: US$51,52.
- Painel esperado: US$10,58.
- Total esperado: aproximadamente **US$278,50**.
- Teto da geração/materialização: US$310.
- Teto separado do painel: US$60.
- Exposição máxima combinada a pedir ao usuário: **US$370**.

Antes de qualquer execução, mostre esses valores ao usuário e pergunte
explicitamente se ele autoriza o teto de US$370. Uma resposta genérica como
“continue” não substitui autorização monetária específica.

## Artigo e visuais

Base revisada local, relativa a este clone de trabalho:

`../../../outputs/artigo1-aits-v0.7-revisado.docx`

O DOCX original foi fornecido pelo usuário fora do repositório. Se a base
revisada acima não estiver disponível no ambiente atual, peça ao usuário para
anexar novamente o DOCX; não tente reconstruí-lo a partir do PDF.

Especificação narrativa e visuais preliminares:

- `../../article-v08/MANUSCRIPT-SPEC.md`
- `../../article-v08/figures/`
- `../../article-v08/generate_figures.py`

Após os resultados:

1. Regenerar figuras com resultados prospectivos e mapa de extras.
2. Usar uma interface original clean-room; não publicar screenshot CTAT sem
   autorização escrita.
3. Reescrever o manuscrito em linguagem interdisciplinar. Definir CTAT, BRD,
   estado, SAI, braço, réplica, LCS, bootstrap e ICC na primeira ocorrência.
4. Dar exemplo numérico depois de cada fórmula e interpretação em linguagem
   comum depois de toda tabela.
5. Resumo e abstract com 200–300 palavras cada.
6. Não usar “grafo equivalente”, “caminho exato”, “acaso”, “empate” ou efeito
   causal sem teste/desenho correspondente.
7. Responder nominalmente às cinco perguntas do orientador.
8. Separar autoria, compilação, avaliação e execução sem LLM.
9. Entregar DOCX e PDF com páginas, captions estáveis, texto alternativo e
   figuras legíveis em impressão.
10. Renderizar e inspecionar todas as páginas antes da entrega.

## Licença e publicação

As fontes oficiais já consultadas indicam que os BRDs/Mathtutor não têm licença
aberta de redistribuição. O repositório público atual ainda contém materiais e
derivados de terceiros. `docs/PEDIDO-AUTORIZACAO-CMU.md` contém pedido bilíngue.

Antes de release/DOI:

- manter MIT somente no código original;
- manter CC0 somente no holdout original;
- não declarar os dados CMU como abertos;
- preferir release público clean-room contendo código, hashes, importadores e
  agregados não reconstrutivos;
- qualquer remoção do histórico público exige plano, backup e autorização
  explícita do usuário.

## Gates antes de commit final, coleta e publicação

Rode, nessa ordem:

```bash
npm test
npm run links:check
npm run results:verify
npm run mirror:verify
npm run artifacts:check
npm run license:verify
git diff --check
```

Após mudar artigo/PDF ou qualquer arquivo coberto:

```bash
npm run manifest:write
npm run manifest:verify
npm run verify:offline
```

Antes da primeira chamada, faça commit e push do protocolo/código/dataset
corrigido e registre SHA/tag imutável. Depois da análise e do artigo, crie nova
tag/release; não mova silenciosamente `banca-2026-08-19`, pois ela aponta para
um snapshot antigo que nem contém o artigo v0.5.
