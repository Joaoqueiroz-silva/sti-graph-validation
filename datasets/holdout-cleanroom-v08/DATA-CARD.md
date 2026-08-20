# Data card — holdout-cleanroom-v08

## Finalidade

Avaliar, fora do corpus exploratório de terceiros, a recuperação de caminhos de resolução, alvos semânticos, famílias de ação, erros e dicas sob a política somente-enunciado. O conjunto não mede aprendizagem humana nem demonstra eficácia pedagógica.

## Composição

50 problemas em português, dez por família: proporcionalidade, porcentagem, média aritmética, equação linear e simplificação de fração. Cada referência inclui matemática exata, caminho ordenado 1:1, `targetRole`, ação, erro previsível e três dicas programáticas por estado.

## Criação e proveniência

Conteúdo produzido por templates e fórmulas originais no gerador local, com PRNG xorshift32 e semente 8042026. O processo é offline, não consulta corpora externos e não usa arquivos CTAT como insumo. O teste de independência bloqueia frases extensas compartilhadas com os enunciados de terceiros presentes no repositório.

## Separação de informação

`envelope-a.json` contém exclusivamente identificador e enunciado. Resposta, parâmetros e referência ficam em arquivos separados e são lidos somente após a geração. A condição confirmatória aceita apenas `somente-enunciado-v1`.

## Limitações

É um holdout sintético de matemática escolar, com linguagem e decomposições programáticas. Ele fortalece validade interna, licenciamento e auditoria, mas não substitui amostragem de tarefas autênticas, julgamento de professores ou estudo com estudantes.

## Licença e manutenção

Dados dedicados por CC0-1.0; gerador sob MIT. Qualquer alteração após a coleta exige nova versão, nova emenda e preservação dos hashes anteriores.
