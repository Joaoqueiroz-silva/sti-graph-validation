import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = path.resolve(new URL("..", import.meta.url).pathname);
let temp;

beforeAll(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "sti-collect-preflight-"));
});

afterAll(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});

function executar(args) {
  return spawnSync(
    process.execPath,
    ["-r", "dotenv/config", "scripts/reproduce-collect.mjs", "--plano", "--problems", "1", "--replicas", "1", ...args],
    {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, OPENROUTER_API_KEY: "", STI_BUDGET_USD: "0" },
    }
  );
}

describe("reproduce-collect — preflight anterior a qualquer chamada paga", () => {
  it("--plano completo passa sem chave, sem chamar API e sem criar saída", () => {
    const out = path.join(temp, "saida-planejada");
    const r = executar(["--out", out]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("--plano: nada foi chamado, nada foi gravado");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("recusa diretório de saída não vazio antes de coletar", () => {
    const out = path.join(temp, "ocupado");
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, "sentinela.txt"), "preservar\n");
    const r = executar(["--out", out]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("recusando sobrescrever");
    expect(fs.readFileSync(path.join(out, "sentinela.txt"), "utf8")).toBe("preservar\n");
  });

  it("referência opcional ausente falha no preflight", () => {
    const r = executar([
      "--out", path.join(temp, "saida-com-ref"),
      "--reference-summary", path.join(temp, "nao-existe.json"),
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("preflight: --reference-summary ausente");
  });
});
