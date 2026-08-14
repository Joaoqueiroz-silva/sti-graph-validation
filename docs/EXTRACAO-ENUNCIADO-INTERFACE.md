# A extração do enunciado e da interface é parte do instrumento

**Data:** 2026-08-14

## 1. O problema

O corpus é engenharia reversa. Em produção, um autor **escreve** o enunciado e
**monta** a interface, e a cadeia recebe isso. No experimento, os dois são
reconstruídos a partir de um tutor já pronto do CTAT — `.brd`, HTML da
interface, tabela de produção em massa.

Ou seja: entre o corpus e os agentes existe uma camada de reconstrução. Ela **é
medida junto** com os agentes, quer se queira ou não. Hoje ela não é auditada,
não é congelada e não aparece nos resultados.

O código dessa camada já existe: `interface-reconstruction.js`,
`interface-inventory.js`, `parse-ctat-brd.js`, e o `envelope-a.json` por
problema.

## 2. Dois riscos opostos, e os dois importam

### Vazamento — a entrada carrega o gabarito

O pacote do CTAT contém o grafo do especialista inteiro: caminho correto,
transições de erro, devolutivas. Se qualquer pedaço disso escorrer para a
entrada, o modelo não está prevendo erro nenhum — está copiando.

Já existe `findLeaksInRobotInput`, o que mostra que a preocupação é antiga. Falta
transformar isso em **número reportado**: quantos exercícios passam limpos, e o
que vazou nos que não passam.

O `envelope-a.json` atual traz `problem`, `profile`, `difficulty`,
`correctAnswer`, `knowledgeComponents` e `components` — e **nenhum passo, nenhum
caminho de solução**. Isso está bem desenhado: a resposta correta é legítima
(o autor sabe a resposta), a decomposição não é, e ela não está lá.

### Empobrecimento — a entrada é pior que a real

O risco espelhado, e o menos óbvio. Se a reconstrução entrega menos do que um
autor entregaria — sem contexto pedagógico, sem intenção de decomposição, sem
série — a cadeia é julgada por uma entrada que ninguém usaria. O sistema parece
pior do que é, e a culpa cai nos agentes.

**Isto é uma explicação concorrente para o colapso do nível 2.** O especialista
decompôs em 9 passos sabendo a intenção pedagógica. Se a entrada reconstruída
não carrega essa intenção, nenhum agente de domínio recupera os 9 passos — e a
falha de ancoragem não seria do agente, e sim da entrada.

Até aqui existem, portanto, **duas explicações vivas** para a granularidade de
~5 contra 9:

1. a bancada não chama o agente de domínio (auditado e confirmado);
2. a entrada reconstruída é mais pobre que a real (não testado).

As duas podem ser verdadeiras ao mesmo tempo.

## 3. O alerta principal para o estudo de fidelidade

O `envelope-a.json` foi construído para a bancada reduzida, que só chamava o
simulador de alunos. **Alimentar o agente de domínio de produção com ele não é
medir produção.**

Antes da Fase 2 de `docs/PLANO-FIDELIDADE-PRODUCAO-2026-08.md`, é obrigatório:

1. **Descobrir o contrato de entrada real da cadeia em produção** — o que o
   agente de domínio recebe de fato quando um autor cria um STI.
2. **Comparar campo a campo** com o `envelope-a.json`.
3. Se divergir, **reextrair no formato de produção**, e não adaptar o agente
   para aceitar o envelope antigo. Adaptar o agente é mudar o sistema medido.
4. Registrar a divergência encontrada, mesmo depois de corrigida. É ela que
   explica por que as campanhas anteriores não são comparáveis com esta.

## 4. As duas auditorias que faltam

### Auditoria de vazamento

Para cada exercício, verificar que nenhum valor de erro, devolutiva ou passo do
grafo do especialista aparece na entrada. Reportar como número, por exercício, no
relatório de resultados. Um vazamento sequer invalida o exercício.

### Auditoria de suficiência

O inverso, e mais difícil de automatizar: dado só o enunciado e a interface
reconstruídos, **um autor competente conseguiria construir o tutor?** Se não
conseguiria, a cadeia está sendo julgada por uma entrada que nenhum autor teria.

Execução mínima: amostra de 8 exercícios, julgamento cego, escala de três pontos
(suficiente / ambíguo / insuficiente). Não precisa ser caro; precisa existir.

## 5. O braço diagnóstico que separa as duas explicações

Um braço extra em que o agente de domínio recebe, junto da entrada normal, a
**quantidade de passos e a lista de componentes de conhecimento do pacote do
especialista**.

- Se a granularidade convergir para ~9 e o nível 2 subir, o gargalo é a
  **entrada**, não o agente.
- Se não convergir, o gargalo é o **agente**, e a entrada está absolvida.

**Este braço usa informação do gabarito e por isso NÃO é uma configuração de
produção.** É diagnóstico, precisa ser rotulado como tal em todo lugar onde
aparecer, e o número dele nunca pode ser reportado como desempenho do sistema.

## 6. O que vai no manuscrito, de qualquer forma

Uma limitação explícita: o corpus é reconstruído por engenharia reversa, de modo
que a comparação é entre **uma cadeia que recebeu uma entrada reconstruída** e
**um especialista que tinha a intenção original**. Isso não invalida o estudo,
mas define o que ele mede — e um parecerista vai perguntar.
