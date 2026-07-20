/**
 * benchmark/adapter-exemplo.mjs - adaptador de EXEMPLO do benchmark (offline,
 * determinístico, custo zero). Demonstra o contrato descrito em
 * benchmark/ADAPTADOR.md: uma função assíncrona
 *
 *   simulate({ envelopeA, renderedFacts, interfaceInventory })
 *     -> { correctPath, misconceptions, hints }
 *
 * Este simulador NÃO usa LLM: deriva um caminho correto e um conjunto de
 * misconceptions apenas dos fatos visíveis que o harness entrega (enunciado,
 * resposta correta, componentes, interface renderizada reconstruída). Serve
 * para (a) testar o harness sem custo e (b) servir de esqueleto para plugar
 * qualquer outro simulador (LLM próprio, modelo local, regras).
 *
 * Regra de ouro do benchmark: o adaptador NUNCA vê o envelope-b (grafo do
 * especialista). O harness aplica findLeaksInRobotInput sobre exatamente o
 * objeto recebido aqui e recusa a coleta se houver vazamento.
 *
 * Uso:
 *   npm run reproduce:collect -- --adapter benchmark/adapter-exemplo.mjs --problems 2 --replicas 1
 */

const canonFrac = (n, d) => {
  const g = (a, b) => (b ? g(b, a % b) : a || 1);
  const k = g(Math.abs(n), Math.abs(d));
  const nn = n / k;
  const dd = d / k;
  return dd === 1 ? String(nn) : `${nn}/${dd}`;
};

export async function simulate({ envelopeA, renderedFacts, interfaceInventory }) {
  const comps = envelopeA.components || [];
  const responseIds = interfaceInventory?.responseComponentIds || comps.map((c) => c.id);
  const sel = (i) => responseIds[Math.min(i, responseIds.length - 1)] || comps[0]?.id;
  const linha = renderedFacts?.linha;
  const alvoNum = renderedFacts?.alvoNum;
  const alvoDen = renderedFacts?.alvoDen;
  const correct = envelopeA.correctAnswer || "";

  // Caminho correto: configurar a reta, preencher a fração e finalizar.
  const correctPath = [];
  let step = 1;
  if (linha?.rBound != null) {
    correctPath.push({
      kc: "kc_configurar_reta",
      selection: sel(0),
      action: "Configura a reta numérica até o maior inteiro visível",
      result: String(linha.rBound),
    });
    step++;
  }
  if (alvoNum != null && alvoDen != null) {
    correctPath.push({
      kc: "kc_numerador",
      selection: sel(1),
      action: "Digita o numerador da fração alvo",
      result: String(alvoNum),
    });
    correctPath.push({
      kc: "kc_denominador",
      selection: sel(2),
      action: "Digita o denominador da fração alvo",
      result: String(alvoDen),
    });
  }
  correctPath.push({
    kc: "kc_resposta_final",
    selection: sel(0),
    action: "Marca a resposta final na interface",
    result: correct,
  });

  // Misconceptions derivadas SOMENTE dos fatos visíveis.
  const misconceptions = [];
  const add = (id, wrongAnswer, buggyRule, description) => {
    if (wrongAnswer == null || String(wrongAnswer) === "" || String(wrongAnswer) === correct) return;
    misconceptions.push({
      step: 1,
      id,
      selection: sel(0),
      type: "conceptual",
      wrongAnswer: String(wrongAnswer),
      buggyRule,
      description,
      feedback: "Compare o valor marcado com a fração pedida no enunciado.",
    });
  };

  if (alvoNum != null && alvoDen != null && alvoNum !== 0) {
    add(
      "misc_inversao_num_den",
      `${alvoDen}/${alvoNum}`,
      `trocar numerador e denominador da fração pedida: ${alvoNum}/${alvoDen} vira ${alvoDen}/${alvoNum}`,
      "Inversão: o aluno troca numerador e denominador."
    );
  }
  const marcas = linha?.valoresDasMarcas || [];
  if (marcas.length && alvoNum != null && alvoDen != null) {
    const alvoCanon = canonFrac(alvoNum, alvoDen);
    const idx = marcas.findIndex((v) => {
      const m = /^(\d+)\/(\d+)$/.exec(String(v));
      const c = m ? canonFrac(parseInt(m[1], 10), parseInt(m[2], 10)) : String(v);
      return c === alvoCanon;
    });
    for (const j of [idx - 1, idx + 1]) {
      if (idx >= 0 && j >= 0 && j < marcas.length) {
        add(
          `misc_marca_vizinha_${j < idx ? "antes" : "depois"}`,
          marcas[j],
          `clicar a marca ${j < idx ? "anterior" : "seguinte"} ao alvo na reta: o valor dessa marca é ${marcas[j]}`,
          "Leitura de escala: o aluno clica a marca vizinha do alvo."
        );
      }
    }
  }
  const inteiros = new Set([
    ...(renderedFacts?.enunciado?.inteiros || []),
    ...(linha?.labelsInteiros || []).map(String),
    ...(linha?.marcasTotais != null ? [String(linha.marcasTotais)] : []),
    ...(alvoNum != null ? [String(alvoNum)] : []),
    ...(alvoDen != null ? [String(alvoDen)] : []),
  ]);
  for (const n of inteiros) {
    add(
      `misc_inteiro_nu_${n}`,
      n,
      `digitar sozinho o inteiro ${n}, visível na tela (label, contagem ou parte da fração)`,
      "Whole number bias: o aluno responde um inteiro visível em vez da fração."
    );
  }
  if (renderedFacts?.caixas?.fracaoNumDen && alvoNum != null && alvoDen != null) {
    add(
      "misc_entrada_parcial_den",
      `-/${alvoDen}`,
      `preencher só o denominador da caixa de fração: a interface registra o literal -/${alvoDen}`,
      "Entrada parcial: só o denominador preenchido."
    );
    add(
      "misc_entrada_parcial_num",
      `${alvoNum}/-`,
      `preencher só o numerador da caixa de fração: a interface registra o literal ${alvoNum}/-`,
      "Entrada parcial: só o numerador preenchido."
    );
  }

  const hints = [
    { step: 1, text: "Conte quantos intervalos iguais existem entre 0 e 1 antes de marcar." },
  ];

  return { correctPath, misconceptions, hints };
}

export default simulate;
