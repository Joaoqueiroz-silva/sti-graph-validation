#!/usr/bin/env node

/**
 * Snapshot HTTP pós-auditoria para futuras verificações das fixtures C4.
 *
 * A versão efetivamente usada na Campanha 4 permanece congelada em
 * ontology-empty-bridge.mjs. Esta v2 inclui a união completa dos quatro KCs das
 * fixtures. A atestação read-only v2 confirmou vetores vazios nos três endpoints
 * de todos os identificadores.
 */

import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3040);
const HOST = process.env.HOST || "0.0.0.0";
export const C4_ATTESTED_KC_IDS = [
  "kc_identificar_partes_fracao",
  "kc_particionar_reta",
  "kc_localizar_fracao_reta",
  "kc_fracao_impropria_reta",
];
const allowedIds = new Set(C4_ATTESTED_KC_IDS);

function sendJson(response, status, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function decodedId(raw) {
  try {
    return decodeURIComponent(raw || "");
  } catch {
    return "";
  }
}

export function createOntologySnapshotServer() {
  return http.createServer((request, response) => {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "read_only_snapshot" });
      return;
    }
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/api/ontology/health") {
      sendJson(response, 200, { status: "ok", source: "campaign4-empty-snapshot-v2" });
      return;
    }
    const kcMatch = url.pathname.match(
      /^\/api\/ontology\/kc\/([^/]+)\/(prerequisites|relationships)$/
    );
    const miscMatch = url.pathname.match(/^\/api\/ontology\/misconceptions\/([^/]+)$/);
    const id = decodedId(kcMatch?.[1] || miscMatch?.[1]);
    if ((kcMatch || miscMatch) && allowedIds.has(id)) {
      sendJson(response, 200, []);
      return;
    }
    sendJson(response, 404, { error: "outside_attested_fixture_scope" });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createOntologySnapshotServer();
  server.listen(PORT, HOST, () => {
    process.stdout.write(
      `${JSON.stringify({ status: "ready", host: HOST, port: PORT, allowedIds: C4_ATTESTED_KC_IDS })}\n`
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
