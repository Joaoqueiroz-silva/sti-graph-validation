# Bateria de validação de qualidade de grafos (v2)

Mede o quanto o grafo gerado pelos agentes se parece com o grafo do especialista,
em **seis níveis de exigência** em vez de um só. Roda offline, sem chave de API e
sem custo.

## Uso

```bash
# campanhas antigas, que preservaram apenas a lista de valores
node analysis/validacao-v2/validar.mjs --legado resultados/campanha5-2026-07-19/6-final-megabrain/runs

# coletas no formato v2, com o grafo completo
node analysis/validacao-v2/validar.mjs --runs resultados/<coleta>/runs --json relatorio.json
```

## O que cada nível responde

| Nível | Pergunta | Precisa do grafo completo? |
|---|---|---|
| 0 | o grafo é executável? | não |
| 1 | o valor do erro coincide? | não |
| 2 | o erro está no passo certo? | **sim** |
| 2b | e corrigindo a diferença de granularidade? | **sim** |
| 3 | e no componente certo da interface? | **sim** |
| 5 | a devolutiva fala com o aluno e cita o erro? | **sim** |

O nível 4, comportamento executável, usa a bateria congelada da Campanha 3
(`battery/`) e o executor de traços, e ainda não está integrado aqui.

## Linha de base

Todo relatório traz três enumeradores determinísticos, **sem nenhuma IA**, que
recebem a mesma entrada do agente: tímido (numerador, denominador, inversão),
médio (todas as frações do denominador) e amplo. Eles existem porque uma
cobertura só significa alguma coisa contra uma referência de comparação.

Medido em 2026-08-12 contra a configuração final da Campanha 5: o enumerador
amplo cobre 0,957 contra 0,908 do agente, com precisão 0,235 contra 0,404. O
mérito do agente está na parcimônia, não na cobertura.

## Verificação

Rodado contra `resultados/campanha5-2026-07-19/6-final-megabrain/runs`, o
nível 1 reproduz cobertura 0,9079, precisão 0,4043, F1 0,5521 e Jaccard 0,3862 —
os mesmos valores dos artefatos depositados.
