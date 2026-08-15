/**
 * i18n-strings.js — Strings localizadas pra feedback/hints hardcoded em
 * camadas pós-pipeline (sanitizer, final-gate) que sobrescrevem o conteúdo
 * gerado pelos LLMs. Lê o idioma do AsyncLocalStorage (request-context.js)
 * automaticamente — agentes não precisam passar o idioma explicitamente.
 *
 * Uso:
 *   import { tStr } from "./i18n-strings.js";
 *   opt.feedback = tStr("feedback.correct");          // pega idioma do contexto
 *   opt.feedback = tStr("feedback.correct", "es");    // força idioma específico
 */

import { getRequestContext } from "./config/request-context.js";

const STRINGS = {
  "pt-BR": {
    "feedback.correct": "Muito bem! Resposta correta.",
    "feedback.misconception.fallback":
      "Quase lá! Você escolheu {optLabel}, mas pense com cuidado: a instrução pede algo específico. Releia e tente de novo!",
    "hint.conceptual.observe":
      "Boa pergunta! Observe {focus} e separe as informações importantes do enunciado.",
    "hint.procedural.byParts":
      "Você está indo bem! Resolva uma parte por vez e confira cada escolha antes de seguir.",
    "hint.conceptual.reread":
      'Boa pergunta! Releia a instrução com calma: "{inst}". O que ela está pedindo que você faça?',
    "hint.procedural.eachOption":
      "Você está indo bem! Leia cada opção e pense: qual delas responde exatamente o que a instrução pediu?",
    "hint.procedural.divide":
      "Você está indo bem! Tente dividir o problema em partes menores. Qual seria o primeiro passo?",
    "hint.lead.bem": "Você está indo bem! ",
    "hint.example.addition.conceptual":
      "Boa pergunta! Quando juntamos dois grupos, que operação usamos? Pense em juntar coisas...",
    "hint.example.addition.procedural":
      "Você está indo bem! Conte primeiro o grupo {A}, depois continue contando mais {B} a partir de onde parou.",
    "hint.bank.l1":
      "Boa pergunta! Observe {focus} e separe as informações importantes do enunciado.",
    "hint.bank.l2":
      "Você está indo bem! Resolva uma parte por vez e confira cada escolha antes de seguir.",
    "hint.bank.l3":
      "Quase lá! Elimine alternativas que não combinam com a ação principal do passo.",
    "hint.bank.l4":
      "Você está muito perto! Revise seu raciocínio do início ao fim antes de responder.",
    "hint.focus.kc": "esta habilidade ({kc})",
    "hint.focus.generic": "o que a pergunta pede",
  },
  en: {
    "feedback.correct": "Well done! Correct answer.",
    "feedback.misconception.fallback":
      "Almost there! You chose {optLabel}, but think carefully: the instruction asks for something specific. Reread and try again!",
    "hint.conceptual.observe":
      "Good question! Observe {focus} and separate the important information in the statement.",
    "hint.procedural.byParts":
      "You're doing well! Solve one part at a time and check each choice before moving on.",
    "hint.conceptual.reread":
      'Good question! Reread the instruction calmly: "{inst}". What is it asking you to do?',
    "hint.procedural.eachOption":
      "You're doing well! Read each option and think: which one answers exactly what the instruction asked?",
    "hint.procedural.divide":
      "You're doing well! Try breaking the problem into smaller parts. What would be the first step?",
    "hint.lead.bem": "You're doing well! ",
    "hint.example.addition.conceptual":
      "Good question! When we put two groups together, what operation do we use? Think about combining things...",
    "hint.example.addition.procedural":
      "You're doing well! First count group {A}, then continue counting {B} more from where you stopped.",
    "hint.bank.l1":
      "Good question! Observe {focus} and separate the important information in the statement.",
    "hint.bank.l2":
      "You're doing well! Solve one part at a time and check each choice before moving on.",
    "hint.bank.l3":
      "Almost there! Eliminate alternatives that don't match the main action of the step.",
    "hint.bank.l4":
      "You're very close! Review your reasoning from start to finish before answering.",
    "hint.focus.kc": "this skill ({kc})",
    "hint.focus.generic": "what the question is asking",
  },
  es: {
    "feedback.correct": "¡Muy bien! Respuesta correcta.",
    "feedback.misconception.fallback":
      "¡Casi! Elegiste {optLabel}, pero piensa con cuidado: la instrucción pide algo específico. ¡Vuelve a leer y prueba de nuevo!",
    "hint.conceptual.observe":
      "¡Buena pregunta! Observa {focus} y separa la información importante del enunciado.",
    "hint.procedural.byParts":
      "¡Vas muy bien! Resuelve una parte a la vez y revisa cada elección antes de seguir.",
    "hint.conceptual.reread":
      '¡Buena pregunta! Vuelve a leer la instrucción con calma: "{inst}". ¿Qué te está pidiendo que hagas?',
    "hint.procedural.eachOption":
      "¡Vas muy bien! Lee cada opción y piensa: ¿cuál responde exactamente lo que pide la instrucción?",
    "hint.procedural.divide":
      "¡Vas muy bien! Intenta dividir el problema en partes más pequeñas. ¿Cuál sería el primer paso?",
    "hint.lead.bem": "¡Vas muy bien! ",
    "hint.example.addition.conceptual":
      "¡Buena pregunta! Cuando juntamos dos grupos, ¿qué operación usamos? Piensa en juntar cosas...",
    "hint.example.addition.procedural":
      "¡Vas muy bien! Cuenta primero el grupo {A}, luego continúa contando {B} más desde donde paraste.",
    "hint.bank.l1":
      "¡Buena pregunta! Observa {focus} y separa la información importante del enunciado.",
    "hint.bank.l2":
      "¡Vas muy bien! Resuelve una parte a la vez y revisa cada elección antes de seguir.",
    "hint.bank.l3":
      "¡Casi! Elimina las alternativas que no coinciden con la acción principal del paso.",
    "hint.bank.l4":
      "¡Estás muy cerca! Revisa tu razonamiento desde el principio hasta el final antes de responder.",
    "hint.focus.kc": "esta habilidad ({kc})",
    "hint.focus.generic": "lo que pide la pregunta",
  },
  fr: {
    "feedback.correct": "Très bien! Bonne réponse.",
    "feedback.misconception.fallback":
      "Presque! Vous avez choisi {optLabel}, mais réfléchissez bien: l'instruction demande quelque chose de spécifique. Relisez et réessayez!",
    "hint.conceptual.observe":
      "Bonne question! Observe {focus} et sépare les informations importantes de l'énoncé.",
    "hint.procedural.byParts":
      "Tu te débrouilles bien! Résous une partie à la fois et vérifie chaque choix avant de continuer.",
    "hint.conceptual.reread":
      'Bonne question! Relis l\'instruction calmement: "{inst}". Que te demande-t-elle de faire?',
    "hint.procedural.eachOption":
      "Tu te débrouilles bien! Lis chaque option et pense: laquelle répond exactement à ce que demande l'instruction?",
    "hint.procedural.divide":
      "Tu te débrouilles bien! Essaie de diviser le problème en parties plus petites. Quelle serait la première étape?",
    "hint.lead.bem": "Tu te débrouilles bien! ",
    "hint.example.addition.conceptual":
      "Bonne question! Quand on rassemble deux groupes, quelle opération utilise-t-on? Pense à mettre ensemble...",
    "hint.example.addition.procedural":
      "Tu te débrouilles bien! Compte d'abord le groupe {A}, puis continue à compter {B} de plus à partir d'où tu t'es arrêté.",
    "hint.bank.l1":
      "Bonne question! Observe {focus} et sépare les informations importantes de l'énoncé.",
    "hint.bank.l2":
      "Tu te débrouilles bien! Résous une partie à la fois et vérifie chaque choix avant de continuer.",
    "hint.bank.l3":
      "Presque! Élimine les alternatives qui ne correspondent pas à l'action principale de l'étape.",
    "hint.bank.l4": "Tu es très près! Révise ton raisonnement du début à la fin avant de répondre.",
    "hint.focus.kc": "cette compétence ({kc})",
    "hint.focus.generic": "ce que la question demande",
  },
};

/**
 * Retorna string traduzida no idioma corrente (do AsyncLocalStorage) ou no
 * idioma forçado via segundo parâmetro. Vars são interpoladas via `{key}`.
 */
export function tStr(key, vars = null, lang = null) {
  let code = lang;
  if (!code) {
    try {
      code = getRequestContext().outputLanguageCode || "pt-BR";
    } catch {
      code = "pt-BR";
    }
  }
  const dict = STRINGS[code] || STRINGS["pt-BR"];
  let val = dict[key];
  if (val === undefined) val = STRINGS["pt-BR"][key];
  if (val === undefined) return key;
  if (vars && typeof val === "string") {
    val = val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
  }
  return val;
}
