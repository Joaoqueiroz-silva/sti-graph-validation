# Validade preditiva — erros REAIS de alunos vs grafos dos STIs publicados (2026-08-14)

**Pergunta**: os erros que os grafos preveem são os que alunos de verdade
cometem? Método padrão da literatura de catálogos de erro (Brown & Burton
1978; VanLehn 1990; Payne & Squibb 1990): confrontar o catálogo com o log de
comportamento real. Estudo RETROSPECTIVO (primeiro corte;
`analysis/validacao-preditiva-alunos.mjs`; fontes da produção somente leitura,
sha256 em `metricas.json`; ids de aluno/sessão jamais entram na saída).

**Amostra**: 549 respostas erradas reais com `answer_given`; 476 avaliáveis
(tutor publicado + grafo localizado; `problem_id` casa por id do problema, não
por índice — ver comentário no script).

## Resultados

| Métrica | Todos (n=476) | 1ª tentativa (n=253) |
|---|---|---|
| Erro real ANTECIPADO no passo exato pelo grafo | **34,6%** | 33,5% |
| Antecipado em algum passo do problema | 35,7% | 35,6% |
| Runtime atribuiu diagnóstico específico | 26,1% | 24,9% |
| Runtime atribuiu diagnóstico genérico | 8,2% | 7,5% |
| Runtime não reconheceu nada | 65,8% | 67,6% |
| Por geração do tutor | abr: 33,1% | mai: **40,4%** |
| Utilização: branches acionados por algum aluno (34 tutores, ≥5 erros) | 23,7% (174/733) | — |

## Leitura

1. **34,6% de antecipação no passo exato está NA FAIXA da literatura clássica**
   de catálogos construídos por especialistas humanos (tipicamente 1/3 a 1/2
   dos erros observados; o resto é slip não-sistemático — Norman 1981). Os
   agentes, no primeiro corte e sem ajuste, performam no padrão histórico da
   área.
2. **Lacuna de matching no runtime**: o grafo previa o erro no passo em 34,6%
   dos casos, mas o motor só deu diagnóstico específico em 26,1% — inclusive 9
   casos com match BYTE-IDÊNTICO sem diagnóstico registrado. Lead concreto de
   correção na plataforma (investigação aberta no repo do EducaOFF).
3. **O tráfego ainda não conheceu a melhor geração**: quase todos os erros vêm
   de tutores de abr–mai/2026; a geração pós-PR#27 (86–93% de passos com
   diagnóstico) quase não tem interações registradas.
4. **Limites**: n=476; retrospectivo (sem controle temporal de atualizações de
   grafo); nenhum branch com marca de colheita foi encontrado, mas colheita sem
   marca inflaria levemente a antecipação — o desenho PROSPECTIVO pré-registrado
   (congelar grafos por hash, quarentena da colheita, limiares declarados antes
   do tráfego) é o próximo passo e a versão com força de artigo.

Reproduzir: `node analysis/validacao-preditiva-alunos.mjs --tutores <shared_tutors.json> --interacoes <interactions.json> --json metricas.json`
