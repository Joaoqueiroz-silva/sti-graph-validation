# Reprodução e benchmark da versão 7.0

O manuscrito v7.0 relata SOMENTE o experimento final da Campanha 5 (2026-07-19):
a previsão teórica offline e a medição da configuração final do simulador de
alunos contra os envelopes CTAT. Este documento diz como qualquer pesquisador,
apenas com o artigo e este repositório, verifica os números publicados e
reexecuta o experimento como um benchmark.

Há dois níveis, como na v6:

1. **Verificação offline (`reproduce:verify`)**: recomputa tudo o que é
   recomputável a partir do clone. Não usa rede, não usa chave, não custa nada.
   É o nível suficiente para conferir o artigo.
2. **Nova coleta (`reproduce:collect`)**: volta a chamar o modelo remoto na
   configuração final exata (ou pontua um simulador SEU, ver a interface de
   benchmark). Gera custo e exige chave da OpenRouter.

## Pré-requisitos

- Git e Node.js 20.19 ou posterior (a integração contínua usa 22.12).
- `npm ci` no clone (dependências mínimas: dotenv e node-html-parser).
- Chave `OPENROUTER_API_KEY` no `.env` SOMENTE para a coleta paga
  (copie `.env.example`; a verificação offline não usa chave).
- Usuário NÃO privilegiado para `npm test` e `npm run verify:offline`: quatro
  testes de pré-flight simulam montagem somente leitura via permissões de
  arquivo, e root ignora bits de permissão. Como root esses quatro testes são
  pulados com aviso (a suíte ainda passa, mas com cobertura reduzida).
- Os 432 runs brutos da Campanha 5 estão versionados no repositório
  (`resultados/campanha5-2026-07-19/<braço>/runs/`); nenhum download extra é
  necessário. Em compensação, `runs/` fora de `resultados/` continua ignorado
  pelo git (saídas locais regeneráveis).

O ponto de partida é um **clone git do GitHub, branch `main`** (é onde os runs
depositados e os manifestos vivem). Um download de ZIP/tarball sem o diretório
`.git` NÃO serve: os gates de manifesto e de escopo usam `git ls-files`.

```bash
git clone -b main https://github.com/Joaoqueiroz-silva/sti-graph-validation.git
cd sti-graph-validation
npm ci            # ou: npm ci --ignore-scripts (nenhuma dependência precisa de script de instalação)
npm run reproduce:verify
```

## Nível 1: verificação offline (grátis)

`npm run reproduce:verify` roda quatro blocos, imprime um veredito por bloco e
sai com código 0 apenas se todos passarem:

- **A. Agregados de todos os braços.** Recalcula, para cada um dos seis braços
  da Campanha 5, as médias e os IC95% por bootstrap de cluster (exercício como
  unidade, 10.000 reamostragens, seed 42) a partir dos 72 runs brutos
  depositados, e confronta com os `summary.json`.
- **B. Previsão teórica.** Confere os invariantes do artefato preservado
  (`previsao-recheck.json`: back-outs 72/72 com erro 0,000; previsão pontual
  0,609) e REEXECUTA `analysis/previsao-recheck-pos-banimento.mjs`, comparando
  a saída campo a campo com o JSON depositado (69/75 deriváveis estritas, teto
  0,992, previsão 0,607). O arquivo depositado é restaurado ao final.
- **C. Manuscrito v7.** Roda `analysis/validate-article-v7.mjs`: 121 fatos do
  `.tex` conferidos contra os artefatos canônicos, incluindo os hashes SHA-256
  citados no próprio artigo e a proibição de travessões.
- **D. Proveniência do corpus.** Recalcula o SHA-256 de cada `expert.brd` e dos
  arquivos da interface compartilhada e confere com a tabela de
  `PROVENANCE.md`.

Tolerâncias, declaradas e justificadas:

- As seis métricas gravadas POR RUN (`recall`, `conceptual`, `f1`, `precision`,
  `functionalAgreement`, `functionalKappa`) recomputam as médias dos summaries
  exatamente (tolerância 0,0006, que é arredondamento de quatro casas).
- Os limites dos ICs são estimativas de Monte Carlo: outro fluxo de RNG com a
  mesma semente declarada muda os limites em menos de 0,006, e essa é a
  tolerância usada.
- `recallMisconceptionsConceptual` (a métrica primária) NÃO é um campo por run:
  foi derivada no ambiente de coleta e preservada nos `summary.json`, que o
  manuscrito ancora por hash. O verificador reconstrói a série por chaves
  canônicas (cobertura das misconceptions não mecânicas do envelope-b pelos
  runs; `analysis/reproduce-lib.mjs`) e exige que a reconstrução fique entre
  0,000 e 0,008 ABAIXO do valor preservado de cada braço. Na série depositada a
  diferença observada é de 0,003 a 0,006, sempre conservadora (a reconstrução
  nunca infla o resultado). Para o braço final: preservado 0,913, reconstrução
  0,908.

O gate completo do pacote é `npm run verify:offline`: testes, manuscritos v6 E
v7 (`article:validate:v6` e `article:validate:v7`), este `reproduce:verify`
(Campanha 5), derivados de C1 a C4, links, privacidade e o manifesto de hashes
do repositório na versão atual (`manifest:v7:verify`; o manifesto v6 permanece
congelado como histórico, ver `protocol/frozen/README.md`). `npm test` sozinho
já inclui a consistência do artigo v7.

## Nível 2: nova coleta como benchmark (paga)

```bash
npm run reproduce:collect -- --yes                      # 24 problemas x 3 réplicas
npm run reproduce:collect -- --problems 1 --replicas 1 --yes   # smoke de 1 run
```

O que o runner (`scripts/reproduce-collect.mjs`) garante:

- **Configuração final exata.** Autoria CEGA por
  `authorFromEnvelopeA(envelopeA, { renderedFacts })` com o simulador
  `simulate-students.js` resolvido por `resolveEvalStudentConfig`:
  `qwen/qwen3-max`, temperatura 0,7, uma chamada por run, inventário com a
  interface renderizada reconstruída. É o mesmo caminho de código do braço
  final depositado.
- **Sem fallback silencioso de modelo.** O fallback de emergência do cliente é
  fixado no MESMO modelo resolvido (retry, nunca troca), e ao final o manifesto
  de chamadas é auditado: qualquer chamada com modelo diferente derruba a
  coleta com erro claro. Se a chave não suportar o modelo, o erro HTTP com o
  nome do modelo é propagado e a coleta para na primeira falha, antes de
  acumular custo.
- **Custo anunciado antes.** O plano imprime a estimativa com um teto
  conservador de US$ 0,05 por run (a chamada de certificação de 2026-07-20
  usou 1796 tokens de entrada e 2078 de saída, cerca de US$ 0,015; a coleta
  completa de 24 x 3 fica entre US$ 1 e US$ 4) e NADA roda sem `--yes`. A
  trava `STI_BUDGET_USD` continua ativa e o custo real por chamada fica no
  manifesto (`manifests/*.jsonl` dentro da pasta de saída).
- **Saída no formato do depósito.** Cada run vira um JSON flat idêntico ao de
  `resultados/campanha5-2026-07-19/<braço>/runs/`, em um diretório novo datado
  `resultados/reproducao-AAAA-MM-DD/` (ou `--out DIR`), com `summary.json`,
  `meta.json` (modelo, réplicas, falhas, hash do adaptador) e o manifesto.
- **Comparação com o depositado.** Ao final, agrega com o mesmo bootstrap por
  cluster e imprime, métrica a métrica, a nova estimativa contra o
  `summary.json` do braço final, marcando se os IC95% por cluster se sobrepõem.

Para medir OUTRO modelo de propósito, defina `STI_EVAL_3B_MODEL` e passe
`--allow-model-override`; o runner registra que a corrida não é uma replicação
da configuração final. Para reproduzir os braços 1 a 5 da campanha (modelo
`google/gemini-3.5-flash`), o mesmo override se aplica, com a ressalva de que
os braços intermediários também diferem em prompt e compilador.

## Interface de benchmark plugável

Qualquer simulador de alunos pode ser pontuado na mesma régua com
`--adapter`:

```bash
npm run reproduce:collect -- --adapter benchmark/adapter-exemplo.mjs --problems 2 --replicas 1
```

O contrato (função assíncrona
`simulate({ envelopeA, renderedFacts, interfaceInventory })` retornando
`{ correctPath, misconceptions, hints }` no schema do pacote), a regra de ouro
(o adaptador jamais vê o envelope-b) e o gate programático
(`findLeaksInRobotInput` sobre o input exato do adaptador) estão documentados
em [benchmark/ADAPTADOR.md](../benchmark/ADAPTADOR.md). O adaptador de exemplo
é offline e determinístico, útil para testar o harness sem custo.

## Variação estatística esperada

O simulador é um LLM estocástico (temperatura 0,7) e os identificadores
comerciais de modelo não congelam pesos remotos. Por isso o critério de
replicação deste benchmark é a SOBREPOSIÇÃO dos IC95% por cluster com os
intervalos depositados, nunca a igualdade pontual. Referência do braço final
(24 problemas x 3 réplicas): completude conceitual 0,913 com IC [0,861; 0,962];
F1 conceitual 0,626 [0,608; 0,643]; completude estrita 0,618 [0,601; 0,632];
precisão 0,548 [0,527; 0,569]. Coletas menores que 24 x 3 são ilustrativas e o
runner as marca como tal. O kappa funcional permanece nos artefatos apenas como
registro (ver `docs/INVESTIGACAO-KAPPA-2026-07-19.md`); a leitura substantiva
usa concordância bruta e PABAK, como no artigo.

Duas coletas honestas do mesmo commit podem, ainda assim, divergir além das
bandas se o modelo remoto mudar por trás do identificador. Registre sempre a
data, o commit do pacote e o manifesto de chamadas junto do resultado.

## Solução de problemas

- **Não rode como root.** Quatro testes de pré-flight simulam montagem somente
  leitura com `chmod`, e o kernel ignora bits de permissão para root: como root
  eles são PULADOS com aviso (`[real-pilot-preflight] suíte executada como
  root...`). A suíte passa mesmo assim, mas com cobertura reduzida — o resultado
  de referência é com usuário não privilegiado.
- **Hardware modesto (VPS pequena, laptop antigo).** O timeout global de teste é
  30 s (`vitest.config.mjs`) e os dois testes pesados — bootstraps da C4 em
  `campaign4-derived-checks` e os 10.000 grafos de
  `graph-hallucination.property` — declaram timeouts próprios de 120 s e 300 s.
  Espere alguns minutos para `npm test` e mais ainda para o
  `npm run verify:offline` completo. Se você vir `Test timed out in 5000ms`,
  está rodando uma versão do pacote anterior a 2026-07-20; atualize o clone.
- **Node antigo.** O pacote exige Node >= 20.19 (`engines` no `package.json`);
  a CI usa 22.12 (`.nvmrc`). Com nvm: `nvm install && nvm use` na raiz do clone.
- **`--help` e smoke do avaliador.** `node run-ctat-eval.mjs --help` e
  `node run-ctat-eval.mjs --dry-run --limit 1` nunca disparam chamada de LLM.
  No smoke real de 1 problema (`npm run eval:one`) não há pares HH, então o
  agregado de não-inferioridade sai `nao_estimavel` com IC `n/a` — é o
  comportamento esperado, não um erro.
- **Manifesto divergente após edição local.** `manifest:v7:verify` falha se
  qualquer arquivo do depósito mudou — é o propósito do gate. Num clone limpo
  ele passa; se você editou algo de propósito, regrave com
  `npm run manifest:v7:write` (o manifesto v6 é histórico e não deve ser
  regravado; ver `protocol/frozen/README.md`).

## Limites

- A coleta nova reexecuta o SHIM de avaliação standalone deste pacote, que
  espelha o caminho usado na campanha; o runtime completo da EducaOFF servida a
  estudantes não faz parte do benchmark.
- O corpus tem autor único e um só domínio; a licença de redistribuição dos
  BRDs segue pendente (`DATA-LICENSE.md`, `PROVENANCE.md`).
- As emendas exploratórias e o confounder modelo mais prompt do braço final
  estão declarados em `docs/PROTOCOLO-CAMPANHA-5.md` e nas Limitações do
  manuscrito v7.

## Citação

Use os metadados de [`CITATION.cff`](../CITATION.cff) e cite o commit ou a
release utilizada. Resultados de benchmark devem citar também a data da coleta
e o modelo (ou o adaptador, com hash) que produziu os runs.
