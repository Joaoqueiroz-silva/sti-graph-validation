# Validação de qualidade de grafos: o que a metodologia atual mede e o que falta

> **DOCUMENTO HISTÓRICO.** Descreve o instrumento numa versão anterior ao
> experimento corrigido do artigo v0.6, e cita rodadas e arquivos que foram removidos da
> árvore em 19-20/08/2026 (preservados no histórico git). **Não é o método do
> artigo vigente** — para esse, ver o [README](../README.md) da raiz,
> `docs/AUDITORIA-CIENTIFICA-2026-08-18.md` e os pré-registros.

**Data:** 2026-08-12 · **Escopo:** auditoria da comparação usada nas campanhas 1 a 5,
com medições novas sobre os dados já depositados.

## 1. O diagnóstico

A comparação usada até aqui estabelece correspondência **pelo valor canônico da
resposta errada**. Uma transição de erro do especialista carrega nove
informações: estado de origem, estado de destino, componente da interface, ação,
valor digitado, ator, devolutiva, dicas e componentes de conhecimento. **Apenas o
valor entra na comparação.**

A consequência é que os três grafos abaixo recebem o veredito de acerto perfeito:

1. valor certo ancorado no passo errado;
2. valor certo no componente errado da interface, onde o aluno nunca age;
3. valor certo com devolutiva que não ensina nada.

Portanto: a metodologia atual mede **concordância entre valores de erro**, que é
condição necessária para um grafo bom, e está longe de ser suficiente.

## 2. Os seis níveis

| Nível | Pergunta | Situação |
|---|---|---|
| 0 | o grafo é executável? | medido: 72 de 72 na Campanha 5 |
| 1 | os valores de erro coincidem? | medido: 0,908 na Campanha 5 |
| 2 | o erro está no passo certo? | só calculável com grafo preservado |
| 3 | e no componente e ação certos? | só calculável com grafo preservado |
| 4 | o grafo reage igual ao mesmo aluno? | **medido e não reportado: 0,452** |
| 5 | a devolutiva ensina? | só calculável com grafo preservado |

O nível 4 já está gravado em todos os 72 registros da Campanha 5, no campo
`functionalAgreement`, com média 0,452 e intervalo BCa [0,427; 0,478]. É a medida
mais próxima de qualidade que o estudo já produziu e ela não aparece no
manuscrito.

## 3. O que foi medido em 2026-08-12

### 3.1 Linha de base — a lacuna mais grave

Uma cobertura só significa alguma coisa contra uma referência. Três enumeradores
determinísticos, sem nenhuma IA, recebendo a mesma entrada do agente:

| Sistema | Cobertura (BCa) | Precisão | F1 | Candidatos |
|---|---|---|---|---|
| Enumerador tímido | 0,599 [0,553; 0,635] | **0,694** | **0,637** | 2,9 |
| Enumerador médio | 0,858 [0,762; 0,931] | 0,318 | 0,454 | 10,2 |
| **Agente (config. final)** | 0,908 [0,847; 0,953] | 0,404 | 0,552 | 7,8 |
| Enumerador amplo | **0,957** [0,903; 0,986] | 0,235 | 0,363 | 17,4 |

O agente não vence em nenhuma métrica isolada. Ele fica na **fronteira
eficiente** entre o tímido e o amplo, e domina o médio nos dois eixos. A leitura
defensável é de parcimônia, não de cobertura: cobertura comparável à da
enumeração com metade dos candidatos.

A frase "recupera nove em cada dez erros do especialista" não se sustenta como
evidência isolada, porque a enumeração cega recupera 9,6 em cada dez.

### 3.2 Validação profunda na Campanha 4

A Campanha 4 é a única que preservou os grafos. Sobre 17 casos e 68 comparações:

- nível 1, valor: cobertura 0,197, precisão 0,102;
- nível 2, valor no passo certo por índice bruto: **zero** — nenhum dos 59 pares
  com valor coincidente estava no passo correspondente;
- nível 2b, posição relativa: 25% dentro de ±10% do caminho, 39% dentro de ±15%,
  52% dentro de ±20%; desvio mediano de 16,7% do caminho;
- granularidade: o especialista decompõe em 9 passos e o agente em 3,5, uma
  compressão de 2,6 vezes — que é a causa do zero por índice bruto;
- devolutiva: o especialista menciona o valor errado em 76,4% dos casos e o
  agente em 7,7%; **50,4% das devolutivas do agente são instruções ao professor**,
  contra 0% do especialista;
- 23,1% dos valores de erro do agente não são número nem fração, e sim prosa.

**Ressalva obrigatória:** a Campanha 4 usou o pipeline de produção 3a/3b/3c com
grafo por lote. A configuração do manuscrito é outra e, no nível do valor, saltou
de 0,197 para 0,908. Os níveis 2 a 5 nunca foram medidos nela porque os grafos
não foram guardados.

## 4. Correções recomendadas na análise

1. **Publicar a linha de base** ao lado do agente. Sem ela nenhum número de
   cobertura é interpretável.
2. **Reportar o nível 4** (`functionalAgreement` = 0,452), que já existe.
3. **Trocar F1 por F-beta com β declarado.** F1 supõe que faltar um erro custa o
   mesmo que sobrar um, o que é falso: faltar atinge o aluno em uso, sobrar custa
   segundos do professor na revisão. Com β=2 o valor é 0,727.
4. **Trocar percentil por BCa.** Quinze dos 24 exercícios têm cobertura exatamente
   1,000; o percentil simples é o pior estimador nessa situação. O BCa desloca o
   intervalo de [0,853; 0,957] para [0,847; 0,953].
5. **Reportar micro ao lado de macro** (0,888 contra 0,908).
6. **Registrar o Jaccard** (0,386) como índice único de concordância, notando que
   ele é monotonicamente equivalente ao F1 e não acrescenta informação — o índice
   único pedido já existia no artigo.
7. **Preservar os grafos completos** nas próximas coletas, conforme
   `docs/CONTRATO-RUN-V2.md`.

## 5. O que continua fora de alcance

Nenhuma dessas medidas diz se o erro previsto é pedagogicamente válido, nem se o
tutor resultante ensina. Para isso são necessários julgamento humano cego sobre
os erros excedentes e, principalmente, uma **banda humano–humano**: sem saber o
quanto dois especialistas concordam entre si, 0,908 não tem escala de leitura.
