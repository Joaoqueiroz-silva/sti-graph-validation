# Geração reprodutível do PDF do relatório

> **PIPELINE HISTÓRICO.** Estas instruções recompõem
> `RELATORIO-CAMPANHA-1.pdf`, não o artigo científico atual. A versão v6.0 é
> compilada do LaTeX em [`manuscript/v6.0/`](manuscript/v6.0/README.md). Os dois
> arquivos têm funções diferentes e não são artigos concorrentes.

O PDF é gerado diretamente de `docs/RELATORIO-CAMPANHA-1.html`, sem alterar o HTML. O processo usa o modo headless do Chrome para preservar o desenho, produzir marcação estrutural e criar bookmarks a partir dos títulos `h1`, `h2` e `h3`. Em seguida, `pypdf` normaliza autoria, título, assunto, palavras-chave, idioma `pt-BR` no catálogo e a preferência de abertura com o outline visível.

## Dependências

- Node.js 22 ou posterior (necessário para o cliente WebSocket nativo usado na impressão);
- Google Chrome ou Chromium; em local não padrão, definir `CHROME_BIN`;
- Python 3 com `pypdf`;
- Poppler (`pdftoppm`) apenas para a renderização automática de QA.

## Comando de produção

```sh
node scripts/build-report-pdf.mjs \
  --input docs/RELATORIO-CAMPANHA-1.html \
  --output docs/RELATORIO-CAMPANHA-1.pdf \
  --qa-dir tmp/report-pdf-qa
```

O diretório indicado por `--qa-dir` recebe um PNG de 120 dpi para cada página. Antes de publicar o PDF, inspecione visualmente esses PNGs, sobretudo páginas com tabelas, transições de seção, declarações e referências.

Para testar sem substituir o PDF publicado:

```sh
node scripts/build-report-pdf.mjs \
  --output tmp/RELATORIO-CAMPANHA-1.pdf \
  --qa-dir tmp/RELATORIO-CAMPANHA-1-pages
```

O script aplica escala de impressão `0.94`, tamanho Letter, fundos gráficos e rodapé `página / total`. Também impede a divisão de tabelas entre páginas e remove apenas o espaçamento final que criaria uma página vazia, sem alterar o HTML de origem. A escala pode ser ajustada explicitamente com `--scale`, mas qualquer alteração exige nova inspeção visual integral.

Para datas de metadados determinísticas em automação, defina `SOURCE_DATE_EPOCH` antes da execução. Sem essa variável, usa-se a data de modificação do HTML de origem.

## Garantias e limitações de acessibilidade

O arquivo resultante é marcado (`Tagged PDF`), possui árvore estrutural, idioma de documento e outline navegável. Os SVGs do relatório já possuem elementos `title`, que o Chrome incorpora na árvore acessível quando possível.

O pipeline do Chrome não permite garantir, por API, texto alternativo editorial completo para cada figura nem a ordem de leitura perfeita de tabelas complexas. Essas propriedades devem ser conferidas em um validador de acessibilidade especializado antes da submissão a uma revista que exija PDF/UA. O pós-processamento preserva a marcação criada pelo Chrome e não inventa descrições ausentes no HTML.
