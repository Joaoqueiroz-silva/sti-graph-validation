# Validação técnica em camadas da autoria de grafos de comportamento

[![CI offline](https://github.com/Joaoqueiroz-silva/sti-graph-validation/actions/workflows/ci.yml/badge.svg)](https://github.com/Joaoqueiroz-silva/sti-graph-validation/actions/workflows/ci.yml)

Repositório reprodutível do estudo sobre a validação técnica dos grafos de comportamento autorados com os agentes 3a, 3b e 3c da rota legada da **EducaOFF / STI Unplugged**. O trabalho acompanha as evidências desde o conteúdo proposto até o grafo montado e separa quatro objetos que não devem ser confundidos:

1. conteúdo bruto produzido pelos agentes de LLM;
2. informação preservada ou perdida no transporte;
3. estrutura montada deterministicamente pelo GraphForge;
4. concordância com grafos CTAT de referência.

> **Versão científica atual: v6.0.** A Campanha 4 é a avaliação principal, por executar cópias congeladas dos agentes e do transporte da implantação auditada. As Campanhas 1–3 são desenvolvimento histórico do instrumento e evidência secundária. As estimativas das quatro campanhas não são combinadas.

## Manuscrito atual

- [PDF do artigo v6.0](docs/manuscript/v6.0/artigo-validacao-agentes-comportamentais-v6.0.pdf)
- [fonte LaTeX](docs/manuscript/v6.0/artigo-validacao-agentes-comportamentais-v6.0.tex)
- [instruções de compilação](docs/manuscript/v6.0/README.md)
- [reprodução e trilha de evidências](docs/REPRODUCAO-V6.md)
- [registro de modelos e custos](docs/MODELOS-E-CUSTOS.md)
- [proveniência e licença do corpus](PROVENANCE.md)

Os relatórios anteriores permanecem como material histórico. Eles não substituem o manuscrito v6.0.

## O que o estudo pode e não pode concluir

O estudo permite:

- medir diretamente propriedades observáveis das saídas dos agentes;
- localizar perdas entre saída bruta, configuração, grafo genérico e manifesto de slots;
- verificar invariantes estruturais implementadas e determinismo nos casos testados;
- medir concordância com a referência CTAT sob denominadores declarados;
- auditar falhas, custos, modelos, hashes e emendas.

O estudo **não** demonstra:

- equivalência dos agentes a especialistas humanos;
- que os BRDs constituem verdade pedagógica universal;
- eficácia de aprendizagem com estudantes;
- correção pedagógica completa do tutor final;
- equivalência entre modelos de LLM;
- melhoria longitudinal entre campanhas com desenhos diferentes.

## Desenho em quatro campanhas

| Campanha | Objeto executado | Papel na v6.0 | Limite principal |
| --- | --- | --- | --- |
| C1 | bancada integrada adaptada | piloto do instrumento | retenção histórica incompleta e juiz único |
| C2 | bancada adaptada com quatro famílias geradoras | robustez exploratória | ausência de teste de equivalência e mudança de juiz |
| C3 | subsistema integrado e executor analítico | evidência histórica secundária | bancada diferente da implantação e reconstrução parcial de `R_bug` |
| C4 | agentes 3a/3b/3c, transporte e GraphForge congelados | avaliação principal | um domínio, seis chamadas agrupadas por réplica e ausência de validação humana |

Os mesmos 24 exercícios aparecem nas campanhas; isso não cria 96 exercícios independentes.

## Resultados centrais da Campanha 4

Desenho: 24 exercícios, três réplicas, seis estados de quatro problemas por réplica. Foram planejadas 18 unidades estado–réplica; 17 ficaram completas e uma falha foi mantida no estimando ITT, sem repetição, reparo ou imputação.

| Camada | Resultado principal | Interpretação permitida |
| --- | --- | --- |
| agente 3a | recall concreto ordenado `0,000`; resposta final exata `0,111` [0,028; 0,222] | o contrato produz templates genéricos, incompatíveis com reprodução concreta direta |
| agente 3b | recall por valor `0,176` [0,113; 0,242] | baixa recuperação do catálogo concreto da referência; estado/SAI não é estimável |
| agente 3c, capacidade forçada | sucesso estrito `0,278` [0,167; 0,403] | completude formal não implica progressão pedagógica; houve vazamento literal |
| transporte 3a | 272 itens brutos → 60 preservados (`22,1%`) | truncamento global descartou 212 itens |
| transporte 3b | 136 → 117 (`86,0%`) | campos e identidade de problema não são integralmente preservados |
| transporte 3c | 328 → 272 (`82,9%`) no braço de capacidade | o braço operacional pulou o 3c em 17/17 estados completos |
| GraphForge | 34/34 pares de reexecução idênticos | determinismo observado, não validade pedagógica |

Fonte canônica: [`campaign4-final-analysis-v2.1.json`](resultados/campanha4-2026-07-15/campaign4-final-analysis-v2.1.json).

### Juízo de qualidade sustentado pelos dados

Os resultados não sustentam classificar os grafos produzidos pelo fluxo auditado como completos e prontos para uso autônomo. A qualidade é heterogênea: as saídas são geralmente processáveis e a montagem é reprodutível, mas o caminho correto concreto, a cobertura e localização dos ramos buggy, a segurança e o uso das dicas e a rastreabilidade apresentam fragilidades essenciais. O papel empiricamente defensável desta versão é o de **gerador assistivo de rascunhos**, com gates automáticos e revisão humana antes da implantação.

Esse juízo não significa que todo conteúdo gerado seja pedagogicamente errado. Ele se restringe ao domínio, ao modelo, à rota legada e à versão auditados; adequação pedagógica e eficácia com estudantes permanecem não estimáveis sem evidência humana externa.

O gerador final foi `google/gemini-3.5-flash`. O painel auxiliar final usou `z-ai/glm-5.2`, `qwen/qwen3.7-plus` e `deepseek/deepseek-v4-pro`. O painel teve forte efeito teto e dez de quinze dimensões sem variação suficiente para estimar concordância corrigida pelo acaso; por isso ele é evidência auxiliar, não validação pedagógica.

## Evidência histórica resumida

- C1: cobertura conceitual histórica `0,376` [0,309; 0,442].
- C2: nenhuma diferença primária de cobertura foi detectada entre os quatro geradores; isso não prova equivalência.
- C3: `R_bug=0,054` [0,016; 0,095], reconstruído a partir do agregado ancorável retido; `R_ok=0`; cobertura por valor `0,243` [0,163; 0,324].
- C3 estrutural: zero violações duras e 62 sinais moles em 648 grafos.
- Os braços DOM/screenshot e o antigo painel C3 são documentados, mas não sustentam conclusões principais.

## Verificação totalmente offline

Requisitos: Node.js 20.19 ou posterior (a integração contínua usa 22.12). Verificar os resultados publicados não exige chave de API e não gera custo.

```bash
git clone https://github.com/Joaoqueiroz-silva/sti-graph-validation.git
cd sti-graph-validation
npm ci
npm run verify:offline
```

O comando executa a suíte determinística, valida o relatório histórico, confronta o artigo v6.0 com os JSONs derivados, verifica privacidade, links e hashes do depósito.

Comandos analíticos individuais:

```bash
npm run c3:reanalyze
npm run c4:aggregate
npm run c4:sensitivity
npm run c4:judge:correct
npm run article:validate
```

Consulte [docs/REPRODUCAO-V6.md](docs/REPRODUCAO-V6.md) antes de regenerar derivados, pois alguns arquivos registram correções e sensibilidades pós-hoc que precisam conservar essa classificação.

## Chamadas pagas

Nenhuma chamada paga é necessária para conferir o artigo. Os runners reais permanecem no repositório para auditoria, mas não fazem parte de `verify:offline` nem da integração contínua.

Para uma nova execução deliberada, é necessário criar `.env` a partir de `.env.example`, definir limite financeiro e usar os preflights correspondentes. Não reutilize os comandos históricos como se fossem uma réplica da C4: os protocolos, entradas e modelos de juiz são diferentes.

Custos contabilizados da execução retida:

- geração C4: US$ 1,9539885;
- painel auxiliar final C4: US$ 1,243231545;
- C3 histórica: US$ 16,71870027;
- custos C1/C2 aparecem apenas como aproximações narrativas, pois não há manifesto de chamadas suficiente para reconciliação independente.

## Estrutura do repositório

```text
analysis/                              reanálises, agregações e validadores
answer-key/                            gabarito independente e sua proveniência
battery/                               bateria congelada da Campanha 3
cases/ e datasets/                     corpus CTAT e envelopes históricos
docs/manuscript/v6.0/                  artigo atual em PDF e LaTeX
production-fidelity/                   fixtures, métricas e runners da Campanha 4
protocol/frozen/                       congelamentos das Campanhas 1–3 e manifesto v6
protocol/production-freeze-2026-07-15/ imagem, planos e emendas da Campanha 4
resultados/                             artefatos retidos das quatro campanhas
__tests__/                              testes determinísticos e de propriedades
```

Os arquivos de prontidão de chave e saldos da conta foram deliberadamente excluídos do depósito público. Eles não alteram resultados científicos. Permanecem os custos por chamada, tokens, modelos, falhas e totais necessários à auditoria.

## Proveniência, referência e licença

Os BRDs são tratados como **grafos CTAT de referência de autor único**, não como padrão-ouro pedagógico universal. O repositório preserva hashes e contagens por exercício, mas nome, credenciais detalhadas, instituição, data de autoria e licença de redistribuição continuam pendentes de documentação independente.

A licença MIT cobre o código original deste repositório. Ela não deve ser interpretada automaticamente como licença do corpus CTAT; veja [DATA-LICENSE.md](DATA-LICENSE.md).

## Citação

Use os metadados de [`CITATION.cff`](CITATION.cff). Enquanto o artigo não possuir DOI ou referência editorial, cite a versão do repositório e registre o commit ou release utilizado.

## Versionamento científico

- `legacy-campaigns-2026-07`: congelamento das Campanhas 1–2;
- v3.x: relatório histórico centrado nas Campanhas 1–3;
- v6.0: manuscrito integrado, com C4 principal e C1–3 históricas;
- uma futura release `v6.0.0` deverá apontar para o commit aceito após esta auditoria.

Emendas, falhas e análises invalidadas não são apagadas. Mudanças futuras devem preservar a cronologia e atualizar o manifesto SHA-256.
