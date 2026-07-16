# Versões científicas e campanhas

## Qual é o artigo atual?

A versão científica vigente é **v6.1**:

- [manuscrito v6.1 — página de entrada](manuscript/v6.1/README.md);
- [PDF do artigo v6.1 (15 páginas)](manuscript/v6.1/artigo-validacao-agentes-comportamentais-v6.1.pdf);
- [fonte LaTeX do artigo v6.1](manuscript/v6.1/artigo-validacao-agentes-comportamentais-v6.1.tex);
- [PDF do suplemento técnico v6.1](manuscript/v6.1/suplemento-validacao-agentes-comportamentais-v6.1.pdf);
- [fonte LaTeX do suplemento técnico v6.1](manuscript/v6.1/suplemento-validacao-agentes-comportamentais-v6.1.tex).

O artigo principal concentra pergunta, método, resultados e discussão em 15 páginas. O suplemento
técnico preserva os detalhes necessários à auditoria sem sobrecarregar o texto para submissão. O
relatório técnico v6.0, com 33 páginas, permanece completo e inalterado como registro histórico;
ele não é um segundo artigo concorrente e não deve ser usado como versão final quando divergir da
v6.1.

`v6.1` é a versão do manuscrito, não o número de uma campanha. O estudo possui quatro campanhas.

## Papel de cada campanha na v6.1

| Campanha | Data | Objeto resumido | Papel na v6.1 | Fonte principal de auditoria |
| --- | --- | --- | --- | --- |
| C1 | 2026-07-02 | bancada integrada adaptada | piloto histórico do instrumento | `resultados/campanha-2026-07-02/` |
| C2 | 2026-07-08/09 | bancada multimodelo adaptada | robustez exploratória histórica | `resultados/campanha-2026-07-08-multimodelo/` |
| C3 | 2026-07-13 | subsistema integrado e executor analítico | evidência histórica secundária | `resultados/campanha3-2026-07-13/` e [METRICAS-V2.md](METRICAS-V2.md) |
| C4 | 2026-07-15 | agentes 3a/3b/3c, transporte e GraphForge congelados | **avaliação principal** | `resultados/campanha4-2026-07-15/` e `protocol/production-freeze-2026-07-15/` |

“Principal” significa que a C4 responde mais diretamente à pergunta atual sobre os agentes e o
fluxo implantado auditado. Não significa estudo confirmatório, equivalência a especialistas nem
eficácia com estudantes. Todas as campanhas são exploratórias e suas estimativas não são
combinadas.

Os mesmos 24 exercícios aparecem nas quatro campanhas. Eles não formam 96 unidades independentes.

## Linha de versionamento

### Congelamento legado

A tag anotada `legacy-campaigns-2026-07` preserva o estado histórico das Campanhas 1 e 2. O
manifesto que descreve seus 219 arquivos foi criado depois e está em
[`protocol/frozen/`](../protocol/frozen/README.md). A tag não deve ser movida para incluir o
manifesto.

### Relatórios v3.x

Os relatórios v3.x passaram a incorporar a Campanha 3 e as correções documentadas de denominador,
instrumento e interpretação. Eles são a origem histórica de parte da evidência secundária, mas
foram substituídos como síntese científica: primeiro pelo relatório técnico v6.0 e, atualmente,
pelo artigo e suplemento v6.1.

### Relatório técnico v6.0

A v6.0 integrou a Campanha 4 como avaliação principal e manteve C1–C3 separadas como evidência
histórica. Seu relatório técnico completo de 33 páginas permanece preservado para auditoria da
saída dos agentes, do transporte, da montagem determinística e da concordância com a referência
CTAT.

### Artigo e suplemento v6.1

A v6.1 é a versão científica vigente. Ela apresenta o estudo em dois artefatos sincronizados: um
artigo principal de 15 páginas e um suplemento técnico separado. A mudança é editorial, não uma
nova coleta nem uma quinta campanha: C4 continua sendo a avaliação principal e C1–C3 continuam
sendo evidência histórica, sem combinação de estimativas.

Uma release estável só deve ser criada depois da auditoria completa, das verificações offline e da
resolução dos bloqueios de publicação. A existência do diretório v6.1 e a versão de pacote
`6.1.0` não implicam que uma release editorial ou um DOI já existam.

## Regras para novas versões

1. Não sobrescrever resultados brutos, protocolos congelados, emendas ou artefatos invalidados.
2. Registrar correções pós-dados como emendas datadas, com efeito declarado sobre estimandos e
   conclusões.
3. Manter PDF e LaTeX da versão vigente sincronizados.
4. Atualizar manifestos e hashes quando arquivos públicos derivados mudarem; não alterar
   manifestos históricos para esconder divergências.
5. Não comparar níveis absolutos entre campanhas com desenhos, modelos ou entradas diferentes
   como se fossem melhora longitudinal.
6. Registrar modelo, configuração, custo, falhas e unidade de análise de toda nova coleta paga.
7. Preservar a distinção entre reprodução offline de análises e repetição externa da coleta por
   LLM.

## Bloqueios que o versionamento não resolve

Uma nova versão ou tag não concede licença sobre dados de terceiros, não restaura cegamento já
perdido e não transforma documentação retrospectiva em pré-registro. Consulte
[`../DATA-LICENSE.md`](../DATA-LICENSE.md), [`../PROVENANCE.md`](../PROVENANCE.md),
[`DEPOSITO-OSF.md`](DEPOSITO-OSF.md) e
[`../anotacao-humana/STATUS.md`](../anotacao-humana/STATUS.md).
