#!/usr/bin/env node

/**
 * Snapshot HTTP mínimo da ontologia para as fixtures da Campanha 4.
 *
 * A auditoria somente leitura de 2026-07-15 mostrou que os três KCs sintéticos
 * retornam HTTP 200 com vetores vazios nos nove endpoints consultados. Este
 * servidor reproduz exatamente esse resultado sem acoplar a corrida à VPS.
 */

import http from "node:http";

const PORT = Number(process.env.PORT || 3040);
const HOST = process.env.HOST || "0.0.0.0";
const allowedIds = new Set(
  String(
    process.env.C4_ALLOWED_KC_IDS ||
      "kc_identificar_partes_fracao,kc_particionar_reta,kc_localizar_fracao_reta"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

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

const server = http.createServer((request, response) => {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "read_only_snapshot" });
    return;
  }

  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/api/ontology/health") {
    sendJson(response, 200, { status: "ok", source: "campaign4-empty-snapshot" });
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

  sendJson(response, 404, { error: "outside_frozen_fixture_scope" });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `${JSON.stringify({ status: "ready", host: HOST, port: PORT, allowedIds: [...allowedIds] })}\n`
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
