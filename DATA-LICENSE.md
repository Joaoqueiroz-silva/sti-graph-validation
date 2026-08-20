# Situação dos direitos sobre dados e corpus

**Este arquivo não concede licença, autorização de uso nem direito de
redistribuição.** Ele registra o estado documental dos materiais que não são
código original deste repositório. Consulte também
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Separação de escopos

- A licença MIT em [`LICENSE`](LICENSE) aplica-se somente ao código original
  criado para este repositório e à documentação diretamente associada a esse
  código, salvo indicação diferente no próprio arquivo.
- A MIT **não** cobre automaticamente arquivos CTAT/Mathtutor, BRDs,
  `package.xml`, interfaces, imagens, capturas de tela, enunciados, dicas,
  gabaritos ou qualquer material de terceiros.
- O manuscrito, os registros experimentais e os resultados que incorporem ou
  reproduzam material de terceiros não recebem uma licença aberta por meio
  deste arquivo.

## Situação verificada em 20 de agosto de 2026

O repositório oficial do CTAT publica um acordo para uso acadêmico ou por
organização sem fins lucrativos, restrito à pesquisa não comercial. O acordo
é pessoal, não exclusivo e intransferível, não concede sublicença e restringe
cópia, modificação, criação de derivados, publicação, redistribuição e acesso
por terceiros. A versão consultada está fixada por commit em
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Não foi localizada, junto aos diretórios Mathtutor usados neste estudo, uma
licença separada que autorize expressamente republicar os respectivos `.brd`,
interfaces e materiais associados em um repositório público. A licença do
software CTAT também não deve ser copiada para este projeto como se fosse uma
sublicença dos conjuntos de casos.

Por isso, permanecem pendentes:

- a confirmação do titular e da autoria de cada pacote Mathtutor;
- a autorização escrita para hospedar e redistribuir os arquivos originais;
- a autorização para publicar extrações, transformações e outros derivados;
- a autorização específica para a adaptação local 6.17;
- a autorização para arquivamento permanente em GitHub, OSF, Zenodo ou serviço
  equivalente, inclusive com DOI.

Um pedido bilíngue pronto para envio está em
[`docs/PEDIDO-AUTORIZACAO-CMU.md`](docs/PEDIDO-AUTORIZACAO-CMU.md).

## Conjuntos e materiais afetados

Há seis conjuntos materializados no repositório: 6.17, 6.18, 6.19, 6.20,
7.12 e 8.12. Cinco deles, totalizando 105 problemas, integram a análise
principal do artigo; o conjunto 7.12, com 18 problemas, foi materializado e
preservado, mas não entrou nessa análise.

Os materiais cujo estado de direitos exige atenção incluem, sem se limitar a:

- `cases/ctat-*/`;
- `datasets/*/problems/*/expert.brd` e `datasets/*/_interface/`;
- envelopes, gabaritos, baterias e metadados derivados desses arquivos;
- registros ou avaliações que reproduzam enunciados, dicas ou caminhos de
  referência;
- `answer-key/`, `battery/` e partes de `anotacao-humana/` e `resultados/`.

O conjunto 6.17 é uma adaptação local da equipe EducaOFF. Seus BRDs não são
cópias byte a byte dos `FinalBRDs` atualmente servidos para a unidade 6.17.
Essa diferença não torna a adaptação independente: sua cadeia de derivação e
o direito de modificar e redistribuir o material de origem ainda precisam ser
documentados. Veja [`PROVENANCE.md`](PROVENANCE.md).

## Consequências práticas

O fato de um arquivo ser acessível sem autenticação, estar em um repositório
público ou já aparecer no histórico Git **não** o transforma em dado aberto e
não comprova consentimento. Enquanto não houver autorização escrita:

- não presuma permissão para copiar, redistribuir, sublicenciar, modificar ou
  explorar comercialmente materiais de terceiros;
- não crie release, pacote npm ou depósito arquivístico que apresente o corpus
  como aberto;
- trate o corpus integral como material de pesquisa com acesso restrito;
- para uma distribuição pública conservadora, publique somente o código
  original, fixtures próprias e resultados que tenham passado por auditoria de
  conteúdo e direitos.

Se a autorização não for concedida, a correção apropriada exigirá retirar os
materiais afetados de todas as referências públicas e, quando necessário,
reescrever o histórico. Nenhuma remoção nem reescrita de histórico é executada
por este documento.
