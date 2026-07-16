# Manuscrito v6.1

Esta é a versão científica vigente do estudo. A apresentação editorial foi separada em dois documentos:

- `artigo-validacao-agentes-comportamentais-v6.1.pdf`: artigo principal, 15 páginas A4;
- `suplemento-validacao-agentes-comportamentais-v6.1.pdf`: suplemento técnico, 11 páginas A4;
- os arquivos `.tex`, `frontmatter.tex` e `referencias.tex`: fontes editáveis.

A v6.0 permanece preservada como relatório técnico completo de 33 páginas. Ela documenta a trilha extensa de auditoria, mas não é um segundo artigo concorrente nem a versão indicada para submissão.

## O que mudou

- removidos da capa o banner de versão, a classificação interna e a data de execução;
- removido o checklist editorial do texto científico;
- título, resumo e abstract foram condensados;
- a pergunta sobre a qualidade dos grafos passou a orientar introdução, resultados, discussão e conclusão;
- o artigo principal ficou centrado na Campanha 4 e na resposta científica;
- matrizes históricas, detalhes de C1–C3, incidentes, custos, hashes e emendas foram transferidos ao suplemento;
- a antiga Tabela 16 foi corrigida e aparece como Tabela S2: soma de 72 pares exercício–réplica, com `N=437`, marginais explícitas e dependência declarada;
- as 16 referências foram corrigidas e todas são citadas no corpo do artigo;
- Cohen (1960), Fleiss e Cohen (1973) e Holm (1979) foram acrescentados para sustentar as métricas correspondentes.

## Compilação

Use Tectonic, XeLaTeX ou LuaLaTeX, pois os documentos utilizam `fontspec`. A compilação não chama modelos de linguagem e não gera custo de API.

```bash
cd docs/manuscript/v6.1
tectonic -X compile artigo-validacao-agentes-comportamentais-v6.1.tex
tectonic -X compile suplemento-validacao-agentes-comportamentais-v6.1.tex
```

Os PDFs entregues foram compilados com Tectonic 0.16.9, renderizados página a página e inspecionados visualmente. Não há referências indefinidas, tabelas cortadas, texto sobreposto ou avisos de caixas excedentes.

## Estatuto científico

- Campanha 4: avaliação principal dos agentes implantados, do transporte e do GraphForge;
- Campanhas 1–3: desenvolvimento histórico e evidência secundária, sem combinação estatística com C4;
- BRDs: referências CTAT de autor único para concordância com STIs existentes, não verdade pedagógica universal;
- painel de LLMs: evidência textual auxiliar, com efeito teto e sem substituição de especialistas;
- conclusão: os artefatos podem apoiar autoria como rascunhos, mas os dados não sustentam uso autônomo na versão auditada.

## Informações externas ainda necessárias para submissão

O artigo não inventa dados que dependem do autor ou de terceiros. Antes de enviar a uma revista, ainda é necessário:

1. confirmar a declaração de financiamento;
2. informar ORCID, se houver e se a revista o solicitar;
3. regularizar e documentar autoria, instituição, data e licença de redistribuição do corpus CTAT;
4. adaptar extensão, estilo bibliográfico, anonimização e declaração de uso de IA à revista escolhida.

Esses itens não alteram os resultados. A ausência deles impede apenas tratar o pacote atual como versão editorial definitivamente pronta para uma revista específica.

## Integridade dos arquivos

Os hashes SHA-256 estão em `SHA256SUMS`. Os PDFs e respectivos fontes devem permanecer sincronizados depois de qualquer alteração.
