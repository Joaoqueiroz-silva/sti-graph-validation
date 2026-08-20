export {
  normalizarComponente,
  normalizarAcao,
  normalizarValor,
  FAMILIAS_ACAO,
  familiaDeAcao,
  familiaDeInteracaoEstruturada,
  coberturaFamiliasAcao,
  coberturaResolucaoMaterializada,
  extrairAtomosCtat,
  extrairErrosCtat,
  coletarCandidatosAlvo,
  extrairAtomosMaterializados,
  extrairErrosMaterializados,
} from "./atomos.mjs";

export {
  tierDeCompatibilidade,
  alinharLcs,
  alinharReguas,
  alinharAtomos,
  parearErrosUmParaUm,
} from "./alinhamento.mjs";

export {
  contemValorComoToken,
  medirDicasAncoradas,
  construirLedgerExtras,
  analisarRegistro,
} from "./metricas.mjs";

export {
  PAINEL_SCHEMA,
  SEED_PAINEL,
  TIPOS_ITEM,
  COTAS_POR_ESTRATO,
  JUIZES_CONGELADOS,
  GATES,
  construirFrameDeResultados,
  selecionarAmostraEstratificada,
  construirControlesFixos,
  criarEnvelopeCego,
  prepararPlanoPainel,
  validarJulgamento,
  avaliarGateJuiz,
  krippendorffAlphaNominal,
  consolidarPainel,
  estimarOrcamentoPainel,
} from "./painel-automatizado.mjs";
