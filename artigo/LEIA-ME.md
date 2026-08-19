# Artigo · artigo1-aits-v0.5

Esta pasta contém a fonte de texto do manuscrito e os seus registros de conferência.

| Arquivo | O que é |
|---|---|
| `artigo1-aits-v0.5.md` | O manuscrito completo (fonte Markdown de onde o .docx e o .pdf são gerados). É a versão de texto vigente: 9 seções + Apêndice A (fontes S1 a S33) + Referências. |
| `lista-de-conferencia-v0.5.md` | A conferência número a número: cada valor publicado no artigo, o arquivo deste repositório de onde ele saiu e o status da verificação (inclui as inconsistências F1 a F8 encontradas na doc interna e como o artigo as trata). |
| `alteracoes-juizo-19-08.md` | A lista de alterações da rodada de julgamento de 19/08 (régua simétrica, dicas, juiz cego), número a número, com o arquivo de origem de cada um. |

## Regras que valem para qualquer edição

1. **Nenhum número entra ou sai do artigo sem arquivo de origem neste repositório.** O Apêndice A do próprio artigo mapeia cada fonte citada no texto (S1 a S33) ao seu arquivo. Se um número do texto divergir do arquivo, o arquivo vence.
2. As imagens referenciadas no Markdown (`figs/*.png`) são binárias e vivem fora do repositório, junto com o `.docx` e o `.pdf` gerados; o texto se sustenta sem elas (toda figura tem legenda autocontida com as fontes).
3. Decisões editoriais pendentes da equipe (título, recorte de ODS, nome GraphForge) estão registradas na seção 14 da lista de conferência, fora do texto do artigo.
