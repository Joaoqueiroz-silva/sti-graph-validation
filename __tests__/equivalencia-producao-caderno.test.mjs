/**
 * equivalencia-producao-caderno.test.mjs — (2026-08-17) O container de produção
 * (release caderno fac32bc) difere do espelho b7ae8780 em 13 módulos do agent
 * 6/7. Este teste verifica, OFFLINE (LLM mockado), se FORA do modo worksheet
 * as duas versões produzem os MESMOS prompts (planner e worker) e o MESMO
 * grafo materializado para os mesmos registros — i.e., se a bancada continua
 * medindo o que está em produção. Roda só se .tmp-producao-caderno/ existir.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";

const calls = vi.hoisted(() => ({ list: [] }));
vi.mock("../llm.js", async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    createLLM: (cfg = {}) => ({ cfg }),
    callLLM: vi.fn(async (llm, system, user, meta = {}) => {
      calls.list.push({ agent: meta.agent, system: String(system), user: String(user) });
      if (meta.agent === "agent6_planner") {
        const n = (user.match(/"step_\d+"/g) || []).length || 4;
        return JSON.stringify({ tutorTitle: "T", exercises: [{ id: 1, title: "P", statement: "S", difficulty: "medium", context: "c", variables: {},
          stepIntents: Array.from({ length: n }, (_, i) => ({ graphNodeId: `step_${i + 1}`, kc: "IdenNumerator", description: `passo ${i + 1}` })) }] });
      }
      const n = (user.match(/graphNodeId/g) || []).length || 4;
      return JSON.stringify({ steps: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, kc: "IdenNumerator", instruction: `faça ${i + 1}`, expectedAnswer: String(i + 1), renderAs: "text", explanation: "ok", hints: [{ level: 1, type: "conceptual", message: "pense" }], options: [] })) });
    }),
  };
});

const TMP = ".tmp-producao-caderno";
// Requer o espelho temporário da produção (não versionado) E zod 4 instalado
// (a produção fac32bc usa zod ^4; o espelho b7ae8780 roda com 3.25). Sem isso,
// o teste é pulado — o achado está documentado em docs/GUIA-DO-ARTIGO.md §10.
let zodMajor = 0;
try { zodMajor = parseInt((await import("zod/package.json", { with: { type: "json" } })).default.version.split(".")[0], 10); } catch { zodMajor = 0; }
const temCaderno = fs.existsSync(`${TMP}/agents/nodes/agent6-story.js`) && zodMajor >= 4;

describe.skipIf(!temCaderno)("equivalência espelho b7ae8780 × produção (caderno) fora do modo worksheet", () => {
  it("mesmos prompts do planner/worker e mesmo grafo materializado nos registros do piloto 6.19", async () => {
    process.env.STI_DATASET = "frac-estimates-6.19";
    const { materializarRegistro } = await import("../materializar-registro.js");
    const { _resetModelosResolvidos } = await import("../producao/agents/pipeline-core.js");
    _resetModelosResolvidos({ argv: [], env: {} });
    const cad6 = await import("../.tmp-producao-caderno/agents/nodes/agent6-story.js");
    const cad7 = await import("../.tmp-producao-caderno/agents/nodes/agent7-adapter.js");
    const dir = "resultados/bloco1-mathtutor-2026-08-16/6.19/piloto/runs";
    let comparados = 0;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      const reg = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
      const A = JSON.parse(fs.readFileSync(`datasets/frac-estimates-6.19/problems/${reg.exercicio}/envelope-a.json`, "utf8"));
      calls.list.length = 0;
      const espelho = await materializarRegistro(reg, A);
      const promptsEspelho = calls.list.map((c) => ({ agent: c.agent, system: c.system, user: c.user }));
      calls.list.length = 0;
      const producao = await materializarRegistro(reg, A, { agentes: { agent6_exerciseGenerator: cad6.agent6_exerciseGenerator, agent7_interfaceAdapter: cad7.agent7_interfaceAdapter } });
      const promptsProducao = calls.list.map((c) => ({ agent: c.agent, system: c.system, user: c.user }));
      expect(promptsProducao.map((c) => c.agent)).toEqual(promptsEspelho.map((c) => c.agent));
      for (let i = 0; i < promptsEspelho.length; i++) {
        expect(promptsProducao[i].user).toBe(promptsEspelho[i].user); // user prompts idênticos (planner e worker)
        if (promptsEspelho[i].agent === "agent6_planner") expect(promptsProducao[i].system).toBe(promptsEspelho[i].system);
        else expect(promptsProducao[i].system).not.toBe(promptsEspelho[i].system); // ACHADO 17/08: worker ganhou "CATÁLOGO DE COMPONENTES — CONSTRAINTS RÍGIDOS" fora do worksheet
      }
      // parte determinística (agent 7 + quality gate): mesmo grafo dado o mesmo retorno do LLM
      expect(producao.grafoMaterializado).toEqual(espelho.grafoMaterializado);
      comparados++;
    }
    expect(comparados).toBeGreaterThan(0);
  });
});
