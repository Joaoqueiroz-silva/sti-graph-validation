# Restrições de interface por tela

> **Origem.** Implementado no repositório da plataforma (`sti-unplugged`), em
> `backend/evaluation/validacao_ctat_2026/`. Os caminhos de arquivo citados
> abaixo são relativos àquele repositório. Esta cópia existe para o artigo poder
> citar o desenho; o código ainda não foi portado para cá.

Implementação da orientação acadêmica de 26/08/2026: descrever melhor a tela para
que os agentes, que são cegos, autorem como se a enxergassem.

Data: 27/08/2026. Suíte: 1071 testes verdes, 114 arquivos.
**Nada foi rodado em campanha.** O braço existe, está testado, e espera decisão.

---

## O que foi pedido, e onde está cada item

| pedido                                       | onde ficou                                                 |
| -------------------------------------------- | ---------------------------------------------------------- |
| Restrições de valores por campo              | `campos[].restricoes` de cada `restricoes/<pacote>.json`   |
| Ordem de preenchimento                       | `ordemDePreenchimento.niveis`, em etapas                   |
| Escopo por tela, não regra genérica          | um arquivo por pacote, extraído do HTML daquele pacote     |
| Formato JSON estruturado                     | `restricoes/*.json`, nove arquivos                         |
| Prompt que força sequência                   | `blocoDeRestricoes` em `agents/nodes/agents3-students.js`  |
| Script documentado para revisão              | `src/restricoes-de-tela.js` + `src/extrair-restricoes.mjs` |
| **Não** incluir o passo a passo da resolução | ver "A linha", abaixo                                      |

---

## Como rodar

```bash
node src/extrair-restricoes.mjs                 # gera restricoes/*.json
node src/extrair-restricoes.mjs --conferir      # confere e NÃO grava
node src/extrair-restricoes.mjs --prompt 8.12   # mostra o bloco que iria ao agente

node run-benchmark.mjs --domain 8_12 --model gemini-flash-lite --com-restricoes
```

---

## A linha: o que entra e o que não entra

A única fonte permitida é o HTML que o aluno renderiza. Nada vem do `.brd`, que é
o grafo do especialista, nem do `package.xml`, que é o manifesto autorado.

Isso não é escrúpulo. A auditoria de 26/08 mediu que um agente-papagaio de três
linhas, ecoando só literais impressos na tela do 8.12, tira **53,7%** na métrica
primária de cobertura, batendo todos os agentes reais. Informação de tela, mal
escolhida, é gabarito com outro nome.

Por isso todo campo emitido carrega `evidencia.fonte`, de vocabulário fechado, e
`evidencia.trecho`, com o texto literal. Um revisor derruba qualquer inferência
sem ler código: basta filtrar por fonte.

Força da evidência, da mais forte para a mais fraca:

| fonte                 | o que é                                              | exemplo                                                         |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `atributo-ctat`       | o autor da interface DECLAROU                        | `tabindex="4"`, `min="1" max="20"`, `data-ctat-labels="--,*,/"` |
| `classe-ctat`         | o tipo do widget define o espaço de resposta         | `CTATComboBox`, `CTATDoneButton`                                |
| `estrutura-tabela`    | linha, célula, `=` impresso, empilhamento por `<hr>` | a célula à direita do `=`                                       |
| `cabecalho-de-coluna` | o rótulo que o aluno lê no topo                      | `<th>Reduced Fraction</th>`                                     |
| `convencao-de-id`     | inferência pelo nome do identificador                | `...scalefactor...` é número                                    |

### O que foi deliberadamente deixado de fora

**Faixa de valor inferida das respostas.** Um campo de porcentagem não vira
"0 a 100", porque nada na tela diz isso e o corpus tem 152% e 270%. Faixa só sai
quando o HTML a escreve, e nos nove pacotes isso acontece em três campos, todos
do 6.18.

**A instrução de método impressa na tela.** O 8.12 tem, escrito na tela,
_"Using the method of equivalent fractions"_. O aluno lê. Mas isso não é restrição
estrutural, é prescrição de método, e a **Emenda 4.7 do pré-registro já declarou,
antes de qualquer medição**, que informar o método ao agente é entregar o gabarito.
Fica atrás de uma opção explícita (`comInstrucaoDaTela`), desligada por padrão,
para poder virar um braço declarado e nunca entrar por acidente.

**Valores literais impressos.** O `100` sob a fração do 8.12 coincide com resposta
de passo do especialista. Ele é capturado no modelo, para inspeção humana, e não
vai para o prompt. Um teste trava isso.

> Este último ponto pegou um erro meu durante a implementação: eu tinha escrito o
> formato do campo de numerador como `"numerador da fração de denominador 100"`,
> o que entregava o literal pela porta dos fundos. O teste de fronteira reprovou e
> o formato virou nulo. Fica registrado porque é a demonstração de que a linha
> precisa de teste, não de boa intenção.

---

## Como a ordem é derivada

Em ordem de prioridade:

**1. `tabindex`.** É a ordem de tabulação que o autor da interface escreveu no
HTML. Existe em 7.15, 6.27 e 7.12. É a evidência mais forte possível: não é
inferência nossa, é declaração dele. No 7.12, a ordem de tabulação declarada
(`OV1, OV2, CV1, SO1, SF1, SO2, SF2, CV2`) coincide exatamente com o caminho que
o especialista percorreu.

**2. Grafo de dependência**, ordenado topologicamente e desempatado pela posição
no documento. As dependências vêm de construções explícitas:

- `data-ctat-ctrl-denominator="X"`: o campo depende de X. No 6.18 é isso que
  declara que não dá para marcar o ponto antes de dividir a reta.
- `data-ctat-target="X"` num botão de confirmação.
- célula à direita de um `=` impresso depende das células à esquerda.
- coluna à direita, na mesma linha de tabela com cabeçalho, depende das anteriores.
- o `CTATDoneButton` depende de todo campo que carrega valor, por definição do widget.

**3. Posição no documento**, quando não há nem tabindex nem dependência.

### A saída é em ETAPAS, não em fila

Campos na mesma etapa podem ser preenchidos em qualquer ordem entre si; nenhum
campo da etapa N pode vir antes de a etapa N-1 estar completa.

A forma é deliberada. Forçar fila linear onde a tela permite escolha seria
inventar restrição, e restrição inventada sobre ordem é, na prática, ditar o
caminho de solução. Etapas dizem o que a tela realmente impõe.

No 8.12 isso dá quatro etapas para 25 campos: dezoito campos de entrada em
qualquer ordem, depois os três numeradores escalados, depois as três
porcentagens, depois concluir.

---

## O que saiu de cada tela

| pacote | campos | escolha fechada | com faixa | com dependência | etapas | ordem por    | tipo por convenção | alinhados ao Envelope A |
| ------ | ------ | --------------- | --------- | --------------- | ------ | ------------ | ------------------ | ----------------------- |
| 6.17   | 0      | 0               | 0         | 0               | 0      | indisponível | 0                  | —                       |
| 6.18   | 12     | 1               | 3         | 7               | 3      | dependência  | 0                  | 9/12                    |
| 6.21   | 30     | 0               | 0         | 25              | 8      | dependência  | 0                  | 29/29                   |
| 6.27   | 8      | 0               | 0         | 1               | 8      | tabindex     | 7                  | 8/11                    |
| 7.12   | 10     | 2               | 0         | 1               | 10     | tabindex     | 7                  | 10/11                   |
| 7.15   | 66     | 1               | 0         | 51              | 66     | tabindex     | 40                 | 46/55                   |
| 8.11   | 30     | 0               | 0         | 25              | 8      | dependência  | 0                  | 29/29                   |
| 8.12   | 25     | 6               | 0         | 7               | 4      | dependência  | 18                 | 25/25                   |
| 6.05   | 30     | 0               | 0         | 25              | 8      | dependência  | 0                  | 29/29                   |

**O 6.17 não tem interface no corpus.** O `_interface/interface.html` dele tem
dois identificadores, nenhum deles campo, e o enunciado que carrega é de outro
problema (um caso veterinário sobre furões). O JSON dele sai com
`interfaceDisponivel: false` e a lista de nomes que o Envelope A já conhecia, sem
afirmar tipo nem ordem. **Este braço não se aplica ao 6.17**, e isso precisa
constar em qualquer comparação entre pacotes.

---

## Divergências entre a tela e o grafo, que são achado e não erro

O alinhamento com o Envelope A revela onde a tela e o grafo do especialista
discordam sobre o que existe. Não foi corrigido em silêncio.

**7.15:** vinte campos existem na tela e o especialista nunca os tocou (a primeira
linha de cada opção, e as colunas `firstLeft`, `secondLeft`, `thirdLeft`,
`fourthLeft`). É a explicação estrutural de por que a regra de "um passo por
campo" precisou de escape: nenhum problema deste pacote usa todos os campos.

**6.27:** `SO1` e `SO2` estão no grafo do especialista mas são `CTATTextField` no
HTML, ou seja, exibição e não campo. No 7.12, os mesmos dois são `CTATComboBox`.
A diferença entre os dois pacotes é exatamente essa.

**6.18:** `shield`, `R1` e `equals` estão no grafo e são exibição na tela;
`submit0`, `submit1` e `submit2` estão na tela e não no grafo.

---

## Mudanças no código

| arquivo                                 | o que mudou                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/restricoes-de-tela.js`             | **novo.** Extrator, vocabulários fechados, derivação de ordem, alinhamento, renderização para prompt                |
| `src/extrair-restricoes.mjs`            | **novo.** CLI com `--conferir` e `--prompt`                                                                         |
| `restricoes-de-tela.test.mjs` (plataforma) | **novo.** 23 testes, a maioria travando a fronteira e não a funcionalidade                                          |
| `agents/nodes/agents3-students.js`      | `blocoDeRestricoes`, usado só quando `state.restricoesDeTela` existe. O caminho antigo fica byte a byte como estava |
| `evaluation/simulate-students-real.js`  | passa o modelo adiante quando o braço o pede                                                                        |
| `src/run.js`                            | repassa a opção; **e conserta** o spread que descartava o manifesto de proveniência                                 |
| `run-benchmark.mjs`                     | flag `--com-restricoes`; **e o braço passa a entrar no nome do arquivo**                                            |

Os dois consertos marcados em negrito são dívidas conhecidas que estavam na lista
de pendências e couberam aqui:

- `gravarCampanha` escrevia `{ manifesto, ...payload }`, e como `payload` carrega
  a própria chave `manifesto`, o spread sobrescrevia o objeto enriquecido. Os
  treze arquivos de campanha gravados até 24/08 estão sem `gravadoEm`, sem `node`
  e sem `registryHash`. A partir de agora saem com.
- todos os braços de um mesmo domínio e modelo gravavam em `campanha.json`. Foi
  o que custou os dois JSONs brutos em 24/08. O braço agora entra no nome, e o
  braço padrão continua em `campanha.json` para não quebrar ponteiro existente.

---

## Fumaça, e só fumaça

Uma corrida de **um problema, uma réplica**, no `office picnic` do 8.12 com
`gemini-flash-lite`:

```
sem a regra de cobertura ...  8 passos   Q3a 0,417   Q2 0,75
com a regra de cobertura ... 25 passos   Q3a 0,667   Q2 0,50
```

A primeira versão do bloco tinha só a regra de sequência e perdeu a regra de
"um passo por campo" que o bloco antigo tinha. O agente devolveu 8 passos para
uma tela de 25 campos. A regra foi reposta.

**Isto é teste de encanamento, não evidência.** Um problema, uma réplica, num
processo estocástico. Na semana passada eu generalizei uma medição de um pacote
só e a auditoria derrubou; não repito.

---

## O que precisa acontecer antes de virar campanha

1. **Emenda 5 no pré-registro**, declarando o braço, o que ele entrega, o que ele
   deliberadamente não entrega, e o critério de aceite antes de rodar.
2. **Piso do agente-papagaio publicado**, por métrica e por pacote. Sem ele o
   ganho não é interpretável, porque parte dele pode ser eco de literal de tela.
3. **Braço placebo**: mesma quantidade de texto de restrição, com a ordem
   embaralhada por semente registrada. Se as métricas subirem igual, o ganho é de
   formato e não de conteúdo.
4. Decidir o que fazer com o **6.17**, que não pode entrar neste braço.
