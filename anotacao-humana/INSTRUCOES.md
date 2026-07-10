# Anotação humana para calibração do juiz (P0-2)

## O que é isto

O experimento usa um juiz de IA para decidir se uma resposta errada é uma
misconception que um aluno real cometeria. Para validar esse juiz, precisamos de
julgamentos HUMANOS independentes sobre os mesmos itens: a concordância entre
você e o juiz (estatística kappa) é o que dá validade ao instrumento no artigo.

## Como anotar

1. Abra `itens-para-anotacao.csv` (planilha; separador ponto e vírgula).
2. Para cada linha, leia o enunciado, a resposta correta e a resposta errada
   candidata, e pergunte-se: **"um aluno de 6º ano poderia dar essa resposta por
   um raciocínio equivocado plausível?"**
3. Preencha a coluna `seu_julgamento` com `valido` (é um erro plausível de aluno)
   ou `invalido` (aleatório, impossível no contexto, ou é a própria resposta certa).
4. Use `observacao` livremente, principalmente nos casos de dúvida: são os mais
   informativos.

## Regras de ouro

- Julgue às cegas: NÃO abra o arquivo `PRIVADO-mapping-*.json` antes de terminar
  (ele contém os vereditos do juiz de IA; vê-los antes ancora o seu julgamento e
  invalida o kappa).
- Não pesquise os itens em ferramentas de IA; o valor da anotação é ser humana.
- Ritmo sugerido: sessões de 50 itens; anote a data de cada sessão.
- Os itens estão embaralhados com semente fixa (reproduzível) e deduplicados.

## Quando terminar

Entregue o CSV preenchido. O cruzamento com os vereditos do juiz e o cálculo do
kappa (Landis e Koch, 1977) são automáticos a partir do mapping privado.
