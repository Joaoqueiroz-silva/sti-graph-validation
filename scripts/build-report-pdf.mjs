#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_INPUT = path.join(ROOT, "docs", "RELATORIO-CAMPANHA-1.html");
const DEFAULT_OUTPUT = path.join(ROOT, "docs", "RELATORIO-CAMPANHA-1.pdf");
const POSTPROCESS = path.join(ROOT, "scripts", "postprocess-report-pdf.py");
const QA = path.join(ROOT, "scripts", "qa-report-pdf.py");

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    qaDir: null,
    scale: 0.94,
    skipQa: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") options.input = path.resolve(argv[++i]);
    else if (arg === "--output") options.output = path.resolve(argv[++i]);
    else if (arg === "--qa-dir") options.qaDir = path.resolve(argv[++i]);
    else if (arg === "--scale") options.scale = Number(argv[++i]);
    else if (arg === "--skip-qa") options.skipQa = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Uso: node scripts/build-report-pdf.mjs [opções]\n\n` +
        `  --input ARQUIVO   HTML de origem (padrão: docs/RELATORIO-CAMPANHA-1.html)\n` +
        `  --output ARQUIVO  PDF de destino (padrão: docs/RELATORIO-CAMPANHA-1.pdf)\n` +
        `  --qa-dir DIRETÓRIO renderiza todas as páginas para inspeção visual\n` +
        `  --scale N         escala de impressão do Chrome (padrão: 0.94)\n` +
        `  --skip-qa         pula as verificações automáticas\n`);
      process.exit(0);
    } else {
      throw new Error(`Opção desconhecida: ${arg}`);
    }
  }

  if (!Number.isFinite(options.scale) || options.scale < 0.8 || options.scale > 1.2) {
    throw new Error("--scale deve estar entre 0.8 e 1.2");
  }
  return options;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const chrome = candidates.find((candidate) => existsSync(candidate));
  if (!chrome) {
    throw new Error("Chrome/Chromium não encontrado. Defina CHROME_BIN com o caminho do executável.");
  }
  return chrome;
}

async function waitForDevToolsPort(profileDir, child, timeoutMs = 15_000) {
  const portFile = path.join(profileDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Chrome encerrou antes de expor o DevTools (código ${child.exitCode}).`);
    }
    try {
      const [port] = (await readFile(portFile, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch {
      // O arquivo é criado alguns instantes após o processo iniciar.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Tempo esgotado aguardando o DevTools do Chrome.");
}

async function openCdpSession(wsUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("Este gerador requer Node.js 22 ou posterior (WebSocket nativo).");
  }
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
      return;
    }
    const eventListeners = listeners.get(message.method) ?? [];
    for (const listener of eventListeners) listener(message.params);
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  function once(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Tempo esgotado aguardando ${method}.`));
      }, timeoutMs);
      const handler = (params) => {
        clearTimeout(timeout);
        listeners.set(method, (listeners.get(method) ?? []).filter((item) => item !== handler));
        resolve(params);
      };
      listeners.set(method, [...(listeners.get(method) ?? []), handler]);
    });
  }

  return { socket, send, once };
}

async function printHtml({ chrome, input, rawOutput, scale }) {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "report-pdf-chrome-"));
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--disable-extensions",
    "--disable-background-networking",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });

  try {
    const port = await waitForDevToolsPort(profileDir, child);
    const response = await fetch(`http://127.0.0.1:${port}/json/new`, { method: "PUT" });
    if (!response.ok) throw new Error(`Não foi possível criar a aba de impressão: HTTP ${response.status}`);
    const target = await response.json();
    const cdp = await openCdpSession(target.webSocketDebuggerUrl);

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url: pathToFileURL(input).href });
    await loaded;

    await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        document.documentElement.lang = "pt-BR";
        const style = document.createElement("style");
        style.dataset.reportPdf = "true";
        style.textContent = ` + "`" + `@media print {
          h2, h3, .tab-legenda { break-after: avoid-page !important; }
          table { break-inside: avoid-page !important; }
          .wrap { padding-bottom: 0 !important; }
          .wrap > hr:last-of-type { margin-bottom: 12px !important; }
        }` + "`" + `;
        document.head.appendChild(style);
        return document.fonts ? document.fonts.ready : Promise.resolve();
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const footerTemplate = `
      <div style="width:100%;text-align:center;color:#666;font-size:8px;font-family:Georgia,'Times New Roman',serif;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`;

    const result = await cdp.send("Page.printToPDF", {
      landscape: false,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate,
      printBackground: true,
      scale,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.38,
      marginBottom: 0.45,
      marginLeft: 0.38,
      marginRight: 0.38,
      preferCSSPageSize: false,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });

    await writeFile(rawOutput, Buffer.from(result.data, "base64"));
    cdp.socket.close();
  } catch (error) {
    if (stderr.trim()) error.message += `\nChrome: ${stderr.trim()}`;
    throw error;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else {
        child.once("exit", resolve);
        setTimeout(resolve, 2_000).unref();
      }
    });
    await rm(profileDir, { recursive: true, force: true });
  }
}

function runPython(script, args) {
  const python = process.env.PYTHON ?? "python3";
  const result = spawnSync(python, [script, ...args], { cwd: ROOT, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} falhou com código ${result.status}.`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!existsSync(options.input)) throw new Error(`HTML não encontrado: ${options.input}`);

  const chrome = findChrome();
  await mkdir(path.dirname(options.output), { recursive: true });
  const rawOutput = `${options.output}.chrome-raw.pdf`;

  console.log(`Gerando PDF a partir de ${path.relative(ROOT, options.input)}...`);
  await printHtml({ chrome, input: options.input, rawOutput, scale: options.scale });

  runPython(POSTPROCESS, [
    rawOutput,
    options.output,
    "--source", options.input,
    "--author", "João Carlos Queiroz",
    "--subject", "Relatório técnico do Experimento OE-A sobre grafos de comportamento gerados por agentes de LLM",
    "--keywords", "sistemas tutores inteligentes; grafos de comportamento; example-tracing; agentes de LLM; estudo exploratório",
  ]);
  await rm(rawOutput, { force: true });

  if (!options.skipQa) {
    const qaArgs = [options.output];
    if (options.qaDir) qaArgs.push("--render-dir", options.qaDir);
    runPython(QA, qaArgs);
  }

  console.log(`PDF concluído: ${options.output}`);
}

main().catch((error) => {
  console.error(`ERRO: ${error.message}`);
  process.exitCode = 1;
});
