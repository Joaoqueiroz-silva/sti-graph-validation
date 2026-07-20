# Mapa da documentação

## Comece aqui

1. [README do repositório](../README.md): pergunta, escopo, resultados centrais e limites.
2. [Manuscrito v7.0](manuscript/v7.0/artigo-validacao-agentes-comportamentais-v7.0.tex): artigo do
   experimento final da Campanha 5 (previsão teórica offline mais medição), validado fato a fato
   por `analysis/validate-article-v7.mjs`.
3. [Manuscrito v6.0](manuscript/v6.0/README.md): artigo integrado das Campanhas 1 a 4.
4. [Versões científicas e campanhas](VERSOES.md): explica por que C4 é principal, por que C1 a C3
   são históricas e qual arquivo deve ser citado.
5. [`campaign4-final-analysis-v2.1.json`](../resultados/campanha4-2026-07-15/campaign4-final-analysis-v2.1.json):
   derivado canônico dos resultados centrais da C4.
6. [Reprodução v7 e benchmark](REPRODUCAO-V7.md): verificação offline grátis
   (`npm run reproduce:verify`), re-coleta paga (`npm run reproduce:collect`) e a interface de
   adaptadores ([benchmark/ADAPTADOR.md](../benchmark/ADAPTADOR.md)).
7. [Reprodução v6](REPRODUCAO-V6.md): o que é verificável offline nas Campanhas 1 a 4 e o que
   exigiria nova coleta.
8. [Modelos e custos](MODELOS-E-CUSTOS.md): modelos finais, chamadas incluídas e lançamentos excluídos.

## Hierarquia documental

Quando dois textos divergirem, use esta ordem:

1. manuscrito v6.0 e derivados canônicos conferidos por teste;
2. protocolos, emendas e manifestos congelados da campanha correspondente;
3. plano de análise e histórico de decisões;
4. relatórios e rascunhos históricos.

Uma emenda posterior pode substituir uma decisão anterior, mas não deve apagar o texto original.

## Versão atual e Campanha 4

- [manuscrito v6.0](manuscript/v6.0/README.md): síntese científica vigente;
- [PROTOCOLO-CAMPANHA-4.md](PROTOCOLO-CAMPANHA-4.md): documento de planejamento que antecedeu a
  conclusão da campanha; leia em conjunto com as emendas e não como prova de pré-registro pleno;
- [`protocol/production-freeze-2026-07-15/`](../protocol/production-freeze-2026-07-15/README.md):
  congelamento, planos, atestações e emendas executadas da C4;
- [`resultados/campanha4-2026-07-15/`](../resultados/campanha4-2026-07-15/): resultados e
  sensibilidades retidos.

## Campanha 5: experimento final do manuscrito v7.0

- [manuscrito v7.0](manuscript/v7.0/artigo-validacao-agentes-comportamentais-v7.0.tex): relata
  somente o experimento final (previsão teórica offline e medição da configuração final);
- [PROTOCOLO-CAMPANHA-5.md](PROTOCOLO-CAMPANHA-5.md): registro retrospectivo dos seis braços de
  2026-07-19 (protocolo fixo, mudanças por braço, confounder declarado, decisões de integridade);
- [INVESTIGACAO-KAPPA-2026-07-19.md](INVESTIGACAO-KAPPA-2026-07-19.md): por que o κ funcional foi
  abandonado (paradoxo do κ + desenho da bateria; agreement bruto + PABAK como substitutos);
- [`resultados/campanha5-2026-07-19/`](../resultados/campanha5-2026-07-19/): runs, sumários com
  bootstrap por cluster e a previsão teórica determinística do braço final;
- [REPRODUCAO-V7.md](REPRODUCAO-V7.md): reprodução como benchmark (verificação offline grátis,
  re-coleta paga na configuração final e adaptadores de simulador via
  [benchmark/ADAPTADOR.md](../benchmark/ADAPTADOR.md)).

## Campanhas 1–3 — documentação histórica

- [PRE-REGISTRO.md](PRE-REGISTRO.md): plano e cronologia retrospectivamente documentados; não é
  pré-registro confirmatório;
- [METRICAS-V2.md](METRICAS-V2.md): dicionário congelado da C3 e sua nota corretiva;
- [REPORT-C3-SCHEMA.md](REPORT-C3-SCHEMA.md): esquema e retenção dos relatórios C3;
- [SELECAO-DO-JUIZ.md](SELECAO-DO-JUIZ.md): registro histórico da seleção de juiz;
- `RELATORIO-CAMPANHA-1.*`: saídas históricas da C1, preservadas para auditoria;
- [`protocol/frozen/`](../protocol/frozen/README.md): tag e manifesto do congelamento legado.

Esses materiais ajudam a reconstruir a evolução do instrumento, mas não substituem a v6.0.

## Rascunhos superados

Os seguintes arquivos possuem banner de **HISTÓRICO / SUPERADO** porque misturam propostas,
caminhos antigos ou interpretações que não representam a versão atual:

- [METODOLOGIA.md](METODOLOGIA.md);
- [METODOLOGIA-DETALHADA.md](METODOLOGIA-DETALHADA.md);
- [GRAFO-CONHECIMENTO-VS-COMPORTAMENTO.md](GRAFO-CONHECIMENTO-VS-COMPORTAMENTO.md).

Eles não devem ser citados isoladamente como método executado ou resultado.

## Transparência e publicação

- [DEPOSITO-OSF.md](DEPOSITO-OSF.md): depósito retrospectivo honesto; nunca pré-registro
  retroativo;
- [`../PROVENANCE.md`](../PROVENANCE.md): origem e integridade conhecida do corpus;
- [`../DATA-LICENSE.md`](../DATA-LICENSE.md): escopo de licença e pendências de redistribuição;
- [`../anotacao-humana/STATUS.md`](../anotacao-humana/STATUS.md): perda de cegamento do pacote
  humano histórico e requisitos de uma nova rodada.

Enquanto autoria/licença do corpus permanecerem pendentes, a documentação não deve insinuar que a
licença MIT do código autoriza automaticamente a redistribuição dos BRDs.
