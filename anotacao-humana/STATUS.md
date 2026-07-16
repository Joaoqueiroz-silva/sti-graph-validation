# Status do pacote de anotação humana

**Status: histórico; inadequado para uma nova rodada cega.**

O arquivo `PRIVADO-mapping-nao-abrir-antes-de-anotar.json`, que ligava os itens aos vereditos do
juiz automatizado, foi incluído no histórico público do repositório. Seu SHA-256 no congelamento
legado é `0915430ca5820a085765c6475f3d8c85e5c90fed2a2c2ecbdfb8f539c07e2459`.

O arquivo foi removido do `HEAD`, mas continua recuperável em commits e na tag histórica. Esta
remoção reduz exposição corrente; ela não restaura o cegamento nem altera o congelamento legado.

## Consequência científica

Os 370 itens e as instruções existentes podem documentar como o instrumento foi construído, mas
não sustentam, em uma nova coleta, a afirmação de que o anotador não poderia conhecer os
vereditos. Qualquer anotação feita com este pacote deve ser descrita como retrospectiva e com
cegamento comprometido. Ela não deve ser usada como validação humana independente principal do
juiz.

## Requisitos para uma nova rodada defensável

1. Definir e congelar antes da anotação a população de itens, o estimando de concordância, as
   exclusões, o tratamento de empates e a regra para dados ausentes.
2. Gerar um conjunto novo, com novos IDs opacos e nova ordem. A randomização e qualquer sal usado
   para ligar IDs aos vereditos não devem ser publicamente reconstruíveis durante a coleta.
3. Manter o mapeamento mestre fora do Git, em armazenamento criptografado e com acesso restrito a
   uma pessoa que não anote. No repositório, publicar no máximo um compromisso criptográfico
   (SHA-256) do arquivo congelado.
4. Entregar aos anotadores somente enunciado, resposta correta, candidato e campos de anotação;
   não entregar rótulos, justificativas ou identificadores reversíveis do juiz.
5. Registrar quem teve acesso ao mapeamento, a data de entrega do pacote, as sessões de anotação e
   a data de bloqueio do CSV preenchido.
6. Calcular a concordância somente depois do bloqueio da anotação e da abertura formal do
   mapeamento. Preservar os arquivos de entrada, o script e os hashes usados no cálculo.
7. Publicar o mapeamento apenas após a análise, se privacidade, consentimento e licença permitirem;
   caso contrário, publicar hashes e uma descrição verificável da custódia.

Uma futura rodada deve ficar em um novo diretório versionado. Não sobrescreva estes arquivos nem
apague o registro da falha de cegamento.
