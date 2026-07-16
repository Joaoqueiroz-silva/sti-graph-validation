#!/usr/bin/env node

/**
 * Gate de privacidade para arquivos publicaveis.
 *
 * Reprova segredos, metadados de saldo/uso acumulado da conta, artefatos de
 * readiness, mapeamento humano privado e caminhos pessoais. Somente os cinco
 * lancadores congelados abaixo podem conservar caminhos absolutos, e apenas com
 * a excecao explicita em scripts/HISTORICAL-LAUNCHERS.md.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const TEXT_EXTENSIONS = new Set([
  "",
  ".bib",
  ".brd",
  ".cff",
  ".csv",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".py",
  ".sh",
  ".tex",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const FROZEN_HISTORICAL_LAUNCHERS = new Set([
  "scripts/prepare-campaign4-full-preflights.sh",
  "scripts/run-campaign4-full-remaining.sh",
  "scripts/run-campaign4-judge-panel.sh",
  "scripts/run-campaign4-real-group.sh",
  "scripts/run-campaign4-real-pilot-r1.sh",
]);
const HISTORICAL_DOCUMENTATION = "scripts/HISTORICAL-LAUNCHERS.md";

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

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function inspectJson(value, relative, findings, jsonPath = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectJson(entry, relative, findings, `${jsonPath}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const current = `${jsonPath}.${key}`;
    const accountContext = /keyUsage|keyReadiness|credentialReadiness|openrouterAccount/i.test(jsonPath);
    const forbiddenExact =
      /^(?:keyUsageBefore|keyUsageAfter|credentialLabel|credentialSuffix|keySuffix|apiKeySuffix|limitRemaining(?:Reported|Usd)?|limitCoverage|accountBalance|remainingBalance|creditsRemaining)$/i;
    const forbiddenInAccountContext =
      /^(?:label|suffix|note|balance|credits|usage|usage_daily|usage_weekly|usage_monthly)$/i;
    if (forbiddenExact.test(key) || (accountContext && forbiddenInAccountContext.test(key))) {
      findings.push({ relative, detail: `metadado de conta em ${current}` });
    }
    inspectJson(child, relative, findings, current);
  }
}

function launcherExceptionDocumented(relative) {
  if (!FROZEN_HISTORICAL_LAUNCHERS.has(relative)) return false;
  const documentation = path.join(REPO, HISTORICAL_DOCUMENTATION);
  if (!fs.existsSync(documentation)) return false;
  const text = fs.readFileSync(documentation, "utf8");
  const describesHistoricalStatus = /hist[oó]ric/i.test(text);
  const describesNonPortability = /n[aã]o.{0,30}port[aá]ve|caminh(?:o|os) (?:pessoal|absoluto)|personal path/i.test(text);
  const namesThisLauncher = text.includes(path.basename(relative));
  return describesHistoricalStatus && describesNonPortability && namesThisLauncher;
}

function main() {
  const findings = [];
  const warnings = [];
  const files = publishableFiles().sort();

  for (const relative of files) {
    if (/key-readiness[^/]*\.json$/i.test(path.basename(relative))) {
      findings.push({ relative, detail: "artefato de readiness da conta nao pode ser publicado" });
    }
    if (/privado.*mapping|mapping.*privado/i.test(relative)) {
      findings.push({ relative, detail: "mapeamento humano privado presente na arvore publicavel" });
    }

    const extension = path.extname(relative).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    const file = path.join(REPO, relative);
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) continue;
    const text = buffer.toString("utf8");

    const secretPatterns = [
      { name: "chave OpenRouter", regex: /\bsk-or-v1-[A-Za-z0-9_-]{16,}\b/g },
      { name: "chave de API", regex: /\bsk-(?!or-v1-)[A-Za-z0-9_-]{20,}\b/g },
      {
        name: "atribuicao de OPENROUTER_API_KEY",
        regex: /OPENROUTER_API_KEY\s*[:=]\s*["']?(?!\$\{|<|REDACTED|EXAMPLE|YOUR_|process\.env)[A-Za-z0-9_-]{32,}/gi,
      },
    ];
    for (const { name, regex } of secretPatterns) {
      for (const match of text.matchAll(regex)) {
        findings.push({ relative, detail: `${name} na linha ${lineNumber(text, match.index)}` });
      }
    }

    const personalPathPatterns = [
      /\/Users\/[A-Za-z0-9._-]+(?:\/[^\s"'`<>)]*)?/g,
      /\/home\/[A-Za-z0-9._-]+(?:\/[^\s"'`<>)]*)?/g,
      /[A-Za-z]:\\Users\\[^\s"'`<>)]*/g,
    ];
    for (const regex of personalPathPatterns) {
      for (const match of text.matchAll(regex)) {
        const detail = `caminho pessoal na linha ${lineNumber(text, match.index)}`;
        if (launcherExceptionDocumented(relative)) {
          warnings.push({
            relative,
            detail: `${detail} (lancador congelado; excecao documentada em ${HISTORICAL_DOCUMENTATION})`,
          });
        } else {
          findings.push({ relative, detail });
        }
      }
    }

    if (extension === ".json") {
      try {
        inspectJson(JSON.parse(text), relative, findings);
      } catch (error) {
        findings.push({ relative, detail: `JSON invalido: ${error.message}` });
      }
    }
  }

  if (warnings.length) {
    console.warn(`AVISOS (${warnings.length}):`);
    warnings.forEach(({ relative, detail }) => console.warn(`- ${relative}: ${detail}`));
  }
  if (findings.length) {
    console.error(`GATE DE PRIVACIDADE REPROVADO (${findings.length} ocorrencias):`);
    findings.forEach(({ relative, detail }) => console.error(`- ${relative}: ${detail}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Gate de privacidade aprovado: ${files.length} arquivos inspecionados.`);
}

main();
