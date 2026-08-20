/**
 * Executor local mínimo para o `materializado.behaviorGraph` final.
 *
 * Semântica exercida (toda ela está materializada no próprio JSON):
 * - a aresta `default` leva de `start` ao primeiro passo;
 * - `expectedInput.validator === "exact"`: `value` ou uma variação aceitável
 *   avança pela única aresta `correct` do passo;
 * - `node.misconceptions[].wrongAnswer` ativa a aresta
 *   `misconception(id)`, lê a instrução do scaffold e valida a aresta de retorno
 *   `correct` ao mesmo passo; a remediação é atômica e o aluno tenta novamente;
 * - `hintRequest` devolve as dicas do passo sem alterar o estado;
 * - uma entrada sem casamento não altera o estado.
 *
 * Não se inventa política para `skip_if_mastered(...)` ou `struggles`: essas
 * arestas dependem, respectivamente, de um modelo de domínio e de um contador
 * de tentativas externos ao artefato. Elas são inventariadas, mas não acionadas.
 * O módulo é puro: não importa rede, LLM, relógio ou aleatoriedade.
 */

const scalar = (value) => String(value ?? "").trim();

function invariant(condition, message) {
  if (!condition) throw new Error(`executor-grafo-gerado: ${message}`);
}

function edgeIndex(edges) {
  const byFrom = new Map();
  for (const edge of edges || []) {
    if (!byFrom.has(edge.from)) byFrom.set(edge.from, []);
    byFrom.get(edge.from).push(edge);
  }
  return byFrom;
}

export function compileGeneratedBehaviorGraph(graph) {
  invariant(graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges), "behaviorGraph inválido");
  const nodes = new Map();
  for (const node of graph.nodes) {
    invariant(node?.id, "nó sem id");
    invariant(!nodes.has(node.id), `id de nó duplicado: ${node.id}`);
    nodes.set(node.id, node);
  }

  const start = graph.nodes.find((node) => node.type === "start");
  const goals = graph.nodes.filter((node) => node.type === "goal");
  invariant(start, "nó start ausente");
  invariant(goals.length === 1, `esperado exatamente um goal; observado ${goals.length}`);

  const byFrom = edgeIndex(graph.edges);
  const initialEdges = (byFrom.get(start.id) || []).filter((edge) => edge.condition === "default");
  invariant(initialEdges.length === 1, `start deve ter uma aresta default; observado ${initialEdges.length}`);
  invariant(nodes.get(initialEdges[0].to)?.type === "step", "aresta default de start não aponta para step");

  const steps = graph.nodes.filter((node) => node.type === "step");
  for (const step of steps) {
    invariant(step.expectedInput, `${step.id}: expectedInput ausente`);
    invariant(step.expectedInput.validator === "exact", `${step.id}: validator não suportado: ${step.expectedInput.validator}`);
    invariant(scalar(step.expectedInput.value), `${step.id}: expectedInput.value vazio`);
    const correct = (byFrom.get(step.id) || []).filter((edge) => edge.condition === "correct");
    invariant(correct.length === 1, `${step.id}: esperado uma aresta correct; observado ${correct.length}`);
    invariant(nodes.has(correct[0].to), `${step.id}: destino correct inexistente: ${correct[0].to}`);
  }

  const compiled = {
    graph,
    nodes,
    byFrom,
    startState: initialEdges[0].to,
    goalState: goals[0].id,
  };
  // A compilação valida também rotas de erros que talvez não sejam observáveis
  // por compartilharem o mesmo valor de entrada. Nada é inferido ou descartado.
  for (const step of steps) {
    for (const misconception of step.misconceptions || []) {
      invariant(scalar(misconception.id), `${step.id}: misconception sem id`);
      invariant(scalar(misconception.wrongAnswer), `${step.id}/${misconception.id}: wrongAnswer vazio`);
      invariant(scalar(misconception.feedback), `${step.id}/${misconception.id}: feedback vazio`);
      validateRemediation(compiled, step, misconception);
    }
  }
  return compiled;
}

function acceptedCorrectValues(node) {
  return new Set([
    scalar(node.expectedInput?.value),
    ...(Array.isArray(node.expectedInput?.acceptableVariations)
      ? node.expectedInput.acceptableVariations.map(scalar)
      : []),
  ].filter(Boolean));
}

function validateRemediation(compiled, step, misconception) {
  const condition = `misconception(${misconception.id})`;
  const routes = (compiled.byFrom.get(step.id) || []).filter((edge) => edge.condition === condition);
  invariant(routes.length === 1, `${step.id}/${misconception.id}: esperado uma rota; observado ${routes.length}`);

  const scaffold = compiled.nodes.get(routes[0].to);
  invariant(scaffold?.type === "scaffold", `${step.id}/${misconception.id}: destino não é scaffold`);
  invariant(
    scalar(scaffold.targetMisconception) === scalar(misconception.id),
    `${step.id}/${misconception.id}: targetMisconception divergente`
  );
  const returns = (compiled.byFrom.get(scaffold.id) || []).filter((edge) => edge.condition === "correct");
  invariant(returns.length === 1, `${scaffold.id}: esperado um retorno correct; observado ${returns.length}`);
  invariant(returns[0].to === step.id, `${scaffold.id}: retorno ${returns[0].to} não volta a ${step.id}`);

  return {
    scaffoldId: scaffold.id,
    instruction: scaffold.instruction ?? null,
    returnTo: returns[0].to,
  };
}

/**
 * executeGeneratedTrace(graphOuCompilado, trace) → trajetória determinística.
 * Eventos: `{ input }` ou `{ hintRequest: true }`.
 */
export function executeGeneratedTrace(graphOrCompiled, trace = []) {
  const compiled = graphOrCompiled?.nodes instanceof Map
    ? graphOrCompiled
    : compileGeneratedBehaviorGraph(graphOrCompiled);
  let state = compiled.startState;
  const steps = [];

  for (const event of trace || []) {
    if (event?.hintRequest) {
      const node = compiled.nodes.get(state);
      steps.push({
        verdict: "hint",
        hints: node?.type === "step" ? (node.hints || []) : [],
      });
      continue;
    }

    const node = compiled.nodes.get(state);
    if (!node || node.type !== "step") {
      steps.push({ verdict: "no-match" });
      continue;
    }

    const input = scalar(event?.input);
    // Mesma precedência do executor CTAT: resposta correta vence um erro com o
    // mesmo valor observável.
    if (acceptedCorrectValues(node).has(input)) {
      const edge = (compiled.byFrom.get(state) || []).find((candidate) => candidate.condition === "correct");
      state = edge.to;
      steps.push({ verdict: "correct", transition: `${edge.from}->${edge.to}` });
      continue;
    }

    const matching = (node.misconceptions || []).filter(
      (misconception) => scalar(misconception.wrongAnswer) === input
    );
    if (matching.length) {
      const misconception = matching[0];
      const remediation = validateRemediation(compiled, node, misconception);
      steps.push({
        verdict: "buggy",
        misconceptionId: misconception.id,
        feedback: misconception.feedback,
        remediation,
        shadowedMisconceptionIds: matching.slice(1).map((item) => item.id),
      });
      // O scaffold e o retorno são uma transação tutorial atômica: a próxima
      // resposta do aluno continua no passo que originou o erro.
      state = remediation.returnTo;
      continue;
    }

    steps.push({ verdict: "no-match" });
  }

  return {
    steps,
    completed: state === compiled.goalState,
    endState: state,
  };
}

export function canonicalGeneratedTrace(graphOrCompiled) {
  const compiled = graphOrCompiled?.nodes instanceof Map
    ? graphOrCompiled
    : compileGeneratedBehaviorGraph(graphOrCompiled);
  const trace = [];
  const states = [];
  const seen = new Set();
  let state = compiled.startState;

  while (state !== compiled.goalState) {
    invariant(!seen.has(state), `ciclo no backbone correto em ${state}`);
    seen.add(state);
    const node = compiled.nodes.get(state);
    invariant(node?.type === "step", `backbone chegou a nó não-step: ${state}`);
    states.push(state);
    trace.push({ input: scalar(node.expectedInput.value) });
    const edge = (compiled.byFrom.get(state) || []).find((candidate) => candidate.condition === "correct");
    state = edge.to;
  }

  return { trace, states };
}
