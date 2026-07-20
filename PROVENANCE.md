# Proveniência do corpus (gate G3)

Gerado por `analysis/build-provenance.mjs` em 2026-07-12. Regra: nenhum exercício entra em campanha sem linha aqui; campos PENDENTE bloqueiam a alegação de "especialista identificado" no artigo (usar "grafo CTAT de referência de autor único"). A licença MIT do código não cobre automaticamente estes arquivos; consulte `DATA-LICENSE.md`.

**Situação não resolvida:** nome, formação, instituição, data de autoria e licença de redistribuição dos BRDs ainda não foram comprovados documentalmente. Os arquivos já constam no histórico público do repositório, fato que não regulariza sua licença.

| Exercício | SHA-256 (12) | Estados | Trans. corretas | Trans. buggy | Misc. (conc.+mec.) | Dicas | KCs declarados | KCs usados em transições |
|---|---|---|---|---|---|---|---|---|
| 00bubble | `351a81770249` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 01watermelon | `49fe5522a727` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 02watermelon | `dde7a8e4cdbc` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 03summerBooks | `e09243993a8e` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 04soccerSeason | `7ee4cf08f4cd` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 05flu | `cb282f7886b2` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 06lemonade | `161cbc049ec7` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 07pizza | `012e72b26e86` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 08dentists | `81c2ee8ef6a2` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 09mathCompetition | `5a9f09e233c7` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 10children | `75bafd88f71e` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 11project | `c46ef8199269` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 12apples | `95cd8362fff2` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 13cleanRoom | `08ae34174562` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 14centimeter | `865ced29ff84` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 15fishStick | `3092547d0d97` | 16 | 8 | 8 | 6+2 | 25 | 5 | 4 |
| 16bonusQuestion | `beca645859e3` | 16 | 8 | 8 | 4+4 | 25 | 5 | 4 |
| 17pencils | `135145f1a322` | 16 | 8 | 8 | 6+2 | 25 | 5 | 4 |
| 18gum | `efba51dfff82` | 16 | 8 | 8 | 5+3 | 25 | 5 | 4 |
| 19Painting | `7a71f4c83267` | 16 | 8 | 8 | 6+2 | 25 | 5 | 4 |
| 20birthday | `872a3b184815` | 16 | 8 | 8 | 5+3 | 25 | 5 | 4 |
| 21mnm | `6bfa8f4976e6` | 16 | 8 | 8 | 6+2 | 25 | 5 | 4 |
| 22biscuit | `d647c6dbc3e8` | 16 | 8 | 8 | 6+2 | 25 | 5 | 4 |
| 23textbookPack | `8cd7edbbb5fe` | 16 | 8 | 8 | 6+2 | 25 | 5 | 4 |

Interface compartilhada: `interface.html` (1ba89f4cb153) · `interface.json` (3b3c29abe810) · `massproduction.txt` (18626e8402b0) · `screenshot.png` (78a8fb382aa1)

`KCs declarados` conta todos os elementos `productionRule` do BRD; `KCs usados em transições` conta apenas identificadores associados às transições extraídas. Por exemplo, `01watermelon` declara cinco regras e usa quatro nas transições contadas.

## Campanha 5 (2026-07-19)

A Campanha 5 usou o MESMO corpus congelado acima (nenhum exercício novo entrou; a situação de licença dos BRDs continua a mesma e continua não resolvida). Artefatos novos, todos derivados:

- `resultados/campanha5-2026-07-19/<braço>/runs/*.json` — 72 runs por braço (6 braços), saída do comparador sobre os pares robô×especialista; contêm respostas erradas propostas pelo robô e chaves de faltas/extras derivadas dos BRDs.
- `resultados/campanha5-2026-07-19/<braço>/summary.json` — agregados com bootstrap por cluster (10k, seed 42).
- `resultados/campanha5-2026-07-19/previsao-teorica/` — previsão determinística ANTERIOR à medição do braço 6: `reconstruir_interface.py` e `fatos-reconstruidos.json` (reconstrução da interface renderizada a partir de `massproduction.txt` + template — deriva SOMENTE do que aluno/especialista viam na tela), `previsao-cobertura.json` (análise de cobertura), `previsao-recheck.mjs`/`previsao-recheck.json` (verificação independente contra o inventário implementado; os envelopes B entram apenas como diagnóstico pós-hoc, nunca em prompt/inventário).

Regra de proveniência mantida: os parâmetros `mfNum`, `badCount` e `doubleDiv` da tabela mass-production materializam apenas nas buggy edges dos BRDs (gabarito) e foram BANIDOS dos fatos de interface reconstruídos — a proibição está travada por teste (`__tests__/interface-reconstruction.test.mjs`). Ver [docs/PROTOCOLO-CAMPANHA-5.md](docs/PROTOCOLO-CAMPANHA-5.md).
