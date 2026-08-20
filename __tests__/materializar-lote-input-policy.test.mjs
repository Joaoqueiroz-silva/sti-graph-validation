import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);
let temp;

beforeAll(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "sti-materializar-policy-"));
});

afterAll(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});

function pastaRuns(nome, registro) {
  const dir = path.join(temp, nome);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify(registro));
  return dir;
}

function executar(runs, out, extras = []) {
  return spawnSync(
    process.execPath,
    [
      "scripts/materializar-lote.mjs",
      "--runs",
      runs,
      "--out",
      out,
      "--plano",
      ...extras,
    ],
    {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_API_KEY: "" },
    }
  );
}

describe("materializar-lote — preflight da política de input", () => {
  it("herda somente-enunciado-v1 do run e o plano não grava nem chama", () => {
    const runs = pastaRuns("runs-estritos", {
      politicaInput: { id: "somente-enunciado-v1" },
    });
    const out = path.join(temp, "saida-estrita");
    const r = executar(runs, out);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("política(s) de input: somente-enunciado-v1");
    expect(r.stdout).toContain("--plano: nada chamado");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("recusa run estrito marcado com interface fixa antes da confirmação paga", () => {
    const runs = pastaRuns("runs-incompativeis", {
      politicaInput: { id: "somente-enunciado-v1" },
      interfaceFixa: true,
    });
    const out = path.join(temp, "saida-incompativel");
    const r = executar(runs, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("incompatível com interface fixa");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("recusa --input-policy sem valor em vez de cair no default", () => {
    const runs = pastaRuns("runs-flag-incompleta", {});
    const r = executar(runs, path.join(temp, "saida-flag-incompleta"), [
      "--input-policy",
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--input-policy exige");
  });

  it("retorna exit não-zero quando um registro falha, sem fazer chamada", () => {
    const runs = pastaRuns("runs-invalidos", {
      exercicio: "00bubble",
      replica: 1,
      politicaInput: { id: "historico-v1" },
      bruto: { tracos: {} },
    });
    const out = path.join(temp, "saida-com-falha");
    const r = spawnSync(
      process.execPath,
      [
        "scripts/materializar-lote.mjs",
        "--runs", runs,
        "--out", out,
        "--yes",
        "--fail-fast",
      ],
      {
        cwd: REPO,
        encoding: "utf8",
        env: {
          ...process.env,
          ["OPENROUTER" + "_API_KEY"]: "chave-falsa-nao-usada-neste-teste",
          STI_BUDGET_USD: "0",
        },
      }
    );
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(1);
    expect(r.stdout).toContain("FALHOU");
    expect(JSON.parse(fs.readFileSync(path.join(out, "meta.json"), "utf8")).falhas).toHaveLength(1);
    expect(fs.existsSync(path.join(out, "manifests"))).toBe(false);
  });
});
