# Emenda pré-execução: teto técnico do piloto real

Data: 15 de julho de 2026. Estado: registrada antes da primeira chamada real.

O protocolo inicial fixava US$ 1,00 para três estados e uma réplica. A validação
fail-closed mostrou que esse teto não comporta a reserva conservadora das configurações
exatas de produção: somente os máximos de saída de 3a, 3b e 3c somam US$ 1,512 nos
nove chamados planejados, antes dos tokens de entrada.

Após essa constatação e antes de qualquer chamada, o autor autorizou expressamente
priorizar a qualidade e executar todas as etapas necessárias. O teto técnico do
piloto passa a US$ 2,00, sem alterar modelo, temperatura ou `maxTokens`. A previsão
central permanece US$ 0,27--0,36; o novo valor é uma reserva de segurança, não uma
meta de gasto.

Controles mantidos:

- exatamente três estados e uma réplica;
- três agentes reservados por estado para medir também a capacidade do 3c;
- entrada limitada a 20.000 tokens por chamada no plano conservador;
- fallback e retries automáticos bloqueados para evitar chamadas não planejadas;
- prompts, usage real, custo, latência e saídas brutas retidos antes da análise;
- interrupção fail-closed caso o uso real esteja ausente ou ultrapasse a reserva;
- nenhuma execução dentro do contêiner de produção.

Esta emenda não autoriza elevar automaticamente o teto durante a corrida. Qualquer
mudança posterior deverá ser registrada como nova emenda antes da chamada afetada.
