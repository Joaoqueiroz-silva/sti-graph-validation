# Lista de conferência número a número · artigo1-aits-v0.5 (experimento consolidado, 5 corpora)

Cada número publicado no artigo, com o arquivo de origem no repositório `sti-graph-validation` e o status da conferência feita nesta rodada (19/08/2026). Conferência = leitura programática do JSON/MD de origem e busca do valor no PDF final. Nenhum valor foi arredondado além da casa exibida no arquivo de origem.

## 1. Escala do experimento

| Valor no artigo | Onde aparece | Arquivo de origem | Status |
|---|---|---|---|
| 5 corpora · 105 problemas · 630 grafos (315 por braço) | Resumo, §1, §3.5, §5, Figuras I/3/9 | `resultados/EXPERIMENTO-CONSOLIDADO-2026-08/consolidado.json` (soma dos n por corpus×braço: 72+72+69+69+60+60+57+57+57+57 = 630) | OK |
| 0 falhas de coleta/materialização | §3.5, §5, Figuras 3/9 | idem (n esperado = n coletado em todos) + RESULTADOS.md de cada corpus | OK |
| Gate por enunciado: 100% nos 630; nenhuma análise usa recorte | Resumo, §3.6, §5 | `materializado-v3-fixa-*.analise.json` de cada corpus (campo `aprovadosEnunciado` = n) | OK |
| Problemas por corpus: 24 · 23 · 20 · 19 · 19 | §3.3 (tabela) | datasets de cada corpus + `docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md` | OK |
| 54 pacotes e 710 grafos no catálogo Mathtutor | §2, §3.3 | `docs/CATALOGO-PACOTES-MATHTUTOR-2026-08-16.md` | OK |
| 617 milhões (6 em 10) sem proficiência mínima; 70% das crianças de 10 anos em learning poverty (renda baixa/média) | §1 | Fontes externas conferidas em 19/08/2026: UNESCO UIS Fact Sheet 46 (2017); World Bank et al., The State of Global Learning Poverty: 2022 Update | OK (reconferir na véspera) |
| Estados de valor por problema: 4 · 4,35 · 3 · 5 · 24 | §3.3, Tabela 1, Gráfico 1 | `nEstadosRef` por exercício nos `analise.json` (médias 4,000 · 4,348 · 3,000 · 5,000 · 24,000) | OK (nota F4) |
| Erros do especialista por problema: 4 a 6 (média 4,6) · 2 a 3 · 2 a 3 (nenhum avaliável) · 2 a 4 (média 3,8) · 10 a 11 (média 10,6) | §3.3 (tabela) | `nErrosRef` (+ excluídos) por exercício nos `analise.json`: médias 4,58 · 2,35 · 0 avaliáveis (2,5 excluídos) · 3,84 · 10,63 | OK |

## 2. Tabela 1 (tabela-mestra, por corpus × braço)

Fonte única: `resultados/EXPERIMENTO-CONSOLIDADO-2026-08/consolidado.json` (idêntico ao RESULTADOS.md do consolidado); coluna "ajustada" de `linha-de-base-v3-fixa-*.json`. Todos os 40 valores centrais e os 20 ICs foram conferidos um a um contra o JSON.

| Corpus · braço | cobertura [IC] | íntegro [IC] | erros [IC] | estados/grafo | Status |
|---|---|---|---|---|---|
| 6.17 fl | 0,778 [0,753; 0,816] | 0,125 [0,028; 0,278] | 0,299 [0,252; 0,350] | 5,72 | OK |
| 6.17 qw | 0,941 [0,896; 0,969] | 0,764 [0,583; 0,875] | 0,629 [0,553; 0,704] | 6,96 | OK |
| 6.19 fl | 0,725 [0,659; 0,768] | 0,145 [0,072; 0,217] | 0,442 [0,343; 0,543] | 5,41 | OK |
| 6.19 qw | 0,728 [0,679; 0,760] | 0,072 [0,014; 0,130] | 0,693 [0,568; 0,797] | 8,32 | OK |
| 6.18 fl | 0,961 [0,906; 0,983] | 0,883 [0,717; 0,950] | N/A | 5,52 | OK |
| 6.18 qw | 0,989 [0,967; 1,000] | 0,967 [0,874; 0,983] | N/A | 8,10 | OK |
| 6.20 fl | 0,919 [0,877; 0,954] | 0,596 [0,386; 0,754] | 0,306 [0,235; 0,376] | 6,09 | OK |
| 6.20 qw | 0,933 [0,891; 0,961] | 0,667 [0,456; 0,807] | 0,598 [0,525; 0,667] | 8,12 | OK |
| 8.12 fl | 0,087 [0,064; 0,107] | 0,000 [0,000; 0,176] | 0,000 [0,000; 0,176] | 5,11 | OK |
| 8.12 qw | 0,300 [0,283; 0,320] | 0,000 [0,000; 0,176] | 0,033 [0,017; 0,061] | 12,12 | OK |

Coberturas sem ordem da Tabela 1 (0,990 · 1,000 · 0,870 · 0,838 · 0,967 · 0,989 · 0,919 · 0,933 · 0,292 · 0,694): mesmo arquivo, OK.

## 3. Agregados (pools por braço)

Fonte: `consolidado.json` (bootstrap percentílico estratificado por corpus, cluster no exercício, seed 42).

| Valor | Onde | Status |
|---|---|---|
| fl: cobertura 0,702 [0,684; 0,719] · sem ordem 0,820 · íntegro 0,337 [0,286; 0,387] · erros 0,272 [0,239; 0,307] (4 corpora) | Resumo, §5.6 | OK |
| qw: 0,786 [0,771; 0,800] · 0,895 · 0,495 [0,444; 0,543] · 0,506 [0,464; 0,547] (4 corpora) | Resumo, §5.6 | OK (nota F3) |
| Amplitude de cobertura no braço fl: 0,087 a 0,961 | §5.6 | derivada da Tabela 1, OK |

## 4. Tabela 2 (linha de base, ajustada, precisão, F1)

**Atualização 19/08 (noite):** as colunas de precisão e F1 da Tabela 2 passaram à régua SIMÉTRICA (`consolidado-simetrico.json`; ver seção 15 e `alteracoes-juizo-19-08.md`). Os valores abaixo documentam a régua congelada, que o artigo segue citando como leitura anterior no §5.2; cobertura, base, ajustada e íntegro são idênticos nas duas réguas.

Fonte: `linha-de-base-v3-fixa-<braço>.json` de cada corpus; espelhada na tabela §B de `docs/AUDITORIA-CIENTIFICA-2026-08-18.md`. Conferidos os 60 valores (10 linhas × 6 colunas) contra os JSONs; bate 100% com a auditoria §B.

Linhas conferidas (cobertura / base / ajustada / precisão / F1 / íntegro base): 6.17 fl 0,778/0,524/0,424/0,866/0,813/0,056 · 6.17 qw 0,941/0,563/0,858/0,790/0,852/0,167 · 6.19 fl 0,725/0,380/0,480/0,779/0,738/0,000 · 6.19 qw 0,728/0,406/0,463/0,740/0,726/0,000 · 6.18 fl 0,961/0,417/0,933/0,619/0,748/0,000 · 6.18 qw 0,989/0,417/0,975/0,546/0,700/0,000 · 6.20 fl 0,919/0,421/0,860/0,803/0,855/0,000 · 6.20 qw 0,933/0,442/0,877/0,748/0,827/0,000 · 8.12 fl 0,087/0,123/**−0,042**/0,449/0,191/0,000 · 8.12 qw 0,300/0,192/0,134/0,772/0,427/0,000. Status: OK.

Afirmações derivadas: "linha de base atinge 12% a 56%" (0,123 a 0,563, OK); "F1 0,70 a 0,86 nos corpora de frações" (0,700 a 0,855, OK); "F1 inverte no 6.18 (0,700 x 0,748) e no 6.20 (0,827 x 0,855)" (OK); "8.12 fl abaixo do papagaio" (ajustada −0,042, OK).

## 5. Tabela 3 (contrafactual R0→R3)

Fonte: `contrafactual-fixa-<braço>.json` por corpus (médias das `linhas`; base v2 dos agentes; sem 8.12). Conferidos os 8 × 4 pares cobertura/íntegro e os nº de estados de referência (7→6→4 · 10→6,3→4,3 · 11→10→4→3 · 8→7→5). Valores: 6.17 fl 0,452/0→0,528/0→0,781/0,139; 6.17 qw 0,605/0→0,706/0,014→0,938/0,750; 6.19 fl 0,306/0→0,478/0→0,707/0,101; 6.19 qw 0,310/0→0,494/0→0,729/0,087; 6.18 fl 0,332/0→0,365/0→0,704/0→0,939/0,817; 6.18 qw 0,382/0→0,420/0→0,750/0→1,000/1,000; 6.20 fl 0,579/0→0,662/0→0,926/0,632; 6.20 qw 0,599/0→0,684/0→0,947/0,737. "Sob a régua ingênua o caminho íntegro é 0,000 em todos os corpora": OK (coluna R0). Status: OK.

## 6. Tabela 4 (Δ pareado entre braços) e correção de afirmação

Fonte: `comparacao-bracos.json` de cada corpus (qwen − flash-lite, mesmo exercício × réplica; sem arquivo para o 8.12).

| Corpus | cobertura | sem ordem | íntegro | erros | Status |
|---|---|---|---|---|---|
| 6.17 | +0,156 [0,108; 0,194] | +0,021 [0,000; 0,052] | +0,611 [0,417; 0,750] | +0,377 [0,292; 0,455] | OK |
| 6.19 | +0,023 [−0,016; 0,088] | −0,012 [−0,054; 0,029] | −0,014 [−0,130; 0,101] | +0,295 [0,184; 0,413] | OK |
| 6.18 | +0,061 [0,028; 0,094] | +0,044 [0,017; 0,078] | +0,183 [0,083; 0,283] | N/A | OK |
| 6.20 | +0,021 [0,007; 0,039] | +0,021 [0,007; 0,039] | +0,105 [0,035; 0,193] | +0,327 [0,219; 0,428] | OK |

"Qwen melhor em tudo é FALSO" (§5.6): sustentado por 6.19 (ICs cruzam zero; íntegro nominalmente negativo) e pelo F1 da Tabela 2 (6.18 e 6.20). Fonte adicional: auditoria §C e §F. Status: OK.
"Vantagem consistente em erros no estado certo: +0,30 a +0,38": +0,295 · +0,327 · +0,377 (3 corpora avaliáveis). OK (o artigo diz "+0,30 a +0,38", arredondamento declarado do limite inferior 0,295; conferido).

## 7. Efeito da interface (§5.5, hipótese pré-registrada)

Fonte VIGENTE: `resultados/rodada4-interface-fixa-2026-08-15/comparacao-r4-vs-r3-custo-beneficio.json` e `...-estudantes-qwen.json` (regenerados em 16/08 sob a régua vigente).

| Valor no artigo | Origem | Status |
|---|---|---|
| cobertura em ordem +0,267 [0,163; 0,358] (fl) e +0,323 [0,236; 0,403] (qw) | arquivos acima | OK |
| sem ordem +0,354 e +0,323 | idem | OK |
| erros +0,235 [0,176; 0,284] e +0,388 [0,281; 0,493] | idem | OK |
| íntegro +0,042 [−0,111; 0,208] e +0,458 [0,292; 0,583] | idem | OK |
| "três de cada quatro grafos" (qwen com interface reproduz caminho inteiro no 6.17) | Tabela 1 (0,764) | OK |

## 8. Gates, gradiente e leituras por corpus

| Valor | Onde | Origem | Status |
|---|---|---|---|
| Gate estrito 6.20: 100% (fl, 57/57) e 88% (qw, 50/57) | §3.6 | `6.20/materializado-v3-fixa-*.analise.json` (`gate.estrito`, vigente 19/08) | OK (corrigido em 19/08: o RESULTADOS.md do corpus registra 56/57 = 98% para o fl, valor da análise anterior; a análise vigente e o consolidado dão 57/57; ver F6) |
| 8.12: gates por valores aprovam 0 de 57 (qw) com 57 de 57 enunciados limpos | §3.6 | `8.12/materializado-v3-fixa-estudantes-qwen.analise.json` + RESULTADOS.md do 8.12 | OK |
| Agentes agregam no 8.12: 5,1 e 12,1 passos contra 24 | Resumo, §5.3, Gráfico 1, Figura 8 | `consolidado.json` (estados/grafo 5,11 e 12,12) | OK |
| Gradiente (cobertura por granularidade): 3→0,961/0,989 · 4→0,778/0,941 · 4,35→0,725/0,728 · 5→0,919/0,933 · 24→0,087/0,300 | §5.3, Gráfico 1 | `consolidado.json` | OK |
| 6.20: estado textual casou em 45 de 57 (qw) | §5.1 | RESULTADOS.md do 6.20 | OK |
| 6.19: falta típica = "0" da parte inteira (estado de convenção) | §5.1, §5.3 | RESULTADOS.md do 6.19 | OK |
| 6.18: 30/50 erros não ancoráveis (ramo de variante) + 20/20 indistinguíveis; 0/110 e 0/54 nos outros | §4.2 | RESULTADOS.md do 6.18 + comentários datados em `comparar-caminho.mjs` | OK |
| 8.12: transcritibilidade 50,7% | §7 (limitação 5) | `docs/AUDITORIA-CIENTIFICA-2026-08-18.md` §E3 | OK |
| Efeito de versão do espelho desprezível: em módulo ≤ 0,07, ICs cruzando zero | §3.4 | `comparacao-espelho-v3-vs-v2-*.json` e `comparacao-versao-v2-vs-v1-*.json` | OK |

## 9. Exemplo real (Figuras 6 e 9)

Fonte: `rodada4-interface-fixa-2026-08-15/materializado-v3-fixa-custo-beneficio/runs/00bubble_rep1.json` (grafo, na íntegra: 6 passos, 7 erros, 24 dicas com 4 níveis por passo; citações literais da devolutiva do erro "6" e da dica nível 1 do passo 1) e `materializado-v3-fixa-custo-beneficio.analise.json` (placar: cobertura 0,75 · sem ordem 1,00 · íntegro 0 · erros 2/4 = 0,50 · extras 1 estado/2 erros/3 dicas). O casamento desenhado na Figura 9 (5→P1, 5→P3, 1/5→P4; "1" fora de ordem; erros "1"@F2 e "1"@partes casados; "5" e "-/5" não) foi recomputado com o próprio código da régua (`comparar-caminho.mjs` + `lib.mjs`) e bate com o placar do arquivo de análise. O trecho do trace do agente 3a ("O problema menciona dividir o pão em 5 partes iguais, logo o denominador é 5.") está no campo `bruto` do mesmo registro. Status: OK.

## 10. Espelho, custos e literatura

| Valor | Onde | Origem | Status |
|---|---|---|---|
| Commit de produção 5263488; 85 arquivos hasheados | §3.4, §8, Figura 5 | `producao/COMMIT-FONTE.txt` + `producao/ESPELHO.sha256` (85 linhas) | OK |
| Custos por corpus: US$ 3,60 · 3,46 · 3,29 · 3,43 · 3,92; total ≈ US$ 22 | §3.5, §8, Figura I | RESULTADOS.md de cada corpus (custos por chamada) + `docs/GUIA-DO-ARTIGO.md` §14 | OK (artigo publica a faixa 3,29–3,92 e o ≈22) |
| 3 réplicas justificadas por decomposição de variância | §3.5 | `docs/JUSTIFICATIVA-REPLICAS.md` | OK |
| 6.17 = 24 instâncias de um molde (mass production) | §3.3, Figura 4 | catálogo + manifesto do pacote 6.17 | OK |
| 7.12 preparado e interrompido; fora de todas as tabelas | §7 (limitação 10) | `resultados/bloco1-mathtutor-2026-08-16/7.12/LEIA-ME.md` | OK |
| EEF: feedback +6 meses; metacognição +8; feedback por tecnologia +4 | §1, Figura I | páginas do Teaching and Learning Toolkit (conferidas 15/08/2026; reconferir na submissão) | OK |
| 200–300 h/h; 50–100 (CTAT, 4–8× mais custo-efetivo); 28–40 (ASSISTments Builder) | §1, §2, Figura I | Aleven et al. 2009 (IJAIED) e 2016 (IJAIED); Razzaq et al. 2009 (IEEE TLT) | OK |

## 11. Inconsistências de documentação encontradas e como o artigo as trata

**F1 · "615 grafos" em docs antigos do repositório.** `docs/GUIA-DO-ARTIGO.md` §14, o RESULTADOS.md do 8.12 e o cabeçalho §B da auditoria registram "615"; a fonte de dados (`consolidado.json`) soma **630** (e o §2 do prompt de redação também). O artigo usa 630 em todo o texto e sinaliza o ajuste pendente da doc na Nota de verificação 7.

**F2 · Δ da interface citado no prompt de redação (§3.1: +0,095/+0,144 e +0,249/+0,383).** São os números da régua antiga; os arquivos `comparacao-r4-vs-r3-*.json` foram regenerados em 16/08 sob a régua vigente e são a fonte primária válida (+0,267/+0,323 em cobertura; +0,235/+0,388 em erros; +0,042/+0,458 em íntegro). Pela regra "nenhum número sem fonte primária no repositório", o artigo usa os valores dos arquivos.

**F3 · GUIA §14 registra "erros 0,562" para o pool qwen.** Valor defasado; `consolidado.json` dá 0,506 [0,464; 0,547]. O artigo usa 0,506.

**F4 · Estados médios do 6.19.** Docs do repositório arredondam para "4,3"; o valor computado dos `analise.json` é 4,348. O artigo exibe "4,35" (tabelas e gráfico), coerente com a casa exibida nas demais médias.

**F5b · RESULTADOS.md do 6.20 defasado no gate estrito do braço econômico.** O RESULTADOS.md do corpus registra 56/57 = 98%; a análise vigente (`gate.estrito`) e o consolidado dão 57/57 = 100%. O artigo usa 100% (fonte de dados vigente); alinhar o RESULTADOS.md do corpus junto com a F1.

**F5 · Rótulo do bootstrap do agregado.** O consolidador usa percentílico estratificado (não BCa); o artigo rotula exatamente assim (§4.2), conforme a correção A5 da auditoria.

## 12. Proveniência das Figuras 4 a 8 (tela anotada + grafo do especialista, por tutor)

**Telas (painel superior).** A do 6.17 (Figura 4) é a captura real preservada no repositório (`datasets/frac-numberline-6.17/_interface/screenshot.png`). As de 6.18, 6.19, 6.20 e 8.12 (Figuras 5 a 8) são renderizações locais construídas exclusivamente de artefatos reais: o HTML da interface de cada pacote espelhado no repositório (`datasets/<corpus>/_interface/*.html`, origem pública `mathtutor.web.cmu.edu/tutors/packages/<pacote>/`), as folhas de estilo oficiais `CTAT.css` e `Mathtutor.css` do release mathtutor do CDN do CTAT (regras copiadas verbatim em 19/08/2026), e o estado inicial lido das `startNodeMessages` do `expert.brd` do problema mostrado (01_1, 00bubble, 01book, CD sales): enunciados, textos das linhas, rótulos do seletor de alternativas do 6.20, ocultações iniciais e parâmetros das retas. O runtime CTAT não roda na renderização (componentes desenhados por um shim visual); os textos exibidos são literais dos arquivos. Declarado nas legendas e na Nota de verificação 10.

**Grafos (painel inferior).** Extraídos programaticamente do `expert.brd` do mesmo problema com o próprio código da régua (`carregarReferencia` de `analysis/validacao-v2/lib.mjs`): estados de valor com contagem de dicas por passo, exclusões (ações do tutor, sentinelas, mecânicos) e itens de erro com valor e devolutiva. Conferidos por problema: 6.17/00bubble 4 estados [1, 5, 5, 1/5] + 4 erros [5, 1, 1, -/5]; 6.18/01_1 3 estados [8, 1/4, 2] + 2 erros fora da régua ("1/4" indistinguível por valor; "1/8" do ramo da outra variante), coerente com o N/A do corpus; 6.19/00bubble 4 estados [5, 7, 0, 5/7] + 2 erros de inversão [7, 5]; 6.20/01book 5 estados [4, 1/4, 5, 1/5, alternativa textual] + 4 erros [1, 0, 1, 0]; 8.12/CD sales 24 estados (célula a célula: 5000×4, /, /, 50, 50, 100, 100 | 25, /, /, 50, 50, 1/2, 1/2 | 4, /, /, 50, 50, 2/25, 2/25) + 11 erros (100, 100, 1/2, 2/25 e sete "*"). As glosas das caixas de erro resumem as devolutivas reais dos arquivos.

**Faixas do agente nas Figuras 4 a 8.** Em todas as cinco figuras por tutor, a faixa final mostra o grafo materializado do agente no mesmo problema, primeira réplica de cada braço, com os campos `valor` literais dos runs: 6.17/`00bubble_rep1` 6 passos (fl) e 7 (qw); 6.18/`01_1_rep1` 5 e 7 (ambos incluem a fração equivalente 2/8 e o passo da comparação); 6.19/`00bubble_rep1` 5 e 8 (o "0" da parte inteira aparece nos dois, no fim do caminho, fora da ordem da referência); 6.20/`01book_rep1` 6 e 8 (no braço econômico desta réplica a alternativa final materializada é "Levar…", a errada, capturada pela régua como estado não casado; alternativas textuais abreviadas na figura); 8.12/`CD sales_rep1` 6 e 12 (o P1 do braço econômico agrega seis células: "5000,5000,25,5000,4,5000"). Arquivos em `materializado-v3-fixa-<braço>/runs/` de cada corpus (rodada 4 para o 6.17; bloco 1 para os demais); coerentes com as médias de estados/grafo da Tabela 1 (5,72/6,96 · 5,52/8,10 · 5,41/8,32 · 6,09/8,12 · 5,11/12,12).

## 13. Verificações editoriais

Sem travessões no texto e nas figuras (varredura no PDF: 0 ocorrências). Nenhuma cobertura bruta aparece sem linha de base, ajustada, precisão/F1 ou íntegro ao lado (regra do prompt; Tabela 1 traz a coluna "ajustada" e remete à Tabela 2). Nomes de arquivos em itálico serifado (estilo VerbatimChar herdando o tamanho do parágrafo). Citações de fontes do repositório via "(fonte S#)" com o Apêndice A completo (S1 a S23). As 11 limitações incluem as 8 obrigatórias do prompt, mais o adaptador de infraestrutura (auditoria §E6), a amostra de pacotes e domínio (5 de 54 pacotes; 105 de 710 grafos; matemática 6º–8º) e a nota de que nada aqui mede aprendizagem de alunos.

## 14. Pendências da equipe (registro fora do artigo, retirado da versão para submissão)

1. Recorte dos Objetivos de Desenvolvimento Sustentável: decidir se o argumento mobiliza o ODS 4, o ODS 5 ou ambos (o §1 hoje mobiliza os dois).

2. Título: decidir entre três candidatos. (a) O atual, sóbrio, com a validação no centro: "Agentic Intelligent Tutoring Systems: até onde agentes de IA reconstroem os grafos de comportamento de especialistas humanos". (b) Conceitual, com os dois conceitos na frente: "Augmented Teacher in the Lead: agentes de IA assumem o custo que afastou o mundo dos sistemas tutores inteligentes, e cinco tutores medem até onde". (c) De confronto, no tom da reunião de orientação: "O mundo está olhando para o lugar errado: Agentic Intelligent Tutoring Systems, o professor com liderança aumentada, e a validação que diz até onde eles já chegam". O resumo atual funciona com qualquer um dos três.

3. Nome da técnica (GraphForge): validar com a equipe; é o nome do compilador no repositório do projeto.

4. Critérios de publicação dos pacotes no Mathtutor/TutorShop: levantar a documentação da época (ou contato com a equipe do CTAT) para sustentar o argumento de curadoria; o texto usa a formulação prudente ("processo interno à equipe; critérios não documentados publicamente").

5. Doc interna do repositório registra "615 grafos" em alguns pontos; a fonte de dados (`consolidado.json`) soma 630, valor usado em todo o artigo. Alinhar a doc antes da submissão.

6. Reconferências de véspera: valores do Toolkit da EEF (confirmados em 15/08/2026), estatísticas de escala (UNESCO 2017; World Bank et al. 2022, conferidas em 19/08/2026) e DOI/volume/páginas de cada referência. As telas das Figuras 5 a 8 são renderizações locais fiéis (HTML do pacote espelhado + CSS oficial CTAT/Mathtutor + estado inicial do `.brd`, sem o runtime); se desejado, substituir por capturas ao vivo do sítio público.

## 15. Rodada de julgamento de 19/08 (dicas, régua simétrica, extras)

Conferência completa em `alteracoes-juizo-19-08.md` (81 comparações de igualdade contra os arquivos; 80 exatas, 1 corrigida a favor do arquivo). Fontes novas: S24 a S33. Destaques: Tabela 2 passou à régua simétrica (`consolidado-simetrico.json`; agregados 0,7173→0,8205 e 0,7081→0,7620, coberturas invariantes); Tabelas 5 e 6 novas (dicas: `dicas-consolidado.json` e `juiz-dicas-z-ai-glm-4-5.json`; 1.452 julgamentos, gate aprovado com estrangeiro 0,50 e embaralhado 0,45 só no escalonamento); limitação 11 nova (extras sem veredito: 0,479 e 0,501 contra gate 0,80); incidentes de execução (US$ 12,75; US$ 10,65 descartados).

**F7 · Arredondamento no RESULTADOS.md do juízo:** o resumo diz "1,47 ponto" para a queda do controle estrangeiro; o JSON dá 1,4628 → o artigo usa 1,46.
**F8 · Prompt de reescrita:** citava "69%" para o juiz de estados (inexistente nos arquivos; real: 35,3% de aceitação dos distratores-erro, rejeição total 0,741) e "o texto atual traz 0,7173/0,7081" (o artigo trazia por corpus × braço; a correção foi aplicada nas 20 células da Tabela 2 e nos agregados citados). Temperatura do juiz (0,1) não consta nos arquivos e não foi afirmada.
