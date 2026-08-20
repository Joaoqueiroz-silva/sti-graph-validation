# Catálogo — pacotes públicos do Mathtutor (CMU/TutorShop) para a validação (16/08/2026)

**Fonte:** `https://mathtutor.web.cmu.edu/tutors/packages/<pacote>/` — servido sem
login: `package.xml` (manifesto: nome, enunciado, `.brd`, interface e KCs de cada
problema), `FinalBRDs/*.brd` (grafo do especialista), `HTML/*.html` (interface),
`Assets/`. O conjunto local `frac-numberline-6.17` remete à unidade **6.17
HTML**, mas é uma adaptação EducaOFF e não coincide byte a byte com os
`FinalBRDs` atualmente servidos; veja `PROVENANCE.md`. Os outros quatro
conjuntos do artigo foram ligados aos pacotes remotos por amostras de hash.
Autoria dos pacotes: equipe do projeto Mathtutor/CTAT (CMU; Aleven, McLaren,
Sewall — IEEE TLT 2009), example-tracing por demonstração; não há metadado de
autor individual nos arquivos.

**Cópia local (VPS):** `/root/ctat-pacotes-mathtutor/<pacote>/` — 54 pacotes,
**710 grafos** (.brd), 97 MB, baixados em 15–16/08/2026 (um arquivo por
vez). Perfil por grafo em `catalogo.json` (mesmo conteúdo deste JSON).

**Totais:** 710 grafos; 449 com ramos de erro não mecânicos;
3990 arestas de erro; 19301 passos corretos; 57331 dicas.
Excluídas 8 unidades de tutor baseado em regras (`.nools`, sem grafo).

## O que cada pacote tem (para o desenho do experimento)

Colunas: grafos = problemas únicos; c/erro = grafos com ≥1 erro não mecânico;
passos/erros/dicas = médias por grafo; comps = componentes distintos usados;
ifc = nº de interfaces; nãoNum = fração das respostas corretas que NÃO são número
ou fração (texto/expressão — exige canonização além de `canonAnswer`);
ph = há placeholder `%(…)%` em algum valor de entrada (verificar antes de usar).

### Grupo A — grafo do especialista COM erros (validação completa: estados + erros no estado certo + dicas)

| pacote | unidade | grafos | c/erro | passos | erros | dicas | comps | ifc | nãoNum | ph |
|---|---|---|---|---|---|---|---|---|---|---|
| 6.02 | 6.02 Variables, Expressions, and Values | 11 | 11 | 9 | 4 | 42 | 9 | 1 | 0.0 | não |
| 6.05 | 6.05 Fractions, Decimals, and Percents I | 8 | 8 | 37 | 12 | 162 | 29 | 1 | 0.0 | sim |
| 6.11 | 6.11 Decimal Addition and Subtraction III | 27 | 27 | 55.7 | 2.1 | 133.7 | 62 | 1 | 0.21 | não |
| 6.14 | 6.14 Decimal Division | 5 | 5 | 9 | 2.8 | 28 | 9 | 1 | 1.0 | não |
| 6.16 | 6.16 Area of Polygons | 35 | 35 | 15.9 | 4.4 | 76.8 | 32 | 2 | 0.24 | não |
| 6.17 | 6.17 Fraction Identification | 24 | 24 | 5 | 4.6 | 39 | 5 | 1 | 0.0 | não |
| 6.18 | 6.18 Equivalent Fractions | 20 | 20 | 22 | 2.5 | 63 | 12 | 1 | 0.33 | não |
| 6.19 | 6.19 Fractions and Estimates | 23 | 23 | 11 | 2.3 | 38 | 10 | 1 | 0.41 | não |
| 6.20 | 6.20 Fraction Ordering | 19 | 19 | 8 | 3.9 | 31 | 6 | 1 | 0.16 | não |
| 6.21 | 6.21 Fractions, Decimals, and Percents II | 11 | 11 | 37 | 12 | 162 | 29 | 1 | 0.0 | sim |
| 6.25 | 6.25 Greatest Common Factor | 12 | 12 | 29 | 24.2 | 138 | 37 | 1 | 0.12 | não |
| 6.26 | 6.26 Least Common Multiple | 13 | 13 | 42 | 4 | 90 | 43 | 1 | 0.49 | não |
| 6.27 | 6.27 Factors and Scaling | 16 | 16 | 11 | 6 | 52 | 11 | 1 | 0.2 | não |
| 6.34 | 6.34 Similar Triangles | 32 | 32 | 8 | 6 | 34 | 16 | 1 | 0.29 | sim |
| 7.06 | 7.06 Problem Solving, Equations, and Graphs I | 10 | 10 | 48 | 67 | 184 | 33 | 1 | 0.77 | não |
| 7.07 | 7.07 Graph Interpretation II | 14 | 14 | 9 | 1 | 34 | 9 | 1 | 1.0 | não |
| 7.10 | 7.10 Equations, Graphs, and Negative Slope | 9 | 9 | 48 | 67 | 184 | 33 | 1 | 0.77 | não |
| 7.12 | 7.12 Conversion Factors | 18 | 18 | 11 | 6 | 51 | 11 | 1 | 0.2 | não |
| 7.15 | 7.15 Proportional Reasoning | 11 | 11 | 72 | 25 | 183 | 55 | 1 | 0.6 | não |
| 7.16 | 7.16 Percents | 8 | 6 | 29 | 1 | 101 | 29 | 1 | 0.01 | não |
| 7.52 | 7.52 Solving Linear Equations with Parentheses | 8 | 8 | 93 | 2 | 160 | 25 | 1 | 0.7 | não |
| 7.54 | 7.54 Solving Multi-Step Equations with Parentheses | 13 | 11 | 182.8 | 3.4 | 309.5 | 36 | 1 | 0.73 | sim |
| 8.05 | 8.05 Expressions, Variables, and Distributive Law | 10 | 10 | 8 | 1.5 | 30 | 17 | 1 | 1.0 | sim |
| 8.09 | 8.09 Negative Rational Numbers | 10 | 4 | 28 | 1.2 | 106 | 28 | 1 | 0.14 | não |
| 8.11 | 8.11 Percents Review | 17 | 17 | 37 | 12 | 162 | 29 | 1 | 0.08 | não |
| 8.12 | 8.12 Factors, Scaling, and Percents | 19 | 19 | 25 | 11 | 73 | 25 | 1 | 0.25 | não |
| 8.17 |  | 6 | 6 | 25 | 1 | 70 | 24 | 1 | 0.16 | não |
| 8.21 | 8.21 Pythagorean Theorem | 16 | 16 | 21 | 7 | 86 | 9 | 1 | 0.32 | não |
| 8.22 | 8.22 Area of Polygons and Circles | 34 | 34 | 27 | 8.2 | 108 | 30 | 1 | 0.4 | sim |

### Grupo B — só caminho correto + dicas (entra na régua de estados/dicas; NÃO em "erros no estado certo")

| pacote | unidade | grafos | c/erro | passos | erros | dicas | comps | ifc | nãoNum | ph |
|---|---|---|---|---|---|---|---|---|---|---|
| 6.01 | 6.01 Patterns and Expressions | 25 | 0 | 21.2 | 0 | 74.8 | 16 | 3 | 0.45 | não |
| 6.06 | 6.06 Decimal Place Value I | 9 | 0 | 23 | 0 | 38 | 14 | 1 | 0.27 | não |
| 6.07 | 6.07 Decimal Addition and Subtraction I | 7 | 0 | 29.3 | 0 | 56.7 | 24 | 1 | 0.18 | não |
| 6.08 | 6.08 Decimal Place Value II | 8 | 0 | 23 | 0 | 38 | 14 | 1 | 0.27 | não |
| 6.09 | 6.09 Decimal Addition and Subtraction II | 5 | 0 | 26.4 | 0 | 69.6 | 32 | 1 | 0.17 | não |
| 6.10 | 6.10 Decimal Place Value III | 8 | 0 | 23 | 0 | 38 | 14 | 1 | 0.27 | não |
| 6.15 | 6.15 Using Powers of 10 to Simplify Division | 9 | 0 | 9 | 0 | 25 | 9 | 1 | 0.12 | não |
| 6.24 | 6.24 Ratios | 17 | 0 | 9 | 0 | 25 | 9 | 1 | 0.38 | sim |
| 6.28 | 6.28 Proportions | 17 | 0 | 9 | 0 | 29 | 9 | 1 | 0.18 | não |
| 6.30 | 6.30 GCF/LCM | 11 | 0 | 13 | 0 | 37 | 13 | 1 | 0.26 | não |
| 7.01 | 7.01 Problem Solving and Linear Equations I | 9 | 0 | 15 | 0 | 46 | 15 | 1 | 0.33 | não |
| 7.02 | 7.02 Slope-Intercept Form | 10 | 0 | 7 | 0 | 37 | 13 | 1 | 0.89 | não |
| 7.04 | 7.04 Problem Solving and Linear Equations II | 10 | 0 | 15 | 0 | 48 | 15 | 1 | 0.43 | não |
| 7.05 | 7.05 Graph Interpretation I | 8 | 0 | 30 | 0 | 150 | 15 | 1 | 0.29 | não |
| 7.50 | 7.50 Solving One-Step Linear Equations | 8 | 0 | 17 | 0 | 29 | 9 | 1 | 0.68 | não |
| 7.51 | 7.51 Solving Two-Step Linear Equations | 8 | 0 | 33 | 0 | 57 | 18 | 1 | 0.7 | não |
| 7.53 | 7.53 Solving Multi-Step Linear Equations containing  | 11 | 0 | 160 | 0 | 274 | 26 | 1 | 0.79 | não |
| 8.06 | 8.06 Expressions, Values, and Distributive Law | 9 | 0 | 8.9 | 0 | 29.3 | 9 | 1 | 0.01 | não |
| 8.07 | 8.07 Problem Solving and Distributive Law | 8 | 0 | 15 | 0 | 62 | 15 | 1 | 0.43 | sim |
| 8.14 | 8.14 Percent Change | 8 | 0 | 17 | 0 | 49 | 17 | 1 | 0.0 | não |
| 8.18 | 8.18 Permutations | 8 | 0 | 34 | 0 | 107 | 34 | 1 | 0.32 | não |
| 8.19 | 8.19 Converting between Exponential Forms | 15 | 0 | 9 | 0 | 25 | 13 | 1 | 0.68 | não |
| 8.20 | 8.20 Exponent Product Rule | 7 | 0 | 40 | 0 | 117 | 11 | 1 | 0.62 | não |
| 8.26 | 8.26 Interpreting Box-and-Whisker Graphs | 8 | 0 | 6 | 0 | 41 | 6 | 1 | 0.0 | não |
| 8.28 | 8.28 Comparing Box-and-Whisker Graphs | 8 | 0 | 7 | 0 | 19 | 7 | 1 | 0.33 | não |

## Como usar no experimento (o que muda por pacote)

1. **Envelope A**: enunciado = `description` do manifesto; resposta = extraída do
   `.brd` (mesmo método do 6.17); KCs = `<Skills>`; interface = descrição textual
   neutra escrita a partir do HTML/tela do pacote (uma por pacote; lista branca
   + teste anti-vazamento como em `interface-ctat.js`).
2. **Envelope B**: `.brd` → esquema neutro (mesmo parser). Onde `nãoNum` é alto
   (equações, expressões, texto), definir canonização declarada antes.
3. **Regra de inclusão pré-registrada**: Grupo A entra em todas as métricas;
   Grupo B só em estados/dicas. Pacotes com `ph = sim` são conferidos valor a
   valor antes (placeholder cosmético vs. valor não instanciado).
4. Custo/tempo por pacote no desenho atual (n×3 réplicas×2 braços): ~US$ 0,17
   e ~10 min por problema.

## Ordem sugerida (bloco 1)

6.19 (mesmos enunciados do 6.17, tarefa diferente) → 6.18 e 6.20 (frações,
interfaces novas) → 8.12 e 7.12 (outros tópicos, com erros) → 8.21, 6.27, 6.16/8.22.
