# Emenda pos-piloto e pre-campanha: execucao completa da Campanha 4

Data: 15 de julho de 2026. Status: congelada depois do piloto operacional e antes
da primeira chamada adicional da campanha completa.

Esta emenda nao altera prompts, fixtures, imagem, modelo, temperaturas, maxTokens,
metricas nem rubricas. Ela usa o piloto como a primeira unidade da replica 1 e
define a continuacao necessaria para completar o desenho 24 exercicios x 3 replicas.

## 1. Regra de decisao

O gate do piloto autorizou a continuacao somente porque 9/9 chamadas terminaram,
as saidas brutas eram parseaveis, cada agente emitiu quatro solucoes por estado,
os `problemId` tiveram cobertura exata de 100%, os custos ficaram dentro do teto e
as metricas pre-registradas puderam ser recalculadas. Nenhum limiar de qualidade foi
usado para decidir. Sinais desfavoraveis -- inclusive perda no GraphForge -- ficam
preservados e sao motivo para ampliar a estimacao, nao para repetir o piloto.

O piloto `c4-pilot-real-20260715-batches-01-03-r1` nao sera refeito nem descartado:
ele constitui os batches 01--03 da replica 1.

## 2. Ordem e unidades congeladas

Cada grupo executa tres estados sequencialmente; dentro de cada estado, 3a e 3b
rodam em paralelo e 3c depois de ambos. A ordem global e:

1. replica 1, batches 01--03: concluido pelo piloto;
2. replica 1, batches 04--06;
3. replica 2, batches 01--03;
4. replica 2, batches 04--06;
5. replica 3, batches 01--03;
6. replica 3, batches 04--06.

O total e 18 unidades estado-replica, 72 unidades exercicio-replica por agente e
54 chamadas dos geradores. Restam 45 chamadas apos o piloto.

"Replica" significa uma nova amostragem do mesmo modelo com a mesma configuracao e
uma chamada distinta. O runtime implantado nao declara `seed`; portanto, o estudo
nao alegara controle ou reprodutibilidade por semente pseudoaleatoria.

## 3. Fidelidade e isolamento

Cada grupo usa a mesma imagem amd64 congelada, os mesmos hashes dos Agents3,
GraphForge e catalogo, o runner real v2 e o guardiao do piloto. Um preflight sem
credencial e sem rede e produzido para o proprio diretorio antes de cada grupo.
O hash do prompt efetivo deve coincidir com esse preflight em todas as nove chamadas.

A ontologia continua sendo o snapshot local somente leitura que reproduz os vetores
vazios observados para os tres KCs sinteticos. Nenhuma chamada de geracao roda na
VPS. A credencial e transmitida somente em memoria ao conteiner descartavel.

O runner generico de campanha nao substitui o caminho exato da imagem. A campanha e
orquestrada como seis grupos imutaveis de tres estados para conservar a mesma funcao
real usada no piloto. Um grupo concluido nunca e reiniciado. Falha ou estado ambiguo
interrompe toda a sequencia para auditoria manual, sem criar automaticamente `r2`.

## 4. Travas de chamadas e custo

Por grupo: nove chamadas planejadas, uma tentativa primaria por agente/estado,
fallback desabilitado, retries internos forçados e atestados em zero, pior caso de
US$ 1,782 e teto local de US$ 2,00.

Plano completo congelado pelas configuracoes maximas:

```text
6 grupos x US$ 1,782 = US$ 10,692 de pior caso
```

O teto agregado dos geradores e US$ 10,80. O piloto contabilizou US$ 0,318006 com
base nos tokens reais e precos congelados; logo, antes dos cinco grupos restantes,
o maximo conservador passa a US$ 9,228006. O valor central extrapolado do piloto e
aproximadamente US$ 1,91 para todos os geradores, mas nao substitui o pior caso.

Antes de cada grupo, o orquestrador deve verificar que custo contabilizado mais a
reserva integral dos grupos ainda pendentes nao ultrapassa US$ 10,80. Se o provedor
nao retornar usage exato ou se uso/custo exceder uma reserva, a corrida para. Nao ha
elevacao automatica do teto.

O painel de juizes LLM tem protocolo e orcamento separados e nao entra neste teto.

## 5. Retencao, analise e encerramento

Cada grupo preserva prompts, hashes, respostas brutas, usage, custo contabilizado,
latencia, configuracoes e artefatos GraphForge das politicas operacional e de
capacidade do 3c. O parser CTAT e as metricas v2 so sao aplicados depois do fechamento
da saida bruta daquele grupo.

A campanha dos geradores so termina quando:

- os seis grupos estiverem presentes, ou uma falha estiver explicitamente retida;
- cada chamada planejada possuir estado final auditavel;
- nenhuma unidade tiver sido repetida para substituir resultado desfavoravel;
- as 24 unidades de exercicio forem agregadas dentro de cada replica;
- as tres replicas forem agregadas no nivel do exercicio, com incerteza por
  bootstrap do exercicio e sem pseudorreplicar chamadas ou juizes.
