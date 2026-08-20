#!/usr/bin/env node

/**
 * Recalcula os três consolidadores, dez tabelas de controle/precisão, cinco
 * comparações pareadas entre braços e oito contrafactuais R0–R3, todos
 * determinísticos, e exige igualdade semântica com os JSONs versionados. O
 * carimbo `gerado` é deliberadamente ignorado; qualquer diferença em amostra,
 * estimativa, intervalo ou metadado metodológico reprova o gate.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { consolidar, CORPORA } from "../analysis/bancada-v2/consolidar-corpora.mjs";
import { consolidarDicas } from "../analysis/bancada-v2/consolidar-dicas.mjs";
import { consolidarSimetrico } from "../analysis/bancada-v2/consolidar-simetrico.mjs";
import { compararRodadas } from "../analysis/bancada-v2/comparar-rodadas.mjs";
import { analisarLinhaDeBase } from "../analysis/bancada-v2/linha-de-base.mjs";
import { BRACOS, CORPORA_JUIZ } from "../analysis/bancada-v2/juiz-extras-materializado.mjs";
import { analisarContrafactual } from "../analysis/bancada-v2/contrafactual-regua.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const casos = [
  {
    nome: "corpora",
    arquivo: "resultados/EXPERIMENTO-CONSOLIDADO-2026-08/consolidado.json",
    calcular: () => consolidar(REPO),
  },
  {
    nome: "régua simétrica",
    arquivo: "resultados/juizo-2026-08-19/consolidado-simetrico.json",
    calcular: () => consolidarSimetrico(REPO),
  },
  {
    nome: "dicas",
    arquivo: "resultados/juizo-2026-08-19/dicas-consolidado.json",
    calcular: () => consolidarDicas(REPO),
  },
];

for (const corpus of CORPORA) {
  casos.push({
    nome: `comparação pareada entre braços · ${corpus.corpus}`,
    arquivo: `${corpus.pasta}/comparacao-bracos.json`,
    calcular: () => {
      const ler = (braco) => JSON.parse(fs.readFileSync(
        path.join(REPO, corpus.pasta, `${corpus.prefixo}${braco}.analise.json`),
        "utf8",
      ));
      return compararRodadas(ler("custo-beneficio"), ler("estudantes-qwen"));
    },
  });
}

for (const corpus of CORPORA_JUIZ) {
  for (const braco of BRACOS) {
    const dir = `${corpus.pasta}/materializado-v3-fixa-${braco}`;
    casos.push({
      nome: `controle/precisão · ${corpus.chave} · ${braco}`,
      arquivo: `${corpus.pasta}/linha-de-base-v3-fixa-${braco}.json`,
      calcular: () => {
        process.env.STI_DATASET = corpus.dataset;
        return analisarLinhaDeBase({ raiz: REPO, dir, usarReguaSimetrica: true });
      },
    });
  }
}

const CORPORA_CONTRAFACTUAL = new Set(["6.17", "6.19", "6.18", "6.20"]);
for (const corpus of CORPORA_JUIZ.filter((c) => CORPORA_CONTRAFACTUAL.has(c.chave))) {
  for (const braco of BRACOS) {
    const dirMat = `${corpus.pasta}/materializado-v3-fixa-${braco}`;
    casos.push({
      nome: `contrafactual R0–R3 · ${corpus.chave} · ${braco}`,
      arquivo: `${corpus.pasta}/contrafactual-v3-fixa-${braco}.json`,
      calcular: () => {
        process.env.STI_DATASET = corpus.dataset;
        return analisarContrafactual({ raiz: REPO, dirMat });
      },
    });
  }
}

function semCarimbo(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const { gerado: _gerado, ...resto } = obj;
  return resto;
}

let falhas = 0;
for (const caso of casos) {
  const destino = path.join(REPO, caso.arquivo);
  if (!fs.existsSync(destino)) {
    console.error(`✗ ${caso.nome}: ausente ${caso.arquivo}`);
    falhas++;
    continue;
  }
  const versionado = semCarimbo(JSON.parse(fs.readFileSync(destino, "utf8")));
  const recalculado = semCarimbo(caso.calcular());
  if (JSON.stringify(versionado) !== JSON.stringify(recalculado)) {
    console.error(`✗ ${caso.nome}: ${caso.arquivo} está desatualizado; regenere com o consolidador e --escrever`);
    falhas++;
  } else {
    console.log(`✓ ${caso.nome}: resultado versionado reproduzido exatamente (exceto carimbo gerado)`);
  }
}

if (falhas) process.exit(1);
