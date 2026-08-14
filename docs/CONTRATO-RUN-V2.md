# Contrato do registro de execução v2

**Por que existe.** As campanhas 1 a 5 preservaram apenas a lista de valores de
resposta errada. Isso torna impossível, depois do fato, medir se o erro foi
colocado no passo certo, no componente certo, com a devolutiva certa — ou seja,
impossível avaliar qualidade de grafo. Este contrato define o mínimo que uma
coleta precisa gravar para que a bateria `analysis/validacao-v2` funcione.

**Regra.** Um arquivo JSON por par exercício–réplica, em `runs/`.

```json
{
  "exercicio": "00bubble",
  "replica": 1,
  "modelo": "qwen/qwen3-max",
  "promptSha256": "...",
  "geradoEm": "2026-08-20T14:00:00Z",

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
| `bruto` | reanálise futura sem nova coleta |

`passo` é o índice, começando em 1, do passo do **caminho correto gerado** ao
qual o erro está ancorado. Sem ele o erro é um valor solto e a posição não pode
ser avaliada nem depois.

## O que não fazer

Não gravar apenas agregados. Foi o que aconteceu na Campanha 5: os agregados
estão corretos e ancorados por hash, mas a métrica primária não é recomputável a
partir dos registros, e nenhum nível acima de 1 é calculável.
