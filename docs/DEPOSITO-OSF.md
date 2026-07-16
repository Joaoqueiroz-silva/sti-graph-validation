# Depósito retrospectivo e transparente no OSF

## Estatuto do depósito

Este estudo já possui dados e resultados automatizados. Portanto, qualquer depósito criado agora
é **retrospectivo**: ele serve para preservação, transparência, citação e auditoria. Ele não é um
pré-registro confirmatório e não deve ser apresentado como se tivesse antecedido as Campanhas 1–4.

Não retrodate documentos, não selecione uma declaração de “pré-coleta” para dados já observados e
não descreva este arquivo como prova de decisões cegas aos resultados. O histórico real está em
[PRE-REGISTRO.md](PRE-REGISTRO.md), inclusive as emendas pós-dados e a reclassificação de todas as
campanhas como exploratórias.

## Antes de tornar o projeto público

1. Confirme que o commit/release a depositar passou pelas verificações offline do repositório.
2. Resolva a autorização de redistribuição dos BRDs e demais materiais de terceiros. Enquanto a
   licença ou autorização do corpus estiver pendente, não envie esses arquivos a um novo serviço
   público. Consulte [`../DATA-LICENSE.md`](../DATA-LICENSE.md) e
   [`../PROVENANCE.md`](../PROVENANCE.md).
3. Verifique que não há chaves, saldos de conta, mapeamentos cegos, dados pessoais nem caminhos
   locais desnecessários no pacote público.
4. Registre o identificador exato do commit e, quando existir, da release usada no depósito.

Se algum desses pontos estiver pendente, mantenha o projeto OSF privado e de acesso restrito. Um
projeto privado com metadados honestos é preferível a uma publicação prematura ou sem autorização.

## Pacote recomendado

O depósito deve apontar para uma única versão científica e conservar a separação entre evidência
principal e histórica:

- manuscrito v6.0 em PDF e LaTeX (`docs/manuscript/v6.0/`);
- `docs/VERSOES.md` e este mapa de estatuto científico;
- `docs/PRE-REGISTRO.md`, rotulado como plano e histórico retrospectivamente documentado;
- protocolos, emendas e manifestos da Campanha 4 em
  `protocol/production-freeze-2026-07-15/`;
- manifesto v6 e congelamento legado em `protocol/frozen/`, sem mover a tag histórica;
- resultados e derivados necessários para conferir as tabelas do artigo;
- código de análise e testes offline;
- `PROVENANCE.md`, `DATA-LICENSE.md`, `LICENSE` e `CITATION.cff`;
- um arquivo de metadados do depósito com data, commit, relação de arquivos e exclusões.

Arquivos históricos podem permanecer no pacote, desde que estejam claramente marcados como
superados e não sejam confundidos com a versão v6.0.

## Procedimento

1. Crie um projeto OSF com o título do estudo e uma descrição que use a expressão
   **“depósito retrospectivo dos materiais e resultados”**.
2. Informe a data real do depósito e declare que as Campanhas 1–4 já haviam sido executadas.
3. Faça upload somente do pacote auditado e autorizado. Para arquivos grandes, registre também os
   hashes e o commit de origem.
4. Inclua um `README` no próprio depósito com:
   - versão científica (`v6.0`);
   - commit/release;
   - datas das campanhas e do depósito;
   - Campanha 4 como avaliação principal e Campanhas 1–3 como históricas;
   - caráter exploratório;
   - limitações de proveniência/licença e arquivos deliberadamente excluídos;
   - instruções de verificação offline.
5. Se optar por congelar ou registrar o projeto, confira a redação apresentada pela interface do
   OSF e responda com as datas reais. Não use uma modalidade ou resposta que afirme coleta futura
   para as campanhas já concluídas.
6. Depois da publicação, adicione o URL persistente e eventual DOI ao `CITATION.cff`, ao manuscrito
   e ao README do repositório em um novo commit. Não altere silenciosamente o snapshot depositado.

## Redação segura

Formulações adequadas:

- “Os materiais e resultados foram depositados retrospectivamente no OSF em [data].”
- “O depósito preserva a trilha de decisões; não constitui pré-registro confirmatório.”
- “Todas as campanhas reportadas são exploratórias.”

Formulações inadequadas:

- “O estudo foi pré-registrado no OSF”, quando o depósito ocorreu após os dados;
- “registro pré-coleta” ou “protocolo cego aos resultados” para as Campanhas 1–4;
- qualquer data anterior à criação efetiva do registro.

## Estudo confirmatório futuro

Um estudo confirmatório deve ser um projeto separado: corpus novo e não inspecionado, hipóteses e
desfechos fixados, código e regras de exclusão congelados, plano de amostragem definido e registro
público imutável **antes** da primeira coleta. Esse novo registro poderá citar o presente depósito
como trabalho exploratório anterior, mas não poderá transformar retrospectivamente estas campanhas
em confirmatórias.
