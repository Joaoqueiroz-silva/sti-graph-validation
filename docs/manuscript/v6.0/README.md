# Manuscrito v6.0

Esta é a versão científica atual do estudo.

- `artigo-validacao-agentes-comportamentais-v6.0.pdf`: PDF oficial, 33 páginas A4,
  SHA-256 `3ac8ffc726294ff9188442468ea6afc82bc610736f9cff1b92d81b21c6f83d38`.
- `artigo-validacao-agentes-comportamentais-v6.0.tex`: fonte principal.
- `figures/`: quatro figuras utilizadas pelo fonte.

## Compilação

Use Tectonic, XeLaTeX ou LuaLaTeX, pois o documento utiliza `fontspec`.

```bash
cd docs/manuscript/v6.0
tectonic artigo-validacao-agentes-comportamentais-v6.0.tex
```

Com XeLaTeX:

```bash
xelatex artigo-validacao-agentes-comportamentais-v6.0.tex
xelatex artigo-validacao-agentes-comportamentais-v6.0.tex
```

Não há arquivo `.bib`, estilo particular nem chamada de API durante a compilação.

O PDF entregue foi renderizado página a página; não há texto cortado, sobreposto
ou fontes não incorporadas. Depois de qualquer alteração no LaTeX, recompile,
repita a inspeção visual e regenere `SHA256SUMS` e o manifesto v6.

## Estatuto científico

- Campanha 4: avaliação principal dos agentes, transporte e GraphForge.
- Campanhas 1–3: desenvolvimento histórico e evidência secundária.
- Nenhuma estimativa é combinada entre campanhas.
- O BRD é referência CTAT de autor único, não verdade pedagógica universal.
- O painel de LLMs é auxiliar e não substitui avaliação humana.

O PDF e o LaTeX devem permanecer sincronizados. `npm run article:validate` confronta as alegações numéricas centrais do fonte com os derivados publicados.

## Juízo de qualidade desta versão

Nos critérios observáveis, os grafos produzidos pelo fluxo auditado são geralmente processáveis e sua montagem é reprodutível, mas conteúdo comportamental, segurança das dicas e rastreabilidade apresentam fragilidades essenciais. Os dados não sustentam uso autônomo; o papel defensável é o de rascunho assistivo submetido a gates automáticos e revisão humana.
