/**
 * config/resolver-modelos.js — resolução de modelo por agente
 * (docs/CONFIGURACAO-MODELOS.md; parte do port docs/PLANO-PORT-AGENTES-2026-08.md §4).
 *
 * O modelo de cada agente é um FATOR do experimento, não uma constante. Este
 * módulo resolve o mapa { papel → modelo } a partir de config/modelos.json
 * (perfis nomeados) e das quatro fontes de override, na ordem de precedência
 * da documentação (maior → menor):
 *
 *   --modelo estudantes=<id>      linha de comando, um agente (repetível)
 *   --perfil <nome>               linha de comando, todos
 *   MODELO_ESTUDANTES=<id>        ambiente, um agente
 *   PERFIL_MODELOS=<nome>         ambiente, todos
 *   config/modelos.json → perfilPadrao
 *
 * Quem consome:
 *   - producao/agents/pipeline-core.js (getAgentConfig do adaptador): os
 *     agentes portados pedem a config e recebem o modelo já resolvido;
 *   - scripts/reproduce-collect.mjs: grava o mapa RESOLVIDO no registro de
 *     execução (docs/CONTRATO-RUN-V2.md) — identificador resolvido, nunca o
 *     apelido do perfil.
 *
 * Sem config/modelos.json, cai para config/modelos.exemplo.json (clone limpo
 * funciona). Nome de agente ou de perfil desconhecido é ERRO, nunca um chute:
 * conferir identificadores contra a lista da OpenRouter é responsabilidade de
 * quem edita o arquivo de perfis (ver docs/CONFIGURACAO-MODELOS.md).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Os cinco papéis do pipeline de geração (ordem do contrato de registro). */
export const AGENTES = ["dominio", "materializacao", "estudantes", "revisao", "checagem"];

function lerConfig(configPath) {
  const candidatos = configPath
    ? [configPath]
    : [path.join(AQUI, "modelos.json"), path.join(AQUI, "modelos.exemplo.json")];
  for (const p of candidatos) {
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      return { cfg, origemArquivo: p };
    }
  }
  throw new Error(
    `[resolver-modelos] nenhum arquivo de perfis encontrado (procurei: ${candidatos.join(", ")})`
  );
}

/** Extrai --perfil <nome> e --modelo <agente>=<id> de um argv (repetível). */
export function parseFlagsModelos(argv = []) {
  const out = { perfil: null, modelo: {} };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--perfil") out.perfil = argv[++i] ?? null;
    else if (argv[i] === "--modelo") {
      const par = String(argv[++i] ?? "");
      const eq = par.indexOf("=");
      if (eq < 1) {
        throw new Error(`[resolver-modelos] --modelo espera <agente>=<id>, recebi "${par}"`);
      }
      out.modelo[par.slice(0, eq).trim()] = par.slice(eq + 1).trim();
    }
  }
  return out;
}

function validarAgente(nome, contexto) {
  if (!AGENTES.includes(nome)) {
    throw new Error(
      `[resolver-modelos] agente desconhecido em ${contexto}: "${nome}" (válidos: ${AGENTES.join(", ")})`
    );
  }
}

function validarPerfil(nome, perfis, contexto) {
  if (!perfis[nome]) {
    throw new Error(
      `[resolver-modelos] perfil desconhecido em ${contexto}: "${nome}" (válidos: ${Object.keys(perfis).join(", ")})`
    );
  }
}

/**
 * Resolve o mapa de modelos por agente.
 *
 * @param {object} opts
 *   argv        argv a inspecionar (default: process.argv.slice(2))
 *   env         ambiente a inspecionar (default: process.env)
 *   configPath  arquivo de perfis explícito (testes)
 * @returns {{
 *   perfil: string, porAgente: Record<string,string>, temperatura: number,
 *   provedor: string, resolvidoEm: string,
 *   origem: Record<string,string>, engajado: boolean
 * }}
 *   `origem[agente]` diz QUAL fonte venceu para aquele agente (auditoria).
 *   `engajado` é true se qualquer uma das quatro fontes de override apareceu —
 *   é o que o coletor usa para distinguir "réplica da configuração histórica"
 *   de "braço deliberado de comparação de modelos".
 */
export function resolverModelos({ argv, env, configPath } = {}) {
  const flags = parseFlagsModelos(argv ?? process.argv.slice(2));
  const ambiente = env ?? process.env;
  const { cfg } = lerConfig(configPath);
  const perfis = cfg.perfis || {};

  if (flags.perfil) validarPerfil(flags.perfil, perfis, "--perfil");
  for (const a of Object.keys(flags.modelo)) validarAgente(a, "--modelo");

  const perfilEnv = ambiente.PERFIL_MODELOS || null;
  if (perfilEnv) validarPerfil(perfilEnv, perfis, "PERFIL_MODELOS");

  const modeloEnv = {};
  for (const a of AGENTES) {
    const v = ambiente[`MODELO_${a.toUpperCase()}`];
    if (v != null && v !== "") modeloEnv[a] = v;
  }

  validarPerfil(cfg.perfilPadrao, perfis, "perfilPadrao");
  const perfilEfetivo = flags.perfil || perfilEnv || cfg.perfilPadrao;

  const porAgente = {};
  const origem = {};
  for (const a of AGENTES) {
    if (flags.modelo[a] != null) {
      porAgente[a] = flags.modelo[a];
      origem[a] = "--modelo";
    } else if (flags.perfil) {
      porAgente[a] = perfis[flags.perfil].agentes[a];
      origem[a] = `--perfil ${flags.perfil}`;
    } else if (modeloEnv[a] != null) {
      porAgente[a] = modeloEnv[a];
      origem[a] = `MODELO_${a.toUpperCase()}`;
    } else if (perfilEnv) {
      porAgente[a] = perfis[perfilEnv].agentes[a];
      origem[a] = `PERFIL_MODELOS=${perfilEnv}`;
    } else {
      porAgente[a] = perfis[cfg.perfilPadrao].agentes[a];
      origem[a] = `perfilPadrao (${cfg.perfilPadrao})`;
    }
    if (!porAgente[a]) {
      throw new Error(
        `[resolver-modelos] o perfil "${perfilEfetivo}" não define modelo para o agente "${a}"`
      );
    }
  }

  const engajado =
    Boolean(flags.perfil) ||
    Boolean(perfilEnv) ||
    Object.keys(flags.modelo).length > 0 ||
    Object.keys(modeloEnv).length > 0;

  return {
    perfil: perfilEfetivo,
    porAgente,
    temperatura: cfg.temperatura ?? 0.7,
    provedor: "openrouter",
    resolvidoEm: new Date().toISOString(),
    origem,
    engajado,
  };
}
