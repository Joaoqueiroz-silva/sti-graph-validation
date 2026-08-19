# 6.20 Fraction Ordering — resultados (coleta 18/08, análise 18/08/2026)

Corpus: `datasets/fraction-ordering-6.20` (19 problemas; Mathtutor/CMU, pacote
"6.20 HTML"; duas retas numéricas, uma por pessoa/quantidade — o aluno divide
cada reta, marca as duas frações e escolhe no seletor quem leu/comeu menos).
Pré-registro e adendo (enunciado declarado, interface, variantes, piloto):
`../PRE-REGISTRO.md`. Agentes: espelho da **produção 132c645**.

- 19 × 3 × 2 = 114 grafos coletados, 114 materializados, **0 falhas**.
  Custo: US$ 0,39 + 2,34 (alunos) + 0,32 + 0,38 (materialização) = **US$ 3,43**.
  (O braço qwen foi refeito uma vez: a primeira tentativa morreu junto com a
  sessão; desde então a cadeia roda como serviço transitório do systemd.)
- Referência: **5 estados de valor** por problema (denominador 1 → ponto 1 →
  denominador 2 → ponto 2 → alternativa escolhida) e 4 erros por problema.
  Primeiro corpus com um estado de valor **textual** (a alternativa).

## 1. Gate de problema fixo — o melhor do bloco

| Braço | estrito | sens. 1 | sens. 2 | sens. 3 |
|---|---|---|---|---|
| flash-lite | 57/57 = **100 %** | 57/57 | 57/57 | **57/57 = 100 %** |
| qwen | 50/57 = 88 % | 52/57 | 53/57 | **53/57 = 93 %** |

## 2. Régua de estados — grafo MATERIALIZADO (recorte sens. 3)

| Métrica | flash-lite (n=57, 19 ex.) | qwen (n=52, 19 ex.) |
|---|---|---|
| **cobertura de estados em ordem (LCS)** | **0,926 [0,888; 0,958]** | **0,946 [0,907; 0,973]** |
| cobertura sem ordem | 0,926 | 0,946 |
| **caminho íntegro em ordem** | **0,632 [0,421; 0,789]** | **0,731 [0,534; 0,865]** |
| **erros no estado certo** | **0,297 [0,219; 0,373]** | **0,619 [0,538; 0,696]** |
| estados/grafo (ref = 5) | 6,09 | 8,13 |
| erros extras/grafo | 5,1 | 8,0 |

Estágio 3 (mínima): cobertura 0,137 / 0,442 — o maior salto materializado−mínima
de todos os corpora (**+0,79 / +0,50**), porque aqui quase todo estado depende
de valor concreto que só o agent 6 escreve.

Nota: cobertura em ordem = cobertura sem ordem (0,926 / 0,946). A tarefa impõe a
sequência (dividir → marcar → dividir → marcar → escolher), então quando o
estado existe, ele está na posição certa — não há penalidade de ordem.

## 3. O estado TEXTUAL (achado do corpus)

O 5º estado é a alternativa escolhida no seletor ("Laura has read less of the
novel."). Como as alternativas visíveis entraram na descrição da interface
(são o que o aluno vê), os agentes as escreveram **no formato exato**: o estado
textual casou em **45 dos 57** grafos qwen. Nos 12 restantes, parte é **escolha
errada da alternativa** — ex.: com 1/4 e 1/5 o agente respondeu "Levar has read
less" quando quem leu menos é Laura. É erro de conteúdo do agente, capturado
pela régua; não é artefato de comparação. Confirma que estados textuais são
avaliáveis quando as alternativas fazem parte da tela.

## 4. Leitura honesta

1. Segundo melhor resultado estrutural do bloco (atrás só do 6.18): ambos os
   braços acima de 0,92 de cobertura, com caminho íntegro 0,63 / 0,73.
2. **Erros no estado certo volta a ser mensurável e alto no qwen (0,62)** — ao
   contrário do 6.18, aqui os erros do especialista têm valor distinto da
   resposta (marcar 0/4, dividir em 1 parte), então a régua funciona.
3. Gate de 98 % no flash-lite: o enunciado declarado (com var1/var2/question)
   fixa os dois denominadores e praticamente elimina invenção de números.
4. Os agentes seguem mais longos que a referência (6,1 e 8,1 estados contra 5).

> **Atualização 19/08/2026 — tabela de gates alinhada à análise vigente.** Os
> valores acima foram corrigidos contra `materializado-v3-fixa-*.analise.json`
> (espelho de produção 5263488): flash-lite passa a 57/57 no gate estrito (era
> 56/57) e o qwen a 52/57 na sensibilidade 1 e 53/57 nas sensibilidades 2 e 3.
> A tabela anterior vinha da análise v2 e ficou defasada quando o espelho foi
> corrigido.
