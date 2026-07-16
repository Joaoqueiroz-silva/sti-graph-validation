#!/usr/bin/env node

/**
 * Produz a versao publica dos artefatos brutos da Campanha 4 sem metadados da
 * conta OpenRouter. A fonte privada e somente leitura e nunca e modificada.
 *
 * Uso:
 *   node scripts/redact-public-artifacts.mjs --write --private-source /caminho/privado
 *   node scripts/redact-public-artifacts.mjs --check [--private-source /caminho/privado]
 */

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const RESULTS_ROOT = "resultados/campanha4-2026-07-15";
const RAW_BASENAME = "campaign4-real-pilot.json";
const SUPPORTING_ARTIFACTS = [
  "protocol/production-freeze-2026-07-15/pilot-execution-freeze.json",
];
const MANIFEST_REL = "protocol/publication-redactions-v6.0.json";
const MANIFEST_PATH = path.join(REPO, MANIFEST_REL);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  let mode = null;
  let privateSource = process.env.PRIVATE_SOURCE_ROOT || null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write" || arg === "--check") {
      if (mode && mode !== arg.slice(2)) fail("Use somente um modo: --write ou --check.");
      mode = arg.slice(2);
    } else if (arg === "--private-source") {
      privateSource = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--private-source=")) {
      privateSource = arg.slice("--private-source=".length);
    } else {
      fail(`Argumento desconhecido: ${arg}`);
    }
  }
  if (!mode) fail("Informe --write ou --check.");
  if (mode === "write" && !privateSource) {
    fail("--write requer --private-source (ou PRIVATE_SOURCE_ROOT).");
  }
  return {
    mode,
    privateSource: privateSource ? path.resolve(privateSource) : null,
  };
}

function walk(root, relative = "") {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? walk(root, child) : [child.split(path.sep).join("/")];
  });
}

function publishableFiles() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: REPO }
  )
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((relative) => fs.existsSync(path.join(REPO, relative)));
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function resolveInside(root, relative) {
  if (typeof relative !== "string" || path.isAbsolute(relative)) {
    fail("O manifesto contem um caminho absoluto/invalido.");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail(`O caminho sai da raiz permitida: ${relative}`);
  }
  return resolved;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
  fs.renameSync(temporary, file);
}

function deleteField(object, key, jsonPath, removed) {
  if (!object || typeof object !== "object" || !(key in object)) return;
  delete object[key];
  removed.add(jsonPath);
}

/**
 * Remove somente metadados da conta/credencial. Custos e tokens por chamada,
 * respostas dos agentes, falhas e os demais dados experimentais permanecem.
 */
function redactDocument(input) {
  const value = structuredClone(input);
  const removed = new Set();

  deleteField(value, "keyUsageBefore", "$.keyUsageBefore", removed);
  deleteField(value, "keyUsageAfter", "$.keyUsageAfter", removed);

  if (value.keyReadiness && typeof value.keyReadiness === "object") {
    const accountField = /^(?:credential|account|apiKey|key).*(?:label|suffix|id)$|^(?:label|suffix|balance|remainingBalance|accountBalance|credits|creditsRemaining|limitRemaining(?:Reported|Usd)?|limitCoverage|note)$/i;
    for (const key of Object.keys(value.keyReadiness)) {
      if (accountField.test(key)) {
        deleteField(value.keyReadiness, key, `$.keyReadiness.${key}`, removed);
      }
    }
  }

  if (Array.isArray(value.keyUsageDelta)) {
    value.keyUsageDelta.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const accountField = /^(?:credential|account|apiKey|key).*(?:label|suffix|id)$|^(?:label|suffix|balance|remainingBalance|accountBalance|credits|creditsRemaining|note|usage|usage_daily|usage_weekly|usage_monthly)$/i;
      for (const key of Object.keys(entry)) {
        if (accountField.test(key)) {
          deleteField(entry, key, `$.keyUsageDelta[${index}].${key}`, removed);
        }
      }
    });
  }

  return { value, removedFields: [...removed].sort() };
}

function redactSupportingDocument(relative, input) {
  const value = structuredClone(input);
  const removed = new Set();
  if (relative.endsWith("/pilot-execution-freeze.json")) {
    deleteField(
      value.credentialReadiness,
      "limitRemainingReported",
      "$.credentialReadiness.limitRemainingReported",
      removed
    );
    deleteField(
      value.credentialReadiness,
      "note",
      "$.credentialReadiness.note",
      removed
    );
  }
  return { value, removedFields: [...removed].sort() };
}

function findRawArtifacts(root) {
  return walk(root, RESULTS_ROOT)
    .filter((relative) => path.basename(relative) === RAW_BASENAME)
    .sort();
}

function findPrivateReadinessArtifacts(privateRoot) {
  return walk(privateRoot, RESULTS_ROOT)
    .filter((relative) => /key-readiness[^/]*\.json$/i.test(path.basename(relative)))
    .sort();
}

function assertPrivateSource(privateRoot) {
  if (!fs.existsSync(privateRoot) || !fs.statSync(privateRoot).isDirectory()) {
    fail("A fonte privada informada nao e um diretorio legivel.");
  }
  if (fs.realpathSync(privateRoot) === fs.realpathSync(REPO)) {
    fail("A fonte privada nao pode ser o proprio repositorio publico.");
  }
}

function buildManifest(privateRoot) {
  assertPrivateSource(privateRoot);
  const rawArtifacts = findRawArtifacts(privateRoot);
  if (rawArtifacts.length !== 6) {
    fail(`Esperados 6 artefatos brutos privados; encontrados ${rawArtifacts.length}.`);
  }

  const redactedArtifacts = rawArtifacts.map((relative) => {
    const privateFile = resolveInside(privateRoot, relative);
    const original = readJson(privateFile);
    const { value, removedFields } = redactDocument(original);
    if (!removedFields.length) fail(`Nenhum campo sensivel encontrado em ${relative}.`);

    const publicFile = resolveInside(REPO, relative);
    writeJsonAtomic(publicFile, value);
    return {
      path: relative,
      privateOriginalSha256: sha256File(privateFile),
      publicRedactedSha256: sha256File(publicFile),
      removedFields,
    };
  });

  const omittedPrivateArtifacts = findPrivateReadinessArtifacts(privateRoot).map((relative) => ({
    path: relative,
    privateOriginalSha256: sha256File(resolveInside(privateRoot, relative)),
    publicationStatus: "omitted-account-metadata",
  }));

  if (!omittedPrivateArtifacts.length) {
    fail("Nenhum artefato privado *key-readiness*.json foi localizado para registrar.");
  }


  const redactedSupportingArtifacts = SUPPORTING_ARTIFACTS.map((relative) => {
    const privateFile = resolveInside(privateRoot, relative);
    if (!fs.existsSync(privateFile)) fail(`Artefato privado de apoio ausente: ${relative}.`);
    const { value, removedFields } = redactSupportingDocument(relative, readJson(privateFile));
    if (!removedFields.length) fail(`Nenhum campo sensivel de apoio encontrado em ${relative}.`);
    const publicFile = resolveInside(REPO, relative);
    writeJsonAtomic(publicFile, value);
    return {
      path: relative,
      privateOriginalSha256: sha256File(privateFile),
      publicRedactedSha256: sha256File(publicFile),
      removedFields,
    };
  });

  return {
    schemaVersion: "1.0.0",
    publicationVersion: "v6.0",
    policy: {
      purpose: "Excluir metadados de conta/credencial sem remover evidencias cientificas da Campanha 4.",
      immutablePrivateSource: true,
      privateSourcePathRecorded: false,
      retainedScientificFields: [
        "invocations",
        "outputs",
        "failures",
        "usage por chamada",
        "costUsd por chamada",
        "keyUsageDelta[*].usageDeltaUsd",
      ],
      downstreamNote:
        "Artefatos derivados que incorporam o hash do bruto devem ser recalculados depois da redacao; os valores cientificos nao sao alterados.",
    },
    redactedArtifacts,
    redactedSupportingArtifacts,
    omittedPrivateArtifacts,
  };
}

function verifyPublicSensitiveFields(relative, value) {
  const { removedFields } = redactDocument(value);
  if (removedFields.length) {
    fail(`${relative} ainda contem campos de conta: ${removedFields.join(", ")}`);
  }
}

function verifyManifest(privateRoot) {
  if (!fs.existsSync(MANIFEST_PATH)) fail(`Manifesto ausente: ${MANIFEST_REL}`);
  const manifest = readJson(MANIFEST_PATH);
  if (manifest.schemaVersion !== "1.0.0") fail("Versao de esquema inesperada no manifesto.");
  if (!Array.isArray(manifest.redactedArtifacts) || manifest.redactedArtifacts.length !== 6) {
    fail("O manifesto deve declarar exatamente 6 artefatos redigidos.");
  }

  const declared = new Set();
  for (const artifact of manifest.redactedArtifacts) {
    const relative = artifact.path;
    declared.add(relative);
    const publicFile = resolveInside(REPO, relative);
    if (!fs.existsSync(publicFile)) fail(`Artefato publico ausente: ${relative}`);
    const actualHash = sha256File(publicFile);
    if (actualHash !== artifact.publicRedactedSha256) {
      fail(`Hash publico divergente em ${relative}: ${actualHash}.`);
    }
    verifyPublicSensitiveFields(relative, readJson(publicFile));

    if (privateRoot) {
      const privateFile = resolveInside(privateRoot, relative);
      if (!fs.existsSync(privateFile)) fail(`Original privado ausente: ${relative}`);
      if (sha256File(privateFile) !== artifact.privateOriginalSha256) {
        fail(`Hash do original privado divergente em ${relative}.`);
      }
      const expected = redactDocument(readJson(privateFile)).value;
      const actual = readJson(publicFile);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        fail(`A versao publica nao corresponde a redacao deterministica de ${relative}.`);
      }
    }
  }

  const publicable = new Set(publishableFiles());
  const actualRaw = [...publicable]
    .filter(
      (relative) =>
        relative.startsWith(`${RESULTS_ROOT}/`) && path.basename(relative) === RAW_BASENAME
    )
    .sort();
  const undeclared = actualRaw.filter((relative) => !declared.has(relative));
  if (undeclared.length) fail(`Artefatos brutos sem declaracao: ${undeclared.join(", ")}`);

  const supporting = manifest.redactedSupportingArtifacts || [];
  const supportingPaths = supporting.map((artifact) => artifact.path).sort();
  if (
    supportingPaths.length !== SUPPORTING_ARTIFACTS.length ||
    JSON.stringify(supportingPaths) !== JSON.stringify([...SUPPORTING_ARTIFACTS].sort())
  ) {
    fail("Quantidade inesperada de artefatos de apoio redigidos.");
  }
  for (const artifact of supporting) {
    const publicFile = resolveInside(REPO, artifact.path);
    if (!fs.existsSync(publicFile)) fail(`Artefato publico de apoio ausente: ${artifact.path}`);
    if (sha256File(publicFile) !== artifact.publicRedactedSha256) {
      fail(`Hash publico divergente no artefato de apoio: ${artifact.path}.`);
    }
    const publicValue = readJson(publicFile);
    if (redactSupportingDocument(artifact.path, publicValue).removedFields.length) {
      fail(`${artifact.path} ainda contem metadados de conta.`);
    }
    if (privateRoot) {
      const privateFile = resolveInside(privateRoot, artifact.path);
      if (!fs.existsSync(privateFile)) fail(`Original privado de apoio ausente: ${artifact.path}`);
      if (sha256File(privateFile) !== artifact.privateOriginalSha256) {
        fail(`Hash privado divergente no artefato de apoio: ${artifact.path}.`);
      }
      const expected = redactSupportingDocument(artifact.path, readJson(privateFile)).value;
      if (JSON.stringify(expected) !== JSON.stringify(publicValue)) {
        fail(`A versao publica de apoio nao corresponde a redacao de ${artifact.path}.`);
      }
    }
  }

  for (const omitted of manifest.omittedPrivateArtifacts || []) {
    if (publicable.has(omitted.path)) {
      fail(`Artefato privado indevidamente publicavel: ${omitted.path}`);
    }
    if (privateRoot) {
      const privateFile = resolveInside(privateRoot, omitted.path);
      if (!fs.existsSync(privateFile)) fail(`Artefato omitido nao localizado na fonte privada: ${omitted.path}`);
      if (sha256File(privateFile) !== omitted.privateOriginalSha256) {
        fail(`Hash privado divergente no artefato omitido: ${omitted.path}`);
      }
    }
  }

  if (privateRoot) {
    const expectedOmitted = findPrivateReadinessArtifacts(privateRoot);
    const declaredOmitted = (manifest.omittedPrivateArtifacts || [])
      .map((artifact) => artifact.path)
      .sort();
    if (JSON.stringify(expectedOmitted) !== JSON.stringify(declaredOmitted)) {
      fail("A lista de artefatos privados omitidos esta incompleta ou contem itens extras.");
    }
  }
}

function main() {
  const { mode, privateSource } = parseArgs(process.argv.slice(2));
  if (privateSource) assertPrivateSource(privateSource);

  if (mode === "write") {
    const manifest = buildManifest(privateSource);
    writeJsonAtomic(MANIFEST_PATH, manifest);
  }

  verifyManifest(privateSource);
  const suffix = privateSource ? " (originais privados tambem verificados)" : "";
  console.log(`Redacao publica v6.0 verificada: 6/6 brutos + 1 artefato de apoio${suffix}.`);
}

try {
  main();
} catch (error) {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
}
