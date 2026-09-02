# Campanha dos nove corpora — 24 de agosto de 2026

> **Origem.** Executada no repositório da plataforma (`sti-unplugged`, branch
> `codex/ux-foundation-20260809`), com o executor
> `backend/evaluation/validacao_ctat_2026/run-benchmark.mjs`. Este arquivo e o
> JSON ao lado são a cópia citável dos agregados; a saída bruta, 44 MB, não é
> versionada em nenhum dos dois repositórios.

Campanha iniciada 10:53:49 UTC, fechada **16:09:54 UTC**. Dez braços executados em
sequência por `results/_campanhas/rodar.sh`, mais quatro braços anteriores já em disco.

Dados brutos: `backend/evaluation/validacao_ctat_2026/results/_campanhas/*.json` no repositório da plataforma (`sti-unplugged`), fora do controle de versão por serem 44 MB.
Espelho estruturado desta tabela: [`resultados-16-bracos.json`](resultados-16-bracos.json).

Protocolo congelado em o protocolo congelado em [`protocol/frozen/`](../../protocol/frozen/). Instrumento na versão pós-Emenda 4
do pré-registro (`docs/METODOLOGIA-DETALHADA.md`).

---

## Tabela completa

Três réplicas por problema, mediana reportada. Intervalo por bootstrap de cluster,
10.000 iterações, semente 42. Valores em porcentagem.

| pacote | braço           | modelo        | n   | Q1   | Q2       | Q2 união | Q3a      | Q3b      | Q3c  | Q4   | Q4 esp. | Q5       |
| ------ | --------------- | ------------- | --- | ---- | -------- | -------- | -------- | -------- | ---- | ---- | ------- | -------- |
| 6.17   | controle        | flash-lite    | 24  | 100  | 40,7     | 71,5     | **97,2** | 22,6     | 31,4 | 61,4 | 76,5    | 78,9     |
| 6.17   | tela            | flash-lite    | 24  | 95,8 | 53,8     | 71,3     | 68,1     | 44,2     | 32,9 | 70,6 | 76,5    | 56,3 ⚠   |
| 6.18   | controle        | flash-lite    | 20  | 100  | 37,5     | 64,2     | 32,0     | 5,3      | 33,0 | 64,1 | 35,8    | 76,5     |
| 6.18   | tela            | flash-lite    | 20  | 100  | 32,5     | 52,5     | 48,1     | 5,9      | 21,6 | 60,8 | 35,8    | 63,4     |
| 6.27   | controle        | flash-lite    | 16  | 100  | 20,8     | 56,3     | 39,7     | 14,3     | 26,0 | 96,4 | 66,7    | 73,1     |
| 6.27   | tela            | flash-lite    | 16  | 100  | **54,2** | **83,3** | 44,0     | 10,4     | 12,5 | 97,0 | 66,7    | 61,0     |
| 7.12   | controle        | flash-lite    | 18  | 100  | 20,4     | 61,1     | 41,5     | 14,6     | 18,3 | 91,4 | 66,7    | 75,2     |
| 7.12   | tela            | flash-lite    | 18  | 100  | **55,6** | **88,9** | 51,4     | 15,7     | 14,0 | 94,4 | 66,7    | 56,6     |
| 7.15   | controle        | flash-lite    | 11  | 100  | 0,0      | 6,8      | 15,6     | 16,7     | 27,5 | 100  | 100     | 90,5     |
| 7.15   | tela            | flash-lite    | 11  | 100  | 16,7     | 30,3     | 29,2     | 5,1      | 9,3  | 98,0 | 100     | 77,2     |
| 8.12   | controle        | flash-lite    | 19  | 100  | 12,4     | 42,6     | 48,7     | 3,0      | 23,9 | 89,6 | 96,7    | 88,3     |
| 8.12   | tela            | flash-lite    | 19  | 100  | 33,4     | 68,4     | 37,3     | 9,7      | 1,9  | 95,5 | 96,7    | 87,9     |
| 8.12   | tela            | **qwen3-max** | 18  | 100  | 37,2     | 53,6     | **50,5** | **33,9** | 28,7 | 56,9 | 96,5    | **92,0** |
| 6.21   | fora do desenho | flash-lite    | 11  | 100  | 1,5      | 3,0      | 18,6     | 0,0      | 5,6  | 94,1 | 72,7    | 83,4     |
| 8.11   | fora do desenho | flash-lite    | 17  | 100  | 0,0      | 1,0      | 14,5     | 0,0      | 2,1  | 91,2 | 70,6    | 83,3     |
| 6.05   | fora do desenho | flash-lite    | 8   | 100  | 0,0      | 2,5      | 20,6     | 0,0      | 28,3 | 91,1 | 66,7    | 80,5     |

⚠ 6.17 tela: o juiz cego reprovou no controle de distratores (aprovou 91,7% dos
"valor impossível"). O Q5 desse braço está reportado e **não vale como evidência**.

**Legenda.** Q1 integridade estrutural · Q2 cobertura direcional dos erros
(Tversky α=0, β=1) · Q2 união = união das três réplicas · Q3a inclusão de traço
(subsequência comum sobre o caminho vivido do especialista) · Q3b ancoragem
posicional dos erros · Q3c dicas no passo certo · Q4 remediação adequada
(substância, dirigido, anti-revelação) · Q4 esp. = a mesma régua nas mensagens do
especialista, como referência · Q5 juiz cego sobre os erros extras do robô.

**Veredito de não inferioridade: `inconclusivo_sem_banda_hh` em todos os braços.**
Sem um segundo autor humano no CTAT não existe banda de concordância humano-humano,
e sem ela nenhum veredito é emitido. Decisão pré-registrada.

---

## Efeito da tela, pareado por pacote

Cinco pacotes rodaram os dois braços. Diferença em pontos percentuais, tela menos controle.

| pacote    | Q2        | Q3a       | Q3b   | Q4   |
| --------- | --------- | --------- | ----- | ---- |
| 6.17      | +13,1     | **−29,1** | +21,6 | +9,2 |
| 6.18      | −5,0      | +16,1     | +0,6  | −3,3 |
| 6.27      | **+33,4** | +4,3      | −3,9  | +0,6 |
| 7.12      | **+35,2** | +9,9      | +1,1  | +3,0 |
| 7.15      | +16,7     | +13,6     | −11,6 | −2,0 |
| **média** | **+18,7** | +3,0      | +1,6  | +1,5 |

**Cobertura de erros:** sobe em 4 dos 5 pacotes, e sobe muito onde a tela tem menu de
operação (6.27 e 7.12, mais de 33 pontos). É o efeito mais robusto da campanha.

**Fidelidade de caminho:** sobe em 4 dos 5. A média é puxada para baixo pelo 6.17,
que sozinho perde 29 pontos. Ver anomalia abaixo.

**Ancoragem posicional:** sem padrão. Sobe em três, cai em dois. Continua sendo a
métrica mais fraca do estudo e a mais contaminada pelo defeito de ordenação
(dificuldade 11 do documento de metodologia).

---

## Anomalia do 6.17, com causa identificada

O 6.17 é o único pacote em que dar a tela **derruba** a fidelidade de caminho, e a
queda é grande: 97,2% para 68,1%.

Causa verificada no arquivo. O caminho correto do 6.17 tem oito arestas, e **três
delas são executadas pelo Tutor**, não pelo aluno:

```
numline            = "1/4"   ator = Student
F1                 = "1"     ator = Student
F2                 = "4"     ator = Student
denom              = "4"     ator = Student
showAnswer         = "1/4"   ator = Tutor
writeFractionStep  = ""      ator = Tutor (unevaluated)
numline            = "1"     ator = Tutor (unevaluated)
done               = "-1"    ator = Student
```

A régua já remove as ações do tutor do lado do especialista, então o caminho vivido
dele tem só 3 estados. Mas a lista de campos entregue ao robô inclui `showAnswer` e
`writeFractionStep`, e a regra forte manda **um passo por campo**. O robô então autora
passos para campos que o aluno nunca toca, o caminho dele fica poluído, e a
subsequência comum sobre um denominador de 3 estados despenca.

Sem a tela, o robô inventa a própria decomposição, produz poucos passos, e por acaso
bate nos 3 estados que importam. Daí os 97,2%, que são altos por vacuidade e não por
qualidade.

**Correção proposta:** filtrar da lista de campos os que não são acionáveis pelo aluno.
Ressalva de método: o campo `actor` é lido do `.brd`, e o 6.17 não tem HTML de interface.
Usar essa informação para filtrar precisa ser declarado como emenda antes de rodar.

---

## Anomalia do 7.12, sem causa identificada

O 7.12 é o único braço em que a tela sobe **todas** as métricas, inclusive a ancoragem
posicional, que cai nos outros. E ele é justamente um dos pacotes com correlação
**negativa** (−0,64) entre a ordem da lista entregue ao robô e a ordem real de
resolução.

Isso contraria a hipótese de que a ordem embaralhada é a causa principal do Q3b baixo.
Hipótese alternativa não testada: o efeito da ordem depende do tamanho da tela, e o
7.12 tem 11 campos contra 25 do 8.12. **Pendente de investigação.**

---

## Efeito do modelo, 8.12 com tela

| métrica               | flash-lite | qwen3-max | diferença |
| --------------------- | ---------- | --------- | --------- |
| conhece os erros (Q2) | 33,4       | 37,2      | +3,8      |
| mesmo caminho (Q3a)   | 37,3       | 50,5      | +13,2     |
| na hora certa (Q3b)   | 9,7        | 33,9      | **+24,2** |
| dicas no lugar (Q3c)  | 1,9        | 28,7      | +26,8     |
| juiz cego (Q5)        | 87,9       | 92,0      | +4,1      |
| respostas truncadas   | 6          | 1         | −5        |
| remediação (Q4)       | 95,5       | 56,9      | **−38,6** |

Cinco de seis melhoram. A queda do Q4 tem explicação medida: o modelo forte escreveu
**23 mensagens** onde o pequeno escreveu 4. Por critério: substância 23/23,
anti-revelação 21/23, **dirigido ao passo apenas 10/23**. Não está resolvido se é perda
real de qualidade ou a régua penalizando estilo mais conversacional. Exige leitura
manual das 23 mensagens.

---

## Análise complementar: quanto vale arrumar a ordem dos campos

Medido sobre os 18 problemas do 8.12 com qwen3-max em que o robô emitiu exatamente um
passo por campo. Reordenando **os mesmos valores** pela ordem real da tela, sem tocar
no agente:

```
acerto campo a campo ..................... 67,6%
Q3a como está hoje ....................... 50,5%
Q3a só reordenando ....................... 67,6%   (+17,1 pontos)

dos 146 campos errados que sobram:
   92 são campo de fator de escala  (63%)
   54 são todo o resto
```

Teto estimado se o `100` impresso na tela também fosse entregue: cerca de **88%** de
acerto campo a campo. É limite superior, não previsão.

---

## Custo e saúde da execução

| braço         | truncamentos | custo (US$) |
| ------------- | ------------ | ----------- |
| 7.15 controle | 2            | 1,02        |
| 7.15 tela     | 3            | 1,79        |
| 6.27 controle | 5            | 1,29        |
| 6.27 tela     | 1            | 1,40        |
| 7.12 controle | 6            | 1,68        |
| 7.12 tela     | 4            | 1,85        |
| 6.18 controle | 3            | 1,67        |
| 6.18 tela     | **0**        | 1,85        |
| 8.12 controle | 3            | 1,72        |
| 6.17 controle | 5            | 2,00        |

Total dos dez braços: **US$ 16,27**. Nenhuma falha de problema, nenhum problema inapto
nos pacotes dentro do desenho.

---

## Perda de dados a registrar

Os JSONs brutos de **dois braços foram sobrescritos** durante esta campanha:

- `8.12 tela flash-lite`
- `6.17 tela flash-lite`

Causa: `rodar.sh` copia `results/<dom>/<modelo>/campanha.json` para
`results/_campanhas/<rótulo>.json` depois de cada braço, e o executor grava sempre no
mesmo caminho por domínio e modelo. Quando os braços de controle desses dois pacotes
rodaram no fim da fila, sobrescreveram o arquivo do braço com tela.

**Os agregados dos dois braços estão preservados** nesta tabela e no JSON espelho,
lidos antes da sobrescrita. O que se perdeu é o detalhe por problema: traces, catálogos
de erro por caso, julgamentos individuais do juiz.

**Consequência prática:** análises por problema desses dois braços exigem re-execução.
As análises agregadas continuam válidas.

**Conserto no executor, pendente:** gravar em caminho que inclua o braço, por exemplo
`results/<dom>/<modelo>/<braço>/campanha.json`.

---

## O que está travado e não deve mudar antes da próxima rodada

1. Protocolo de análise (PROTOCOLO.md), semente 42, três réplicas.
2. Ordem dos campos no Envelope A, com o defeito ativo. Todos os números de Q3b acima
   são **piso**.
3. O prompt do desenhista de interface, com a numeração duplicada de regras.
4. As três correções propostas (ordem visual, texto fixo da tela, agrupamento em linhas)
   e o quarto braço de teto contaminado, todos pendentes de emenda declarada.
