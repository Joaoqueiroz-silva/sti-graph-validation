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

  it("aceita somente-enunciado-v1 no plano e não cria saída", () => {
    const out = path.join(temp, "saida-estrita-planejada");
    const r = executar([
      "--fluxo", "plataforma",
      "--input-policy", "somente-enunciado-v1",
      "--out", out,
    ]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("política de input: somente-enunciado-v1");
    expect(r.stdout).toContain("nada foi chamado, nada foi gravado");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("recusa somente-enunciado-v1 + interface fixa no preflight", () => {
    const out = path.join(temp, "saida-estrita-incompativel");
    const r = executar([
      "--fluxo", "plataforma",
      "--input-policy", "somente-enunciado-v1",
      "--interface-fixa",
      "--out", out,
    ]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("incompatível com interface fixa");
    expect(fs.existsSync(out)).toBe(false);
  });

  it("não interpreta --input-policy sem valor como o default histórico", () => {
    const r = executar(["--input-policy"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("--input-policy exige");
  });

  it("--resume pula run concluído sem reinvocar nem sobrescrever o adaptador", () => {
    const out = path.join(temp, "saida-resumivel");
    const counter = path.join(temp, "contador.txt");
    const adapter = path.join(temp, "adapter.mjs");
    fs.writeFileSync(
      adapter,
      `import fs from "node:fs";\n` +
        `export async function simulate() { fs.appendFileSync(${JSON.stringify(counter)}, "1\\n"); return { correctPath: [], misconceptions: [], hints: [] }; }\n`
    );
    const base = [
      "scripts/reproduce-collect.mjs",
      "--adapter", adapter,
      "--problems", "1",
      "--replicas", "1",
      "--out", out,
    ];
    const first = spawnSync(process.execPath, base, { cwd: REPO, encoding: "utf8" });
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0);
    const runFile = path.join(out, "runs", "00bubble_rep1.json");
    const before = fs.readFileSync(runFile, "utf8");

    const resumed = spawnSync(process.execPath, [...base, "--resume"], { cwd: REPO, encoding: "utf8" });
    expect(resumed.status, `${resumed.stdout}\n${resumed.stderr}`).toBe(0);
    expect(resumed.stdout).toContain("já concluído; nenhuma chamada repetida");
    expect(fs.readFileSync(counter, "utf8").trim().split("\n")).toHaveLength(1);
    expect(fs.readFileSync(runFile, "utf8")).toBe(before);
  });
});
