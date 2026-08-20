/**
 * Geração OFFLINE do frame do painel a partir do experimento prospectivo v0.8.
 * Nenhum cliente de LLM é importado aqui.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { analisarRegistro } from "./metricas.mjs";
import {
  construirFrameDeResultados,
  construirControlesCompletos,
} from "./painel-automatizado.mjs";
import { carregarReferenciaDoDataset } from "./consolidar-630.mjs";
import {
  carregarReferenciasCleanRoom,
} from "./holdout-cleanroom.mjs";
import { DATASET_NAME as HOLDOUT_DATASET } from "../../scripts/gerar-holdout-cleanroom-v08.mjs";

export const FRAME_SCHEMA = "sti.orientador-v08.panel-inputs/1";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function expectedNames(cell) {
  return cell.problemIds.flatMap((id) =>
    Array.from({ length: cell.replicas }, (_, i) => `${id}_rep${i + 1}.json`),
  ).sort();
}

export function enumerarRunsMaterializados(experimentRoot) {
  const root = path.resolve(experimentRoot);
  const manifestFile = path.join(root, "manifesto-plano-v08.json");
  const checkpointFile = path.join(root, "checkpoint.json");
  if (!fs.existsSync(manifestFile)) throw new Error(`manifesto prospectivo ausente: ${manifestFile}`);
  if (!fs.existsSync(checkpointFile)) throw new Error(`checkpoint prospectivo ausente: ${checkpointFile}`);
  const manifest = readJson(manifestFile);
  const checkpoint = readJson(checkpointFile);
  if (checkpoint.status !== "complete") throw new Error(`experimento prospectivo não está completo (status=${checkpoint.status})`);
  if (checkpoint.planSha256 !== manifest.planSha256) throw new Error("checkpoint e manifesto prospectivo divergem");
  if (!Array.isArray(manifest.cells) || !manifest.cells.length) throw new Error("manifesto sem cells[]");
  const entries = [];
  for (const cell of manifest.cells) {
    const runsDir = path.join(root, cell.materializedDir, "runs");
    if (!fs.existsSync(runsDir)) throw new Error(`runs materializados ausentes: ${runsDir}`);
    const expected = expectedNames(cell);
    const actual = fs.readdirSync(runsDir).filter((x) => x.endsWith(".json")).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${cell.id}: conjunto de runs materializados incompleto/adulterado`);
    }
    for (const filename of actual) entries.push({
      file: path.join(runsDir, filename),
      relativeFile: path.relative(root, path.join(runsDir, filename)).split(path.sep).join("/"),
      cellId: cell.id,
      corpus: cell.corpus,
      dataset: cell.dataset,
      generatorModel: cell.model,
      inputPolicy: cell.inputPolicy,
      filename,
    });
  }
  if (Number.isInteger(manifest?.design?.materializedRuns) && entries.length !== manifest.design.materializedRuns) {
    throw new Error(`manifesto prevê ${manifest.design.materializedRuns} materializados; encontrados ${entries.length}`);
  }
  return { root, manifest, checkpoint, entries };
}

/**
 * Constrói o frame e os controles. `deps` existe apenas para testes offline;
 * em produção as funções reais do núcleo v0.8 são usadas.
 */
export function construirInsumosPainelProspectivo({ experimentRoot, experimentRoots, repoRoot = ".", deps = {} }) {
  const roots = experimentRoots || (experimentRoot ? [experimentRoot] : []);
  if (!Array.isArray(roots) || !roots.length) throw new Error("informe experimentRoot ou experimentRoots[]");
  const inventories = roots.map(enumerarRunsMaterializados);
  const analyze = deps.analisarRegistro || analisarRegistro;
  const loadReference = deps.carregarReferencia || ((dataset) =>
    dataset === HOLDOUT_DATASET
      ? carregarReferenciasCleanRoom({ raiz: repoRoot, dataset })
      : carregarReferenciaDoDataset(dataset, repoRoot));
  const loadEnvelope = deps.carregarEnvelope || ((dataset, exercise) => {
    const file = path.join(repoRoot, "datasets", dataset, "problems", exercise, "envelope-a.json");
    if (!fs.existsSync(file)) throw new Error(`envelope-a ausente: ${file}`);
    return readJson(file);
  });

  const references = new Map();
  const envelopes = new Map();
  const frame = [];
  const controlRows = [];
  const controlSeen = new Set();
  const inputHash = crypto.createHash("sha256");
  const byStratum = {};
  const allEntries = inventories.flatMap((inventory, rootIndex) =>
    inventory.entries.map((entry) => ({ ...entry, experimentRootIndex: rootIndex })),
  ).sort((a, b) =>
    a.experimentRootIndex - b.experimentRootIndex || a.relativeFile.localeCompare(b.relativeFile),
  );
  for (const entry of allEntries) {
    const registro = readJson(entry.file);
    const exercise = String(registro.exercicio ?? registro.id ?? "");
    const replica = Number(registro.replica);
    if (!exercise || !Number.isInteger(replica) || replica < 1) throw new Error(`${entry.relativeFile}: exercicio/replica inválidos`);
    if (!registro?.materializado?.behaviorGraph) throw new Error(`${entry.relativeFile}: behaviorGraph materializado ausente`);
    if (registro?.modelos?.porAgente?.estudantes !== entry.generatorModel) {
      throw new Error(`${entry.relativeFile}: modelo ${registro?.modelos?.porAgente?.estudantes} != ${entry.generatorModel}`);
    }
    if (registro?.politicaInput?.id !== entry.inputPolicy) {
      throw new Error(`${entry.relativeFile}: política ${registro?.politicaInput?.id} != ${entry.inputPolicy}`);
    }
    if (!references.has(entry.dataset)) references.set(entry.dataset, loadReference(entry.dataset));
    const reference = references.get(entry.dataset)?.[exercise];
    if (!reference) throw new Error(`${entry.relativeFile}: referência CTAT ausente para ${exercise}`);
    const envelopeKey = `${entry.dataset}:${exercise}`;
    if (!envelopes.has(envelopeKey)) envelopes.set(envelopeKey, loadEnvelope(entry.dataset, exercise));
    const envelope = envelopes.get(envelopeKey);
    if (!String(envelope?.problem ?? "").trim()) throw new Error(`${entry.relativeFile}: enunciado ausente no envelope-a`);
    const evidenceTrack = entry.dataset === HOLDOUT_DATASET
      ? "cleanroom_prospective"
      : "ctat_exploratory";
    const analysis = analyze(registro, reference, {
      metadata: {
        corpus: entry.corpus,
        arm: entry.generatorModel,
        exercise,
        replica,
        stage: "materializado-prospectivo-v08",
        evidenceTrack,
      },
      incluirInventarioEstrutural: true,
    });
    const row = {
      registro,
      analise: analysis,
      corpus: entry.corpus,
      generatorModel: entry.generatorModel,
      inputPolicy: entry.inputPolicy,
      evidenceTrack,
      problemFamily: reference.family ?? null,
      exercise,
      replica,
      problem: envelope.problem,
      correctAnswer: envelope.correctAnswer ?? reference.resposta ?? "",
    };
    frame.push(...construirFrameDeResultados([row]));
    if (!controlSeen.has(envelopeKey)) {
      controlSeen.add(envelopeKey);
      controlRows.push(row);
    }
    const stratum = `${evidenceTrack}::${entry.corpus}::${entry.generatorModel}::${entry.inputPolicy}`;
    byStratum[stratum] = (byStratum[stratum] || 0) + 1;
    inputHash.update(String(entry.experimentRootIndex)).update(":").update(entry.relativeFile).update("\0").update(fs.readFileSync(entry.file)).update("\0");
  }
  frame.sort((a, b) => a.itemId.localeCompare(b.itemId));
  const controls = construirControlesCompletos(controlRows);
  const core = {
    schema: FRAME_SCHEMA,
    experimentPlanSha256: inventories.map((inventory) => inventory.manifest.planSha256),
    inputRunsSha256: inputHash.digest("hex"),
    inventory: {
      runs: allEntries.length,
      exercises: controlSeen.size,
      strata: Object.keys(byStratum).length,
      runsByStratum: Object.fromEntries(Object.entries(byStratum).sort(([a], [b]) => a.localeCompare(b))),
      frameItems: frame.length,
      controls: controls.length,
    },
    items: frame,
    controls,
  };
  return { ...core, inputsSha256: sha256(JSON.stringify(core)) };
}

export function validarInsumosPainel(inputs) {
  if (!inputs || inputs.schema !== FRAME_SCHEMA) throw new Error("schema de insumos inválido");
  const core = { ...inputs };
  delete core.inputsSha256;
  const actual = sha256(JSON.stringify(core));
  if (actual !== inputs.inputsSha256) throw new Error("hash dos insumos do painel inválido");
  if (!Array.isArray(inputs.items) || !Array.isArray(inputs.controls)) throw new Error("insumos sem items[]/controls[]");
  if (inputs.controls.length !== 60) throw new Error("insumos devem congelar 60 controles");
  return { inputsSha256: actual, items: inputs.items.length, controls: inputs.controls.length };
}
