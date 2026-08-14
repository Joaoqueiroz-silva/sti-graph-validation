# Contrato do registro de execução v2

**Por que existe.** As campanhas 1 a 5 preservaram apenas a lista de valores de
resposta errada. Isso torna impossível, depois do fato, medir se o erro foi
colocado no passo certo, no componente certo, com a devolutiva certa — ou seja,
impossível avaliar qualidade de grafo. Também não registraram qual modelo rodou
cada agente, o que impede atribuir qualquer resultado a uma configuração. Este
contrato define o mínimo que uma coleta precisa gravar.

**Regra.** Um arquivo JSON por par exercício–réplica, em `runs/`.

```json
{
  "exercicio": "00bubble",
  "replica": 1,
  "geradoEm": "2026-08-20T14:00:00Z",
  "promptSha256": "...",

  "modelos": {
    "perfil": "custo-beneficio",
    "porAgente": {
      "dominio": "openai/gpt-5.6-luna",
      "materializacao": "openai/gpt-5.6-luna",
      "estudantes": "google/gemini-3.1-flash-lite",
      "revisao": "google/gemini-3.1-flash-lite",
      "checagem": "google/gemini-3.1-flash-lite"
    },
    "temperatura": 0.7,
    "provedor": "openrouter"
  },
  "custo": { "tokensEntrada": 0, "tokensSaida": 0, "usd": 0 },

  "auditoria": { "ok": true, "passos": 5 },

  "grafo": {
    "passos": [
      { "indice": 1, "acao": "Identificar o numerador", "kc": "kc_identificar_partes" }
    ],
    "erros": [
      {
        "valor": "5",
        "passo": 1,
        "componente": "numline",
        "acao": "AddPoint",
        "devolutiva": "Boa tentativa! Você marcou o 5...",
        "buggyRule": "ler o denominador como inteiro",
        "misconceptionId": "misc_whole_number_confusion"
      }
    ],
    "dicas": [ { "passo": 1, "nivel": 1, "texto": "..." } ]
  },

  "bruto": { "respostaDoModelo": "...", "tracos": {} }
}
```

## Campos obrigatórios e por quê

| Campo | Habilita |
|---|---|
| `grafo.erros[].valor` | nível 1 |
| `grafo.erros[].passo` | níveis 2 e 2b |
| `grafo.passos[]` | granularidade e posição relativa |
| `grafo.erros[].componente` e `.acao` | nível 3 |
| `grafo.erros[].devolutiva` | nível 5 |
| `auditoria.ok` | nível 0 |
| `modelos.porAgente` | atribuir o resultado a uma configuração |
| `modelos.perfil` | agrupar braços na comparação pareada |
| `custo` | decidir se um ganho compensa |
| `bruto` | reanálise futura sem nova coleta |

`passo` é o índice, começando em 1, do passo do **caminho correto gerado** ao
qual o erro está ancorado. Sem ele o erro é um valor solto e a posição não pode
ser avaliada nem depois.

Em `modelos.porAgente`, gravar o identificador **resolvido**, não o apelido do
perfil. Roteadores trocam o modelo por trás de um alias sem aviso.

## O que não fazer

Não gravar apenas agregados. Foi o que aconteceu na Campanha 5: os agregados
estão corretos e ancorados por hash, mas a métrica primária não é recomputável a
partir dos registros, e nenhum nível acima de 1 é calculável.
