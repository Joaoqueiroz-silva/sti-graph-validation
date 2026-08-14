# Bancada CTAT v2 — comparação justa com o especialista (2026-08-14)

Reanálise PURA (zero chamadas de API) dos cinco braços já coletados, com o
comparador justo `analysis/bancada-v2/comparar-justo.mjs`. Regras
PRÉ-DECLARADAS no código antes de qualquer resultado: tolerância de posição
±0,20 do caminho (primária), margem de equivalência TOST ±0,10 (IC 90%,
bootstrap em cluster de exercício, semente 42), F-beta com β=2.

Antídotos aplicados às injustiças diagnosticadas na bancada v1:
**produto contra produto** (o conjunto candidato inclui o catálogo
stepDiagnostics preservado — limite superior de entrega), **posição relativa**
em vez de índice bruto (imune à granularidade 9×4), **precision@k** no
orçamento do especialista (não pune o sem-teto), **cobertura mútua + TOST**
(simetria: o especialista também é pontuado contra o agente). Convenção de
posição: `(passo−1)/n`, a mesma da referência (estado ANTES do passo);
difere de propósito do 2b histórico (`passo/n`) e está documentada no módulo.

Correção durante a construção (antes de qualquer conclusão): o dedup do
conjunto candidato é por (valor, passo) — dedup só por valor destruía a
diversidade posicional e derrubava a cobertura justa artificialmente.

## Resultados (72 registros/braço; BCa 95%)

| Braço | Cobertura justa (valor+posição) | Cobertura por valor | Simétrica (expert cobre agente) | precision@k | TOST ±0,10 |
|---|---|---|---|---|---|
| r1 custo-beneficio (flash-lite, bancada) | 0,354 [0,309; 0,403] | 0,481 | 0,392 | 0,337 | **EQUIVALENTES** (Δ −0,038 [−0,073; −0,007]) |
| r1 campanha5-final (qwen, bancada) | **0,501 [0,432; 0,555]** | 0,758 | 0,213 | 0,156 | não (Δ +0,288 — agente MAIS amplo) |
| r1 turbo (3.5-flash, bancada) | 0,427 | 0,977 | 0,158 | 0,047 | não (Δ +0,269 — idem) |
| fluxo custo-beneficio (estágio graphforge) | 0,003 | 0,156 | 0,003 | 0,003 | equivalência degenerada (≈0×≈0; sem valor) |
| fluxo estudantes-qwen (estágio graphforge) | 0,208 | 0,416 | 0,146 | 0,121 | EQUIVALENTES (Δ +0,062 [+0,029; +0,098]) |

## Leitura

1. **Na régua justa, o melhor braço cobre METADE dos erros do especialista no
   lugar certo** (qwen: 0,501 [0,432; 0,555]) — contra o "nível 2 ≈ 0" da
   régua antiga. A injustiça de granularidade respondia por quase toda a
   diferença.
2. **O braço flash-lite da bancada é ESTATISTICAMENTE EQUIVALENTE ao
   especialista na cobertura mútua** (TOST dentro de ±0,10): ele cobre o
   especialista na mesma medida em que é coberto por ele (0,354 × 0,392) — um
   par parcimonioso de apostadores comparáveis. Primeira equivalência formal
   agente–especialista do projeto.
3. **Qwen e turbo falham a equivalência NA DIREÇÃO DA AMPLITUDE** (Δ positivo:
   cobrem o especialista bem mais do que são cobertos). Não é "pior que o
   especialista" — é mais amplo que ele; se os extras são válidos, só o juízo
   cego (próxima peça) decide.
4. **precision@k baixa no turbo/qwen é limitação declarada do ranking**: o
   registro não guarda a confiança do modelo por erro; o k usa a ordem do
   grafo, que não é um ranking. Campo futuro no contrato (ordem de prioridade
   do 3b) resolveria.
5. **Os braços do fluxo-plataforma continuam baixos mesmo na régua justa** —
   confirma que o achado da rodada 2 (estágio magro) não era artefato do
   comparador; a comparação de produto de verdade precisa da cadeia completa
   (trilha de docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md).

## O que falta para fechar a bancada v2 (peças com dependência externa)

- **Juízo cego dos extras** (precisão julgada): infraestrutura de juiz do repo,
  custo pequeno de API — decide se a amplitude do qwen/turbo é riqueza ou ruído.
- **Banda humano–humano**: segundo especialista em ~5 exercícios (única peça
  que exige humano); vira o teto de leitura de toda a tabela acima.

Reproduzir: `node analysis/bancada-v2/comparar-justo.mjs --runs <braço>/runs --json out.json`
(testes: `__tests__/bancada-v2.test.mjs`).
