# Avisos sobre materiais de terceiros

Este documento identifica materiais externos presentes na árvore de pesquisa e
as fontes consultadas para avaliar seu estado de direitos. Ele **não reproduz
nem concede** a licença do CTAT e não funciona como sublicença. Em caso de
conflito, prevalecem os termos do titular e eventual autorização escrita.

## Fontes oficiais consultadas

Consulta realizada em 20 de agosto de 2026:

1. **Acordo oficial do CTAT**, fixado no commit
   `4716009beab7f9b9099b822b30f8770bb4cdca08` do repositório `CMUCTAT/CTAT`:
   <https://github.com/CMUCTAT/CTAT/blob/4716009beab7f9b9099b822b30f8770bb4cdca08/LICENSE.md>
2. **Repositório oficial do CTAT:**
   <https://github.com/CMUCTAT/CTAT>
3. **Termos jurídicos do site da Carnegie Mellon University:**
   <https://www.cmu.edu/legal/>
4. **Diretórios Mathtutor dos conjuntos consultados:**
   - 6.17: <https://mathtutor.web.cmu.edu/tutors/packages/6.17%20HTML/>
   - 6.18: <https://mathtutor.web.cmu.edu/tutors/packages/6.18%20HTML/>
   - 6.19: <https://mathtutor.web.cmu.edu/tutors/packages/6.19%20HTML/>
   - 6.20: <https://mathtutor.web.cmu.edu/tutors/packages/6.20%20HTML/>
   - 7.12: <https://mathtutor.web.cmu.edu/tutors/packages/7.12%20HTML/>
   - 8.12: <https://mathtutor.web.cmu.edu/tutors/packages/8.12%20HTML/>

Os URLs Mathtutor identificam a fonte técnica observada; eles não são
snapshots imutáveis nem constituem uma licença. Os hashes e as comparações
locais estão em [`PROVENANCE.md`](PROVENANCE.md),
[`corpus-provenance.json`](corpus-provenance.json) e nos manifests de cada
conjunto.

## Titular e alcance conhecido

O acordo oficial identifica o CTAT como software da Carnegie Mellon University
e reserva ao licenciante a propriedade do software. O acordo define
“Software” de modo amplo, incluindo estruturas de arquivos, interfaces,
formatos e sequências de telas, documentação e instruções.

Os arquivos Mathtutor examinados não trazem metadados suficientes para
confirmar a autoria individual ou o titular específico de cada BRD e
enunciado. Até confirmação escrita, estes materiais devem ser tratados como
pertencentes à Carnegie Mellon University e/ou aos respectivos autores e
colaboradores, sem qualquer transferência de direitos para João Carlos
Queiroz, EducaOFF ou usuários deste repositório.

## Restrições relevantes do acordo oficial do CTAT

O acordo consultado:

- limita o uso a pesquisa não comercial por instituição acadêmica, organização
  sem fins lucrativos ou pesquisador elegível;
- concede licença pessoal, não exclusiva e intransferível;
- não concede direito de sublicenciar;
- exige esforços razoáveis contra uso, reprodução, distribuição ou publicação
  não autorizados;
- restringe cópia, modificação, tradução e criação de obras derivadas, salvo a
  exceção limitada de cópias internas de segurança;
- não concede licença de marca para “CTAT” ou “Carnegie Mellon”;
- requer atribuição em publicações relacionadas ao CTAT, conforme a referência
  indicada no próprio acordo.

Este resumo é informativo e não substitui a leitura da fonte fixada acima. Não
se presume que o acordo cubra, por si só, todo pacote Mathtutor; justamente por
isso se solicita confirmação do titular e autorização específica.

## Escopo por caminho

| Caminho ou classe | Origem/relação | Situação nesta auditoria |
|---|---|---|
| `cases/ctat-6.18/`, `6.19/`, `6.20/`, `7.12/`, `8.12/` | BRDs, interfaces e manifests associados aos diretórios Mathtutor | Redistribuição pública não confirmada |
| `datasets/equiv-fractions-6.18/`, `frac-estimates-6.19/`, `fraction-ordering-6.20/`, `conversion-factors-7.12/`, `factors-scaling-8.12/` | Cópias e extrações determinísticas dos materiais anteriores | Derivados; nenhuma licença concedida aqui |
| `cases/ctat-6.17/` e `datasets/frac-numberline-6.17/` | Adaptação local relacionada à unidade Mathtutor 6.17 | Origem derivada; modificação e redistribuição pendentes de autorização específica |
| `answer-key/` e `battery/` | Enunciados, valores e traços extraídos ou derivados do conjunto 6.17 | Não cobertos pela MIT |
| partes de `anotacao-humana/` e `resultados/` | Registros que podem reproduzir enunciados, dicas, caminhos ou outros fragmentos | Exigem auditoria antes de qualquer relicenciamento ou depósito |
| `artigo/` | Manuscrito do autor, com citações e descrições do estudo | Não é software MIT; direitos editoriais devem ser definidos separadamente |
| código original em `analysis/`, `scripts/`, `producao/` e módulos próprios | Implementação criada para o estudo | MIT, exceto trechos identificados como externos |

A tabela é deliberadamente conservadora e não exaustiva. Um arquivo derivado
não se torna automaticamente licenciável por ter sido convertido de XML para
JSON, resumido, traduzido ou incorporado à saída de um modelo.

## Conjunto local 6.17

O conjunto 6.17 foi adaptado localmente pela equipe EducaOFF e não coincide
byte a byte com os `FinalBRDs` servidos no diretório Mathtutor 6.17. Há
diferenças de idioma, estrutura, nós e transições. A autoria das modificações
locais não elimina os direitos sobre o material preexistente. Antes de
redistribuí-lo, é necessário documentar a cadeia de transformação e obter
permissão para modificação, tradução, criação de derivados e redistribuição.

## Acesso não significa abertura

Um servidor permitir download sem login ou um repositório ser tecnicamente
público não equivale a uma licença aberta. O histórico público anterior também
não regulariza a situação. Até a obtenção de resposta escrita do titular, estes
materiais não devem ser apresentados como open data, receber uma licença CC,
ser incluídos em pacote npm ou ser arquivados em release/OSF/Zenodo como corpus
livre.

O modelo de solicitação está em
[`docs/PEDIDO-AUTORIZACAO-CMU.md`](docs/PEDIDO-AUTORIZACAO-CMU.md).
