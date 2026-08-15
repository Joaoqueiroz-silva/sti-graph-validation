# Declaração prévia — rodada 3: passos-livres e comparação por estado/caminho (2026-08-15)

Registrada ANTES de qualquer coleta desta rodada.

## Perguntas

1. **Sem o teto de topologia do GraphForge, os agentes geram MAIS passos?**
   (achado de instrumentação: produção corta reader/medium em 4 passos; ver
   `docs/GUIA-DO-ARTIGO.md` §6). Braços `--fluxo plataforma --passos-livres`
   comparados pareado por exercício com os braços de produção da rodada 2
   (mesmos modelos, mesmos 24×3).
2. **Métricas do orientador**: os estados do caminho de referência do
   especialista existem no grafo do agente, na mesma ordem (subcaminho)? Cada
   elemento — estado, erro, dica — está no ESTADO certo (match binário, sem
   tolerância)? O que o agente cria a mais, por tipo?
   Comparador novo: `analysis/bancada-v2/comparar-caminho.mjs`.

## Braços

| Braço | Configuração |
|---|---|
| **livre-custo-beneficio** (principal) | perfil custo-beneficio (estudantes = gemini-3.1-flash-lite), passos-livres |
| livre-estudantes-qwen | custo-beneficio + `--modelo estudantes=qwen/qwen3-max`, passos-livres |

24 exercícios × **3 réplicas** por braço. Justificativa das 3 réplicas: mesma
potência e mesmo desenho pareado das rodadas 1–2 (comparabilidade); o desvio
padrão ENTRE réplicas passa a ser reportado (métrica nova); 5+ réplicas fica
como braço de sensibilidade se o DP indicar necessidade.

## Métricas pré-declaradas (unidade = grafo gerado; IC BCa por exercício; DP entre réplicas)

- primária estrutural: **cobertura de estados** (subsequência ordenada) e
  **caminho íntegro** (0/1);
- posição: **erros no estado certo** e **dicas no estado certo** (presença por
  estado; texto nunca comparado);
- extras por tipo: estados, erros, dicas (para juízo de valor posterior);
- topologia: passos/grafo no regime livre vs o que a produção aplicaria
  (`topologia.passosQueProducaoAplicaria`, gravado por registro);
- de contraste (não primárias): nível 1 por valor e a bancada v2 com ±0,20.

## Regras

- canonização SÓ em valores dos agentes (0.2 ≡ 1/5); dicas/descrições fora;
- registros gravam `grafo.passos[].valor` (contrato v2 estendido) — sem ele a
  métrica de estados não é calculável; os registros da rodada 2 NÃO têm o
  campo e por isso a comparação de estados é feita SÓ dentro desta rodada,
  enquanto a comparação de nº de passos e as métricas de valor são pareadas
  com a rodada 2;
- gates do piloto: registro passa no contrato; custo/run na ordem de US$
  0,01–0,15; descarte por template baixo.

Orçamento estimado: ~US$ 2,5. Autorização: 2026-08-15 ("pode seguir").
