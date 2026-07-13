/**
 * judge-panel.test.mjs — painel de juízes sobre itens CONGELADOS (G12, B3).
 *
 * SEM REDE: o juiz LLM é injetado via makeJudgeFn (runPanel nunca toca o llm.js real
 * quando há injeção). Fixtures em tmpdir: reports report-c3-*.json no shape da
 * campanha (cases[].pairs[].extra em pares RH), expert.brd mínimo e answer-key.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expandReportPaths,
  slugOfModel,
  extractPanelItems,
  loadAnswerKey,
  seedFor,
  seededShuffle,
  judgeItemWithPolicy,
  majorityOf,
  summarizePanel,
  runPanel,
} from "../run-judge-panel.mjs";

// ── fixtures ──────────────────────────────────────────────────────────────────

/** .brd mínimo: 1 passo correto + 1 erro conceitual + 1 erro mecânico ("-1"). */
const brdFixture = (statement, correct, conceptualWrong, mechanicalWrong) => `<?xml version="1.0"?>
<stateGraph startStateNodeName="start" tutorType="Example-tracing Tutor">
 <startNodeMessages>
  <message><properties><Selection><value>statement</value></Selection><Action><value>UpdateTextArea</value></Action><Input><value>${statement}</value></Input></properties></message>
 </startNodeMessages>
 <node><uniqueID>n1</uniqueID><text>inicio</text></node>
 <node doneState="true"><uniqueID>n2</uniqueID><text>fim</text></node>
 <edge>
  <actionLabel><uniqueID>e1</uniqueID><properties><Selection><value>numline</value></Selection><Action><value>AddPoint</value></Action><Input><value>${correct}</value></Input></properties><successMessage>ok</successMessage></actionLabel>
  <actionType>Ação Correta</actionType><sourceID>n1</sourceID><destID>n2</destID>
 </edge>
 <edge>
  <actionLabel><uniqueID>e2</uniqueID><properties><Selection><value>numline</value></Selection><Action><value>AddPoint</value></Action><Input><value>${conceptualWrong}</value></Input></properties><buggyMessage>erro conceitual</buggyMessage></actionLabel>
  <actionType>Ação com erro</actionType><sourceID>n1</sourceID><destID>n1</destID>
 </edge>
 <edge>
  <actionLabel><uniqueID>e3</uniqueID><properties><Selection><value>numline</value></Selection><Action><value>AddPoint</value></Action><Input><value>${mechanicalWrong}</value></Input></properties><buggyMessage>erro mecanico</buggyMessage></actionLabel>
  <actionType>Ação com erro</actionType><sourceID>n1</sourceID><destID>n1</destID>
 </edge>
</stateGraph>`;

let tmp, reportsDir, corpusDir, outDir, answerKeyPath;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "judge-panel-"));
  reportsDir = path.join(tmp, "reports");
  corpusDir = path.join(tmp, "corpus");
  outDir = path.join(tmp, "out");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(path.join(corpusDir, "exA"), { recursive: true });

  // Réplica 1: extras RH ["3","5"]; par HH com extra "9" que NÃO pode entrar.
  fs.writeFileSync(
    path.join(reportsDir, "report-c3-gem-1.json"),
    JSON.stringify({
      cases: [
        {
          id: "exA",
          pairs: [
            { pairType: "RH", a: "robo", b: "expert", extra: ["3", "5"] },
            { pairType: "HH", a: "expert", b: "expert2", extra: ["9"] },
          ],
        },
      ],
    })
  );
  // Réplica 2: "3/1" é a MESMA âncora de "3" (dedup entre réplicas); "7" é novo.
  fs.writeFileSync(
    path.join(reportsDir, "report-c3-gem-2.json"),
    JSON.stringify({
      cases: [{ id: "exA", pairs: [{ pairType: "RH", a: "robo", b: "expert", extra: ["3/1", "7"] }] }],
    })
  );

  fs.writeFileSync(
    path.join(corpusDir, "exA", "expert.brd"),
    brdFixture("Marque 1/4 na reta.", "1/4", "4/1", "-1")
  );
  answerKeyPath = path.join(tmp, "answer-key.json");
  fs.writeFileSync(
    answerKeyPath,
    JSON.stringify({
      exercises: [{ id: "exA", statement: "Marque 1/4 na reta.", correctAnswer: "1/4" }],
    })
  );
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const panelOpts = (extra = {}) => ({
  reports: path.join(reportsDir, "report-c3-*.json"),
  outDir,
  corpusDir,
  answerKeyPath,
  quiet: true,
  ...extra,
});

/** Juiz fake padrão: aprova tudo que chega ao "modelo". */
const approveAll = () => async () => ({ valid: true, category: "valida_conceitual", reason: "ok" });

// ── extração do conjunto congelado ───────────────────────────────────────────

describe("extractPanelItems — conjunto congelado a partir dos reports", () => {
  const readReports = () =>
    fs
      .readdirSync(reportsDir)
      .sort()
      .map((f) => JSON.parse(fs.readFileSync(path.join(reportsDir, f), "utf8")));

  it("junta extras RH das réplicas deduplicados por canonAnswer, especialista conceitual e 4 distratores", () => {
    const { items, exercises } = extractPanelItems(readReports(), {
      corpusDir,
      answerKey: loadAnswerKey(answerKeyPath),
    });
    expect(exercises).toEqual(["exA"]);
    const bySource = {};
    for (const it of items) (bySource[it.source] ||= []).push(it.candidate);
    // extras: "3" e "3/1" têm a mesma âncora → um só (1ª grafia vence); "9" (HH) fora
    expect(bySource["robo-extra"].sort()).toEqual(["3", "5", "7"]);
    expect(items.some((i) => i.candidate === "3/1")).toBe(false);
    expect(items.some((i) => i.candidate === "9")).toBe(false);
    // especialista: só o erro CONCEITUAL ("4/1"); o mecânico "-1" fica fora
    expect(bySource["especialista"]).toEqual(["4/1"]);
    expect(items.some((i) => i.candidate === "-1")).toBe(false);
    // os 4 distratores de makeDistractors("1/4")
    expect(bySource["distrator-correta"]).toEqual(["1/4"]);
    expect(bySource["distrator-equivalente"]).toEqual(["2/8"]);
    expect(bySource["distrator-impossivel"]).toEqual(["-1/4"]);
    expect(bySource["distrator-absurdo"]).toEqual(["987654"]);
    expect(items).toHaveLength(8);
    // todo item carrega o contexto do julgamento (cego: sem nada além disso)
    for (const it of items) {
      expect(it.problem).toBe("Marque 1/4 na reta.");
      expect(it.correctAnswer).toBe("1/4");
    }
  });

  it("--limit corta por exercício e exercício sem resposta correta é pulado com aviso", () => {
    const reps = [
      { cases: [{ id: "exA", pairs: [] }, { id: "exZ", pairs: [{ pairType: "RH", extra: ["8"] }] }] },
    ];
    const one = extractPanelItems(reps, { corpusDir, answerKey: loadAnswerKey(answerKeyPath), limit: 1 });
    expect(one.exercises).toEqual(["exA"]);
    // exZ não tem .brd nem answer-key → pulado, com aviso (política: nada some em silêncio)
    const both = extractPanelItems(reps, { corpusDir, answerKey: loadAnswerKey(answerKeyPath) });
    expect(both.exercises).toEqual(["exA"]);
    expect(both.warnings.some((w) => w.includes("exZ") && w.includes("PULADO"))).toBe(true);
  });
});

// ── mesmo conjunto, ordens diferentes ────────────────────────────────────────

describe("painel — conjunto idêntico entre juízes, ordem embaralhada por juiz", () => {
  it("os 3 juízes recebem exatamente os mesmos itens, em ordens próprias e determinísticas", async () => {
    const { files } = await runPanel(
      panelOpts({
        judges: "fam1/judge-alpha,fam2/judge-beta,fam3/judge-gamma",
        makeJudgeFn: approveAll,
      })
    );
    const panels = Object.values(files.judges).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    expect(panels).toHaveLength(3);

    const idSets = panels.map((p) => p.items.map((i) => i.itemId).sort());
    expect(idSets[1]).toEqual(idSets[0]); // MESMO conjunto…
    expect(idSets[2]).toEqual(idSets[0]);

    const orderOf = (p) =>
      p.items
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((i) => i.itemId);
    // …mas a ordem vista por cada juiz difere (semente própria por slug)
    expect(orderOf(panels[0])).not.toEqual(orderOf(panels[1]));
    expect(orderOf(panels[0])).not.toEqual(orderOf(panels[2]));
    // e cada ordem é uma permutação completa (posições 0..n-1 sem buraco)
    for (const p of panels) {
      const positions = p.items.map((i) => i.position).sort((a, b) => a - b);
      expect(positions).toEqual([...Array(p.items.length).keys()]);
    }
  });

  it("seedFor/seededShuffle são determinísticos (mesma semente ⇒ mesma ordem)", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(seedFor("judge-alpha")).toBe(seedFor("judge-alpha"));
    expect(seededShuffle(arr, seedFor("judge-alpha"))).toEqual(
      seededShuffle(arr, seedFor("judge-alpha"))
    );
    expect(seededShuffle(arr, seedFor("judge-alpha"))).not.toEqual(
      seededShuffle(arr, seedFor("judge-beta"))
    );
  });

  it("slugOfModel deriva slug seguro do id do modelo", () => {
    expect(slugOfModel("mistralai/mistral-large-2512")).toBe("mistral-large-2512");
    expect(slugOfModel("qwen/qwen3.7-plus")).toBe("qwen3-7-plus");
    expect(slugOfModel("meta-llama/llama-4-maverick")).toBe("llama-4-maverick");
  });

  it("expandReportPaths expande glob e lista separada por vírgula", () => {
    const glob = expandReportPaths(path.join(reportsDir, "report-c3-*.json"));
    expect(glob.map((p) => path.basename(p))).toEqual([
      "report-c3-gem-1.json",
      "report-c3-gem-2.json",
    ]);
    const lista = expandReportPaths(
      `${path.join(reportsDir, "report-c3-gem-1.json")},${path.join(reportsDir, "report-c3-gem-2.json")}`
    );
    expect(lista).toEqual(glob);
  });
});

// ── guarda determinística ────────────────────────────────────────────────────

describe("guarda determinística — equivalentes da resposta correta não chamam o modelo", () => {
  it("distrator-correta e distrator-equivalente saem na_verdade_correta SEM chamada", async () => {
    const chamados = [];
    const { passes } = await runPanel(
      panelOpts({
        judges: "fam1/judge-alpha,fam2/judge-beta",
        makeJudgeFn: () => async (problem, correctAnswer, candidate) => {
          chamados.push(candidate);
          return { valid: true, category: "valida_conceitual", reason: "ok" };
        },
      })
    );
    // "1/4" (a correta) e "2/8" (mesma âncora, outra grafia) NUNCA chegam ao modelo
    expect(chamados).not.toContain("1/4");
    expect(chamados).not.toContain("2/8");
    // os demais distratores (fronteira que EXIGE julgamento) chegam
    expect(chamados).toContain("-1/4");
    expect(chamados).toContain("987654");
    for (const pass of passes) {
      for (const cand of ["1/4", "2/8"]) {
        const r = pass.results.find((x) => x.candidate === cand);
        expect(r.valid).toBe(false);
        expect(r.category).toBe("na_verdade_correta");
        expect(r.attempts).toBe(0); // curto-circuito: nenhuma tentativa de LLM
        expect(r.deterministic).toBe(true);
      }
    }
  });
});

// ── κ de Cohen par a par ─────────────────────────────────────────────────────

describe("κ de Cohen par a par (reuso do cohenKappa)", () => {
  const mkItems = (n) =>
    [...Array(n).keys()].map((i) => ({
      itemId: `exA|robo-extra|c${i}`,
      exercise: "exA",
      source: "robo-extra",
      candidate: `c${i}`,
    }));
  const mkPass = (slug, verdicts) => ({
    judge: { slug, model: `fam/${slug}` },
    results: verdicts.map((v, i) => ({
      itemId: `exA|robo-extra|c${i}`,
      candidate: `c${i}`,
      valid: v,
      category: v === null ? null : v ? "valida_conceitual" : "implausivel",
    })),
  });

  it("caso sintético calculado à mão: κ=0 (concordância no nível do acaso) e κ=1 (idênticos)", () => {
    const items = mkItems(4);
    const A = mkPass("a", [true, true, false, false]);
    const B = mkPass("b", [true, false, true, false]); // po=0.5, pe=0.5 → κ=0
    const C = mkPass("c", [true, true, false, false]); // idêntico a A → κ=1
    const s = summarizePanel(items, [A, B, C]);
    const k = Object.fromEntries(s.kappaPairwise.map((x) => [`${x.a}×${x.b}`, x]));
    expect(k["a×b"].kappa).toBe(0);
    expect(k["a×b"].agreement).toBe(0.5);
    expect(k["a×b"].n).toBe(4);
    expect(k["a×c"].kappa).toBe(1);
    expect(k["b×c"].kappa).toBe(0);
    expect(s.kappaPairwise).toHaveLength(3); // 3 juízes → 3 pares
  });

  it("veredito null fica FORA do par (n cai) e maioria/unanimidade seguem a definição", () => {
    const items = mkItems(3);
    const A = mkPass("a", [true, true, null]);
    const B = mkPass("b", [true, false, true]);
    const C = mkPass("c", [false, true, true]);
    const s = summarizePanel(items, [A, B, C]);
    const kab = s.kappaPairwise.find((x) => x.a === "a" && x.b === "b");
    expect(kab.n).toBe(2); // item c2 é null no juiz a → fora do par a×b

    const rows = Object.fromEntries(s.items.map((r) => [r.itemId, r]));
    expect(rows["exA|robo-extra|c0"].majority).toBe(true); // T,T,F → maioria válido
    expect(rows["exA|robo-extra|c0"].unanimity).toBe(false);
    expect(rows["exA|robo-extra|c1"].majority).toBe(true);
    expect(rows["exA|robo-extra|c2"].majority).toBe(true); // null,T,T → maioria dos não-nulos
    expect(rows["exA|robo-extra|c2"].unanimity).toBe(false); // pendência impede unanimidade
    expect(rows["exA|robo-extra|c2"].pendentes).toBe(1);
  });

  it("majorityOf: maioria dos não-nulos; empate → null (indeterminado)", () => {
    expect(majorityOf([true, true, false])).toBe(true);
    expect(majorityOf([false, false, true])).toBe(false);
    expect(majorityOf([true, false, null])).toBe(null);
    expect(majorityOf([null, null, null])).toBe(null);
  });
});

// ── política de falhas: null contado como pendência ──────────────────────────

describe("falha de chamada — retry, veredito null e pendência no sumário", () => {
  it("item que falha 2x fica null, entra na pendência e não some do grupo", async () => {
    const tentativas = { count: 0 };
    const { passes, summary, files } = await runPanel(
      panelOpts({
        judges: "fam1/judge-alpha,fam2/judge-beta,fam3/judge-gamma",
        makeJudgeFn: () => async (problem, correctAnswer, candidate) => {
          if (candidate === "987654") {
            tentativas.count++;
            throw new Error("boom do provedor");
          }
          return { valid: candidate !== "-1/4", category: "valida_conceitual", reason: "ok" };
        },
      })
    );
    // retry: 2 tentativas por juiz × 3 juízes no item que sempre falha
    expect(tentativas.count).toBe(6);

    for (const pass of passes) {
      const r = pass.results.find((x) => x.candidate === "987654");
      expect(r.valid).toBe(null);
      expect(r.attempts).toBe(2);
      expect(r.error).toContain("boom do provedor");
    }
    // pendências contadas no sumário (política: nunca somem em silêncio)
    expect(summary.pendencias.totalVereditosNulos).toBe(3);
    expect(summary.pendencias.itensComPendencia).toBe(1);
    expect(summary.pendencias.porJuiz["judge-alpha"]).toBe(1);

    // o item segue no grupo distratores: pendente por juiz, indeterminado na maioria
    const g = summary.groups.distratores;
    expect(g.nItems).toBe(4);
    expect(g.porJuiz["judge-alpha"].pendentes).toBe(1);
    expect(g.porMaioria.indeterminados).toBe(1);
    // e aparece no top de discordância (pendência é sinal, não lixo)
    expect(summary.topDiscordancia.some((t) => t.candidate === "987654")).toBe(true);

    // panel-summary.json persistido bate com o objeto devolvido
    const onDisk = JSON.parse(fs.readFileSync(files.summary, "utf8"));
    expect(onDisk.pendencias).toEqual(summary.pendencias);
  });

  it("judgeItemWithPolicy: sucesso na 2ª tentativa registra attempts=2 (retry no mesmo juiz)", async () => {
    let n = 0;
    const judgeFn = async () => {
      n++;
      if (n === 1) throw new Error("falha transitória");
      return { valid: true, category: "valida_conceitual", reason: "ok" };
    };
    const r = await judgeItemWithPolicy(
      { candidate: "5", correctAnswer: "1/4", problem: "P" },
      judgeFn
    );
    expect(r.valid).toBe(true);
    expect(r.attempts).toBe(2);
  });
});
