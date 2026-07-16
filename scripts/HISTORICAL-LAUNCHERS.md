# Lançadores históricos da Campanha 4

Os cinco arquivos abaixo são preservados **somente como evidência histórica**,
nos caminhos e bytes citados pelos manifestos congelados:

| Arquivo | SHA-256 congelado |
| --- | --- |
| `prepare-campaign4-full-preflights.sh` | `ee2cec52e9e24a99b42d3dedae9946884390e020e6cde2363c39b88bb127b38e` |
| `run-campaign4-full-remaining.sh` | `742225ae93a4fdf877cf762bdf501b3edc9c7749642f70441e4e2dd66a9f46fc` |
| `run-campaign4-judge-panel.sh` | `fef4d7fdb6c500003d72760135dd7f9db984e27c0ff37ceb3998583d2e7ed9ea` |
| `run-campaign4-real-group.sh` | `9302539b1580b45651c6cc74220d48ff3e22cd5f9e62b7e681a10bcfc5e7624f` |
| `run-campaign4-real-pilot-r1.sh` | `ba6cd51a371dcfd1ad35c0f73892a74dd97f1bea4d010166adbf0ac9456394a2` |

Eles contêm caminhos absolutos do computador de coleta e o alias SSH
`minha-vps`; portanto, **não são portáveis e não devem ser executados por
terceiros**. Alterá-los silenciosamente quebraria a trilha cronológica. O
depósito v6 mantém esses bytes e fornece `replay-campaign4-analysis.sh` para a
reanálise offline sem SSH, API ou custo.

Uma nova coleta requer um lançador novo, parametrizado, uma imagem OCI ou
snapshot reproduzível e autorização financeira explícita. Os scripts históricos
não são uma receita de replicação externa.
