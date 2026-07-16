# Anotação humana para calibração do juiz (P0-2)

> [!CAUTION]
> **PACOTE HISTÓRICO — CEGAMENTO COMPROMETIDO.** O mapeamento que continha os vereditos do
> juiz foi versionado e ficou acessível no histórico público. Removê-lo da versão atual não apaga
> esse histórico. Portanto, este CSV não pode sustentar uma nova alegação de anotação humana
> independente e cega. Consulte [STATUS.md](STATUS.md) antes de qualquer uso.

## O que é isto

O experimento usa um juiz de IA para decidir se uma resposta errada é uma
misconception que um aluno real cometeria. Para validar esse juiz, precisamos de
julgamentos HUMANOS independentes sobre os mesmos itens: a concordância entre
você e o juiz (estatística kappa) é o que dá validade ao instrumento no artigo.

## Procedimento originalmente planejado (preservado para auditoria)

1. Abra `itens-para-anotacao.csv` (planilha; separador ponto e vírgula).
2. Para cada linha, leia o enunciado, a resposta correta e a resposta errada
   candidata, e pergunte-se: **"um aluno de 6º ano poderia dar essa resposta por
   um raciocínio equivocado plausível?"**
3. Preencha a coluna `seu_julgamento` com `valido` (é um erro plausível de aluno)
   ou `invalido` (aleatório, impossível no contexto, ou é a própria resposta certa).
4. Use `observacao` livremente, principalmente nos casos de dúvida: são os mais
   informativos.

## Regras originalmente planejadas

- O plano exigia julgamento cego, sem abrir o arquivo privado que continha os vereditos do juiz.
  Como esse arquivo já foi exposto no histórico público, essa condição não é mais defensável para
  este pacote.
- Não pesquise os itens em ferramentas de IA; o valor da anotação é ser humana.
- Ritmo sugerido: sessões de 50 itens; anote a data de cada sessão.
- Os itens estão embaralhados com semente fixa (reproduzível) e deduplicados.

## Uso permitido deste pacote

- auditoria da construção histórica dos 370 itens;
- estudo metodológico explicitamente rotulado como retrospectivo/não cego;
- desenvolvimento de um novo instrumento, sem reutilizar estes IDs ou sua ordem como se fossem
  cegos.

Não preencha este CSV para produzir a calibração humana principal da versão v6.0. Uma nova rodada
exige novo conjunto, nova randomização secreta e mapeamento mantido fora do Git, conforme o
protocolo em [STATUS.md](STATUS.md).
