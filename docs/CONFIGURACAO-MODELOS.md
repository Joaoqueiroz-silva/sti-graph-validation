# Modelo como fator do experimento, não como constante

**Objetivo.** Trocar o modelo de linguagem de qualquer agente sem editar código,
para medir quais modelos produzem melhores grafos.

## 1. Requisitos

1. **Um perfil troca todos os modelos de uma vez.**
2. **Uma variável troca um agente só**, sem tocar no perfil nem no código.
3. **Os agentes não são editados.** Eles continuam pedindo o modelo ao
   `getAgentConfig`; quem resolve é o adaptador do experimento.
4. **O registro de execução guarda o mapa resolvido**, agente por agente. Sem
   isso, um resultado não pode ser atribuído a uma configuração.

## 2. Ordem de resolução

Da maior para a menor precedência:

```
--modelo estudantes=google/gemini-3.5-flash   (linha de comando, um agente)
--perfil turbo                                (linha de comando, todos)
MODELO_ESTUDANTES=...                         (ambiente, um agente)
PERFIL_MODELOS=turbo                          (ambiente, todos)
config/modelos.json → perfilPadrao            (arquivo)
```

O ponto de partida está em `config/modelos.exemplo.json`, com os três perfis de
produção. O perfil padrão é **custo-benefício**: GPT-5.6 Luna na estruturação de
domínio e na materialização, Gemini 3.1 Flash-Lite na criação em volume, revisão
e checagem.

## 3. O que registrar

```json
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
  "provedor": "openrouter",
  "resolvidoEm": "2026-08-20T14:00:00Z"
}
```

Gravar o identificador **resolvido**, não o apelido. Roteadores podem trocar o
modelo por trás de um alias sem aviso, e aí um resultado antigo deixa de ser
reproduzível sem que nada no repositório tenha mudado. Guardar também o consumo
de tokens e o custo por execução.

## 4. Como comparar modelos sem se enganar

### 4.1 Segure tudo o mais

Mesmo corpus, mesmas réplicas, mesmos prompts, mesma temperatura. Só o modelo
muda. Se o prompt mudar junto, o resultado não é atribuível a nada.

### 4.2 Trocar o perfil inteiro não diz qual agente importou

Comparar custo-benefício contra turbo responde "qual perfil é melhor", e não
"qual agente causou a diferença". Para atribuir, troque **um agente por vez**
mantendo os outros no perfil de referência.

Com 5 agentes e 3 modelos candidatos existem 243 combinações. Não tente rodar
todas. Ordem recomendada:

1. os três perfis como estão — 3 braços;
2. troca isolada no **agente de estudantes**, que é quem produz as transições de
   erro que a métrica mede — é onde o efeito deve aparecer;
3. troca isolada no agente de domínio, que define a granularidade dos passos e
   por isso afeta os níveis 2 e 3;
4. os demais só se os três primeiros indicarem que vale.

### 4.3 Compare pareado, não por sobreposição de intervalos

Use `analysis/validacao-v2/comparar-modelos.mjs`. Dois intervalos que se
sobrepõem **não** autorizam concluir que não há diferença. Em teste com dados
sintéticos, uma diferença real e consistente de +0,05 produziu intervalos
marginais de [0,473; 0,677] e [0,523; 0,723] — sobreposição quase total —
enquanto o intervalo pareado foi [+0,037; +0,050], sem cruzar zero.

### 4.4 Declare o braço principal antes de olhar

Rodar oito modelos, escolher o melhor e reportar o número dele como se fosse uma
medição única superestima o desempenho. Ou se declara o braço principal antes,
ou se reportam todos os braços com a ressalva explícita de seleção.

### 4.5 Custo

Comparar K perfis multiplica o custo por K. Rode um piloto de um exercício por
braço e imprima o custo estimado antes de autorizar a campanha inteira.
