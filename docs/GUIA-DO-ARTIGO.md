# Guia do artigo — onde está cada coisa que a escrita vai precisar

**Para quem vai escrever o manuscrito da validação (2026-08-14 em diante).**
Mapa de: seção do artigo → fontes primárias no repositório. O que não está
listado como VIGENTE é histórico preservado (ver `resultados/LEIA-ME.md`).

## 1. Métodos

| Subseção sugerida | Fonte |
|---|---|
| Arquitetura de validade (3 fontes) | `docs/DOSSIE-VALIDACAO-2026-08-14.html` Parte I; `docs/VALIDACAO-QUALIDADE-GRAFOS-V2.md` |
| Instrumentação (port byte a byte, modelos por agente) | `docs/PLANO-PORT-AGENTES-2026-08.md`, `docs/CONFIGURACAO-MODELOS.md`, `producao/COMMIT-FONTE.txt` |
| Registro de execução (o que cada run grava) | `docs/CONTRATO-RUN-V2.md` (+ `docs/CONTRATO-RUN-ETAPAS.md` para a extensão por etapa) |
| Corpus e quarentena A/B | `PROVENANCE.md`, `docs/EXTRACAO-ENUNCIADO-INTERFACE.md` |
| Comparação justa (v2): pareamento, produto, precision@k, TOST | `analysis/bancada-v2/comparar-justo.mjs` (regras pré-declaradas no cabeçalho) |
| Juízes LLM (protocolo, gate, painel) | `analysis/bancada-v2/juiz-cego.mjs`, `analysis/bancada-v2/concordancia-juizes.mjs`; fundamentos no dossiê Parte VI |
| Validação sem CTAT (alunos reais) | `docs/PROTOCOLO-VALIDACAO-ALUNOS-2026-08.md` |
| Fidelidade da cadeia completa (trilha futura) | `docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md` |
| Estatística (BCa, pareada, TOST, Wilson, kappa) | dossiê Partes III–IV; implementações em `analysis/validacao-v2/lib.mjs` e `analysis/bancada-v2/` |

## 2. Resultados — números primários e onde recomputá-los

| Resultado | Valor | Fonte primária |
|---|---|---|
| Réplica da C5 (validação do instrumento) | 7/7 ICs sobrepostos | `resultados/comparacao-modelos-2026-08-14/log-campanha5-final.txt` |
| Efeito do modelo (bancada, pareado) | qwen +0,275; turbo +0,362 | `.../comparacao-cobertura.json` |
| Efeito do fluxo (estágio × produto) | −0,481, perde 24/24 | `resultados/comparacao-fluxo-2026-08-14/comparacao-efeito-fluxo-cobertura.json` |
| Cobertura JUSTA (valor+posição) | qwen 0,501 [0,432; 0,555] | `resultados/bancada-v2-2026-08-14/r1-campanha5-final.json` |
| Equivalência TOST flash-lite × especialista | Δ −0,038 IC90 [−0,073; −0,007] | `resultados/bancada-v2-2026-08-14/r1-custo-beneficio.json` |
| Precisão julgada | 0,75 / 0,68 / 0,65 | `resultados/bancada-v2-2026-08-14/juiz-r1-*.json` + `RESULTADOS.md` (adendo) |
| Kappa entre juízes | 0,656 (705 itens) | `.../juiz*-r1-*.json` via `concordancia-juizes.mjs` |
| Censo da plataforma (868 grafos) | tabela + linha do tempo | `resultados/avaliacao-plataforma-2026-08-14/metricas.json` + `RESULTADOS.md` |
| Antecipação de erros reais | 34,6% (n=476; 1ª tent. 33,5%) | `resultados/validacao-preditiva-2026-08-14/metricas.json` |
| Utilização de branches | 23,7% (34 tutores) | idem |
| Custos por braço/chamada | manifestos | `resultados/*/manifests/*.jsonl` |

Comandos de recomputação estão no fim de cada `RESULTADOS.md`.

## 3. Figuras prontas

O dossiê (`docs/DOSSIE-VALIDACAO-2026-08-14.html`) contém as 7 figuras
(arquitetura, quarentena, injustiças→antídotos, leitura do TOST, apostas,
jornada das réguas, desenho causal) em SVG tema-claro/escuro — copiáveis para
o manuscrito.

## 4. Limitações e pendências a declarar no artigo

1. Banda humano–humano ausente (teto de leitura) — desenho: 2º especialista
   em ~5 exercícios.
2. Desempate humano dos ~17% de desacordos entre juízes (lista item a item
   nos `juiz*-r1-*.json`).
3. Estudo B prospectivo e Estudo C (ablação) ainda não executados — protocolo
   completo em `docs/PROTOCOLO-VALIDACAO-ALUNOS-2026-08.md`.
4. Fluxo-plataforma medido no estágio graphforge (pré-materialização);
   cadeia completa é a trilha do `docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md`.
5. Lacuna de matching do runtime (34,6% antecipado vs 26,1% diagnosticado) —
   investigação aberta no repositório da plataforma.

## 5. Histórico: como citá-lo sem confundir

Os manuscritos v6.0/v7.0 e as campanhas 1–5 são o desenvolvimento do
instrumento. No artigo novo, entram em DOIS papéis: (a) a réplica da C5 como
validação do instrumento; (b) a contradição C4×C5 como o problema que a
rodada 2 resolveu (estágio × produto). Nunca combinar estimativas entre
campanhas de instrumentos diferentes.
