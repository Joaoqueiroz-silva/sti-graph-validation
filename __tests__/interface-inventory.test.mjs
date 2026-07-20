/**
 * interface-inventory.test.mjs — Melhoria #1 (campanhas 2026-07-19): aterramento
 * de interface no simulador de alunos.
 *
 * ACHADO: as faltas de whole_number_bias (50 não-mecânicas) resistem a eliciação
 * E a materialização porque os inteiros faltantes são VALORES DA INTERFACE
 * ('12' = contagem de marcas daquela reta específica). O simulador precisa de
 * FATOS ESTRUTURADOS extraídos por código; prompting genérico não alcança.
 *
 * O que este arquivo trava:
 *  (a) o inventário é DETERMINÍSTICO e PURO (fixture real: componentes do
 *      envelope-a de 00bubble + trecho do _interface/interface.json do dataset
 *      frac-numberline-6.17) — mesmas entradas → mesmo inventário;
 *  (b) REGRA DE OURO: o inventário NÃO contém nenhuma chave do Envelope B
 *      (verificado com o próprio findLeaksInRobotInput) e números do ENUNCIADO
 *      (texto longo) não são capturados como "labels da interface";
 *  (c) o prompt do robô (buildUserMessage) ganha o bloco "INVENTÁRIO DA
 *      INTERFACE (fatos extraídos por código)" + eliciação dirigida, SEM tocar
 *      no SYSTEM (teto continua removido; taxonomia continua fora — decisão do
 *      usuário na campanha 2026-07-19);
 *  (d) [SÓ NO MONOREPO] a regra forte equivalente no worker de produção
 *      (agent6) não é portada: o módulo não existe neste pacote standalone.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInterfaceInventory, formatInterfaceInventory } from "../interface-inventory.js";
import { buildUserMessage } from "../simulate-students.js";
import { findLeaksInRobotInput } from "../parse-ctat-brd.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---- Fixtures REAIS -----------------------------------------------------------

/** Componentes do envelope-a.json de frac-numberline-6.17/problems/00bubble (cópia literal). */
const BUBBLE_IFACE = {
  id: "00bubble",
  problem:
    "Você está tentando distribuir um pão igualmente para 5 pessoas. Cada pedaço de pão deve ter o mesmo tamanho, então você deu a cada pessoa exatamente 1/5 do pão. Use a reta numérica para mostrar quanto pão cada pessoa recebeu de você.\nQual é a fração presente no problema?",
  correctAnswer: "1/5",
  components: [
    { id: "numline", type: "numberline", label: "numline" },
    { id: "F1", type: "numeric", label: "F1" },
    { id: "F2", type: "numeric", label: "F2" },
    { id: "denom", type: "numeric", label: "denom" },
    { id: "showAnswer", type: "button", label: "showAnswer" },
    { id: "writeFractionStep", type: "control", label: "writeFractionStep" },
    { id: "done", type: "button", label: "done" },
  ],
};

/**
 * Trecho LITERAL do `_interface/interface.json` do dataset frac-numberline-6.17
 * (DOM serializado; inclui o texto longo com números "10", "22", "1" que NÃO
 * podem virar labels de interface — só textos numéricos CURTOS contam).
 */
const INTERFACE_DOM = [
  {
    tagName: "main",
    classes: [{ name: "CTATTutor", active: false }],
    components: [
      { tagName: "h1", type: "text", components: [{ type: "textnode", content: "Tutor" }] },
      {
        tagName: "section",
        classes: [{ name: "CTATProblemSolving", active: false }],
        components: [
          {
            classes: [{ name: "firstHalf", active: false }],
            components: [
              {
                tagName: "section",
                classes: [
                  { name: "CTATProblem", active: false },
                  { name: "twothirds", active: false },
                ],
                attributes: { id: "iiflk" },
                components: [
                  {
                    type: "text",
                    resizable: true,
                    editable: "true",
                    content:
                      '<span style="font-family: Verdana, Geneva, sans-serif;">The veterinarian wants to use Telazol (tiletamine and zolazepam) (10mg/ml) to restrain a ferret for a short diagnostic procedure. The dosage is 22mg/kg IM. This ferret weight 1 lb, 10 oz. What is the dose in milligrams and milliliters of the product shown in the Figure to be used on this Ferret?&nbsp;</span>',
                    classes: [{ name: "CTATTextField", active: false }],
                    attributes: { id: "io6uy" },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        tagName: "section",
        classes: [{ name: "CTATTools", active: false }],
        components: [
          {
            classes: [{ name: "CTATButtons", active: false }],
            components: [
              { type: "CTATDoneButton", classes: [{ name: "CTATDoneButton", active: false }] },
              { type: "CTATHintButton", classes: [{ name: "CTATHintButton", active: false }] },
            ],
          },
          {
            tagName: "section",
            classes: [{ name: "CTATHints", active: false }],
            components: [
              { type: "CTATHintWindow", classes: [{ name: "CTATHintWindow", active: false }] },
            ],
          },
        ],
      },
    ],
  },
];

/** Interface sintética de reta com ticks rotulados — o caso whole_number_bias puro. */
const TICKED_IFACE = {
  id: "reta-ticks",
  problem: "Marque 1/12 na reta.",
  correctAnswer: "1/12",
  components: [
    { id: "numline", type: "numberline", label: "numline" },
    ...Array.from({ length: 13 }, (_, i) => ({
      id: `tick${i}`,
      type: "text",
      label: String(i),
    })),
    { id: "done", type: "button", label: "done" },
  ],
};

// ---- (a) inventário determinístico sobre fixtures reais -------------------------

describe("buildInterfaceInventory — fatos determinísticos (Melhoria #1, 2026-07-19)", () => {
  it("conta componentes por tipo e separa RESPOSTA de AÇÃO (envelope-a real de 00bubble)", () => {
    const inv = buildInterfaceInventory(BUBBLE_IFACE);
    expect(inv.totalComponents).toBe(7);
    expect(inv.byType).toEqual([
      { type: "button", count: 2, ids: ["showAnswer", "done"] },
      { type: "control", count: 1, ids: ["writeFractionStep"] },
      { type: "numberline", count: 1, ids: ["numline"] },
      { type: "numeric", count: 3, ids: ["F1", "F2", "denom"] },
    ]);
    expect(inv.responseComponentIds).toEqual(["numline", "F1", "F2", "denom"]);
    expect(inv.actionComponentIds).toEqual(["showAnswer", "writeFractionStep", "done"]);
  });

  it("é determinístico: mesmas entradas → mesmo inventário, byte a byte", () => {
    const a = buildInterfaceInventory(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    const b = buildInterfaceInventory(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("extrai contagens de elementos do DOM real do dataset (interface.json)", () => {
    const inv = buildInterfaceInventory(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    expect(inv.sharedFacts).not.toBeNull();
    expect(inv.sharedFacts.elements).toMatchObject({
      CTATTutor: 1,
      CTATProblemSolving: 1,
      CTATProblem: 1,
      CTATTextField: 1,
      CTATTools: 1,
      CTATButtons: 1,
      CTATDoneButton: 1,
      CTATHintButton: 1,
      CTATHints: 1,
      CTATHintWindow: 1,
    });
  });

  it("NÃO captura números do texto longo do enunciado como labels da interface", () => {
    // O trecho real contém "10mg/ml", "22mg/kg", "1 lb, 10 oz" dentro de um
    // parágrafo — nada disso é rótulo curto na tela; capturar seria ruído.
    const inv = buildInterfaceInventory(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    expect(inv.sharedFacts.numericTexts).toEqual([]);
  });

  it("deriva marcas→intervalos da reta a partir do grupo tick0..tick12 (o '12' do achado)", () => {
    const inv = buildInterfaceInventory(TICKED_IFACE);
    expect(inv.idGroups).toEqual([{ prefix: "tick", count: 13, min: 0, max: 12 }]);
    expect(inv.scales).toEqual([{ id: "numline", type: "numberline", marks: 13, intervals: 12 }]);
    // labels 0..12 dos ticks viram fatos numéricos com min/máx
    expect(inv.numericLabels.integers).toEqual({ min: 0, max: 12, count: 13 });
  });

  it("REGRA DE OURO: o inventário não contém NENHUMA chave do Envelope B (anti-vazamento)", () => {
    const inv = buildInterfaceInventory(TICKED_IFACE, { dom: INTERFACE_DOM });
    expect(findLeaksInRobotInput(inv)).toEqual([]);
    const invBubble = buildInterfaceInventory(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    expect(findLeaksInRobotInput(invBubble)).toEqual([]);
  });

  it("formatInterfaceInventory: renderiza só fatos existentes; vazio → ''", () => {
    const text = formatInterfaceInventory(buildInterfaceInventory(TICKED_IFACE));
    expect(text).toContain("13 marcas visíveis → 12 intervalos");
    expect(text).toContain("componentes de RESPOSTA");
    expect(formatInterfaceInventory(buildInterfaceInventory({ components: [] }))).toBe("");
  });
});

// ---- (c) bloco no prompt do robô -----------------------------------------------

describe("buildUserMessage — bloco INVENTÁRIO + eliciação dirigida (SYSTEM intocado)", () => {
  it("inclui o bloco de inventário e a eliciação FOCADA em 3 causas (Fase B, 2026-07-19)", () => {
    const msg = buildUserMessage(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    expect(msg).toContain("INVENTÁRIO DA INTERFACE (fatos extraídos por código");
    expect(msg).toContain("ERROS DE LEITURA DESTA INTERFACE");
    // Fase B: as 3 causas NOMEADAS dentro do MESMO bloco (sem checklist paralelo)
    expect(msg).toMatch(/- INVERSÃO:/);
    expect(msg).toMatch(/- MARCA VIZINHA:/);
    expect(msg).toMatch(/- INTEIRO NU:/);
    // a eliciação difusa antiga saiu (ela não nomeava clique vizinho/inversão/inteiro nu)
    expect(msg).not.toMatch(/CONTAGEM de marcas em vez do valor\?/);
    expect(msg).not.toMatch(/o label VIZINHO\? o intervalo ERRADO/);
    // fatos concretos do inventário presentes no prompt
    expect(msg).toContain("numeric×3 (F1, F2, denom)");
    expect(msg).toContain(
      "componentes de RESPOSTA (recebem valor do aluno): numline, F1, F2, denom"
    );
  });

  it("Fase B: eliciação do passo de CONFIGURAÇÃO da reta + autochecagem corrige-não-corta", () => {
    const msg = buildUserMessage(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    // Analista 2: o primeiro gesto numa reta numérica é configurá-la (rBound como result)
    expect(msg).toContain(
      "Se a interface tem reta numérica, o primeiro gesto do aluno é configurá-la"
    );
    expect(msg).toContain("o MAIOR INTEIRO que a reta cobre (o limite direito visível da escala)");
    // Analista 3: autochecagem de FORMA — corrigir formato, JAMAIS remover (anti-poda)
    expect(msg).toContain("AUTOCHECAGEM DE FORMA (corrigir, NUNCA cortar)");
    expect(msg).toContain("não remova nenhum erro por dúvida");
    // fecho anti-teto: inventário é ponto de partida, não limite
    expect(msg).toContain("fatos de PARTIDA, não um limite");
    // os exemplos da eliciação usam den=9 (ausente do dataset frac-numberline-6.17):
    // nenhum exemplo pode coincidir com falta real da campanha (regra de ouro)
    expect(msg).toContain("4/9");
  });

  it("mantém as âncoras do experimento: vocabulário fechado de selection intacto", () => {
    const msg = buildUserMessage(BUBBLE_IFACE, { dom: INTERFACE_DOM });
    expect(msg).toContain('VOCABULÁRIO PERMITIDO para "selection"');
    expect(msg).toContain(
      "IDs válidos: [numline, F1, F2, denom, showAnswer, writeFractionStep, done]"
    );
    expect(msg).toContain('"selection" ∈ IDs válidos');
  });

  it("retrocompatível: sem opts (sem html/dom), o inventário sai só dos componentes", () => {
    const msg = buildUserMessage(TICKED_IFACE);
    expect(msg).toContain("INVENTÁRIO DA INTERFACE");
    expect(msg).toContain("13 marcas visíveis → 12 intervalos");
  });

  it("SYSTEM continua sem teto e sem taxonomia (o inventário vive só na mensagem de usuário)", () => {
    const source = fs.readFileSync(path.join(HERE, "../simulate-students.js"), "utf8");
    const start = source.indexOf("const SYSTEM");
    const end = source.indexOf("export function buildUserMessage");
    expect(start).toBeGreaterThan(-1);
    const system = source.slice(start, end);
    expect(system).not.toMatch(/INVENTÁRIO/i);
    expect(system).not.toMatch(/taxonomia/i);
    expect(system).not.toMatch(/2 a 8 misconceptions/i);
    expect(system).toMatch(/SEM m[áa]ximo/i);
  });
});

// ---- (d) — NÃO PORTADO para o pacote standalone -----------------------------------
// A seção (d) do teste original trava a REGRA FORTE de erros de leitura de
// interface no prompt do worker de produção (backend/agents/prompts/
// agent6-worker-prompt.js). Esse módulo pertence à pipeline de geração da
// EducaOFF e não faz parte deste pacote de reprodução — a metade do contrato
// que o experimento usa (inventário + eliciação no simulador) está travada acima.
