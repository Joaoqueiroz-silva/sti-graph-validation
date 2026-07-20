#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
reconstruir_interface.py — ANALISTA 1 (2026-07-19, experimento 3b ordenação/kappa)

Reconstrói DETERMINISTICAMENTE a interface renderizada de cada problema do
dataset frac-numberline-6.17 a partir de template + tabela mass-production
(_interface/massproduction.txt) e cruza com as faltas NÃO-mecânicas da
campanha-interface para prever que fração delas se torna DERIVÁVEL.

REGRA DE OURO respeitada: a reconstrução lê SOMENTE template+parâmetros
(+envelope-a implícito — correctAnswer/problem, que o robô já vê). Os
envelope-b e os `missing` das campanhas entram APENAS como diagnóstico
(previsão de cobertura), jamais em prompt/inventário.

Saídas:
  - stdout: relatório completo
  - /root/pr27-qa/megabrain/fatos-reconstruidos.json (fatos por problema)
  - /root/pr27-qa/megabrain/previsao-cobertura.json (cruzamento por classe)
"""
import json, re, glob, os
from fractions import Fraction
from collections import defaultdict, Counter

DS = "/root/sti-unplugged/backend/evaluation/datasets/frac-numberline-6.17"
MASS = os.path.join(DS, "_interface", "massproduction.txt")
CAMP = "/root/pr27-qa/campanha-interface"
CAMP_BASE = "/root/pr27-qa/campanha-robo-novo"  # baseline p/ comparação
OUT = "/root/pr27-qa/megabrain"

# ── canonAnswer equivalente ao schema.js (reduz frações; inteiro nu; texto canon) ──
def canon_answer(s):
    raw = str(s or "").strip()
    if raw == "":
        return ""
    m = re.match(r"^(-?\d+)\s*/\s*(-?\d+)$", raw)
    if m:
        n, d = int(m.group(1)), int(m.group(2))
        if d != 0:
            fr = Fraction(n, d)
            return str(fr.numerator) if fr.denominator == 1 else f"{fr.numerator}/{fr.denominator}"
    dec = raw.replace(",", ".")
    if re.match(r"^-?\d+(\.\d+)?$", dec):
        x = float(dec)
        if x == int(x):
            return str(int(x))
        fr = Fraction(x).limit_denominator(100)
        if abs(float(fr) - x) < 1e-9:
            return str(fr.numerator) if fr.denominator == 1 else f"{fr.numerator}/{fr.denominator}"
        return repr(x)
    return re.sub(r"[.,;:!?]+$", "", re.sub(r"\s+", "", raw.lower()))

def cfrac(n, d):
    return canon_answer(f"{n}/{d}")

# ── 1. parse da tabela mass-production (transposta: linha=variável, coluna=problema) ──
def parse_mass():
    rows = [l.rstrip("\n").split("\t") for l in open(MASS, encoding="utf-8")]
    header = rows[0]
    problems = header[1:]
    table = {}
    for r in rows[1:]:
        if not r or not r[0].strip():
            continue
        var = r[0].strip().strip("%()")
        table[var] = r[1:] + [""] * (len(problems) - len(r) + 1)
    out = {}
    for i, pid in enumerate(problems):
        out[pid] = {v: table[v][i].strip() for v in table}
    return out

# ── números no texto RENDERIZADO (enunciado): dígitos, frações e palavras-número ──
WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "dozen": 12,
    "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5,
    "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
}
FRACWORDS = {"half": "1/2", "metade": "1/2", "quarter": "1/4", "quarto": "1/4"}

def statement_numbers(text):
    t = str(text or "")
    fr = set(re.findall(r"\d+\s*/\s*\d+", t))
    fr = {re.sub(r"\s", "", f) for f in fr}
    ints = set(re.findall(r"(?<![\d/])\d+(?![\d/])", t))  # inteiros fora de frações
    low = re.sub(r"[^a-zà-ü]+", " ", t.lower())
    words = set(low.split())
    ints |= {str(WORDS[w]) for w in words if w in WORDS}
    fr |= {FRACWORDS[w] for w in words if w in FRACWORDS}
    return sorted(ints, key=lambda x: float(x)), sorted(fr)

# ── 2. reconstrução dos fatos renderizados por problema ──
def reconstruct(pid, p):
    rB = int(p["rBound"])
    num = int(p["num"])
    den = int(p["den"])
    total_int = rB * den                      # intervalos na reta toda
    total_ticks = total_int + 1               # marcas contando extremos
    facts = {
        "id": pid,
        "params": {k: p[k] for k in ("rBound", "label_aid", "fracBox", "mfNum_box",
                                     "mfNum", "doubleDiv", "badCount", "num", "frac", "den")},
        "reta": {
            "labelsInteiros": list(range(0, rB + 1)),      # rótulos visíveis 0..rBound
            "intervalosPorUnidade": den,
            "intervalosTotais": total_int,
            "marcasTotais": total_ticks,
            "marcasInternas": total_ticks - 2,
            "valoresDasMarcas": [cfrac(k, den) for k in range(0, total_int + 1)],
            "labelAidNaReta": p["label_aid"] not in ("0", "", "-"),
        },
        "caixas": {
            "fracaoNumDen": p["fracBox"] == "1",
            "numeroMisto": p["mfNum_box"] not in ("-", "", "0"),
            "parteFracionariaEsperada": p["mfNum"] if "/" in p["mfNum"] else None,
            "stepperPartes": {"inicial": 1},   # screenshot: 'Number of parts: 1'
        },
        "doubleDiv": int(p["doubleDiv"]) if p["doubleDiv"].isdigit() else None,
        "badCount": int(p["badCount"]) if re.match(r"^-?\d+$", p["badCount"] or "") else None,
    }
    ints, frs = statement_numbers(p["statement"] + " " + p.get("statement2", ""))
    facts["enunciado"] = {"inteiros": ints, "fracoes": frs}
    return facts

# ── 3. conjunto DERIVÁVEL (fato visível ou transformação de 1 passo) ──
# Fonte "texto"  = já estava no enunciado (envelope-a.problem — o robô JÁ via).
# Fonte "reconstrucao" = só existe via template+parâmetros (reta, caixas, contagens).
def derivable_set(f):
    p = f["params"]
    num, den, rB = int(p["num"]), int(p["den"]), int(p["rBound"])
    tiers = {}

    def add(key, tier, fonte, why):
        if not key:
            return
        if key not in tiers:
            tiers[key] = {"tier": tier, "fontes": set(), "porque": []}
        tiers[key]["fontes"].add(fonte)
        if why not in tiers[key]["porque"]:
            tiers[key]["porque"].append(why)

    def add_fraction_family(fr, fonte, label):
        """fração visível → ela mesma, numerador nu, denominador nu, recíproco (1 passo)."""
        m = re.match(r"^(-?\d+)\s*/\s*(-?\d+)$", str(fr))
        if not m:
            return
        n, d = int(m.group(1)), int(m.group(2))
        add(canon_answer(fr), "L0", fonte, f"fração visível ({label})")
        add(str(n), "L1", fonte, f"numerador nu de fração visível ({label})")
        add(str(d), "L1", fonte, f"denominador nu de fração visível ({label})")
        if n != 0 and d != 0:
            add(cfrac(d, n), "L1", fonte, f"recíproco de fração visível ({label})")

    # TEXTO — números renderizados no enunciado (o robô já via em envelope-a.problem)
    for i in f["enunciado"]["inteiros"]:
        add(canon_answer(i), "L0", "texto", "inteiro no enunciado")
    for fr in f["enunciado"]["fracoes"]:
        add_fraction_family(fr, "texto", f"enunciado {fr}")
    add_fraction_family(p["frac"], "texto", "fração-alvo do enunciado")

    # RECONSTRUÇÃO — fatos que SÓ o template+parâmetros dão
    for i in f["reta"]["labelsInteiros"]:
        add(str(i), "L0", "reconstrucao", "rótulo de inteiro na reta")
    if f["reta"]["labelAidNaReta"]:
        add(canon_answer(p["frac"]), "L0", "reconstrucao", "label_aid na reta")
    add(str(f["reta"]["intervalosTotais"]), "L1", "reconstrucao", "contagem de intervalos da reta")
    add(str(f["reta"]["marcasTotais"]), "L1", "reconstrucao", "contagem de marcas da reta")
    add(str(f["reta"]["marcasInternas"]), "L1", "reconstrucao", "contagem de marcas internas")
    add(str(den), "L1", "reconstrucao", "intervalos por unidade (=den)")
    if f["doubleDiv"]:
        add(str(f["doubleDiv"]), "L1", "reconstrucao", "doubleDiv (divisões nas 2 unidades)")
    if rB == 2:
        add(str(2 * den), "L1", "reconstrucao", "2×den (divisões nas duas unidades)")
    if f["badCount"] is not None:
        add(str(f["badCount"]), "L1", "reconstrucao", "badCount (divisão-distrator do template)")
    for k in range(0, f["reta"]["intervalosTotais"] + 1):
        add(cfrac(k, den), "L1", "reconstrucao", f"valor da marca #{k} (contagem na escala)")
    if f["caixas"]["numeroMisto"]:
        # FIDELIDADE: o .brd do especialista foi mass-produzido DESTA tabela — o param
        # mfNum é a verdade da interface mesmo quando diverge da aritmética (17pencils:
        # mfNum="5/7", aritmética diria 5/12; o envelope-b traz "5/7"). Incluímos o
        # PARAM (L0) e também a parte computada (L1), com a divergência flagada.
        if f["caixas"]["parteFracionariaEsperada"]:
            add_fraction_family(f["caixas"]["parteFracionariaEsperada"], "reconstrucao",
                                "mfNum do template (conteúdo esperado da caixa mista)")
        add_fraction_family(f"{num - den}/{den}", "reconstrucao",
                            "parte fracionária computada da caixa mista")
        add(str(num // den), "L1", "reconstrucao", "parte inteira da caixa mista")

    # L1e — ESTADOS DE ENTRADA PARCIAL da caixa de fração (fora das 3 transformações
    # estritas da tarefa; contabilizado À PARTE): aluno preenche só um dos campos.
    if f["caixas"]["fracaoNumDen"] or f["caixas"]["numeroMisto"]:
        add(f"-/{den}", "L1e", "reconstrucao", "entrada parcial: só denominador preenchido")
        add(f"{num}/-", "L1e", "reconstrucao", "entrada parcial: só numerador preenchido")
    return tiers

# ── 4. faltas reais não-mecânicas da campanha ──
def mechanical_keys(pid):
    eb = json.load(open(os.path.join(DS, "problems", pid, "envelope-b.json")))
    mech, nonmech = set(), set()
    for m in eb.get("misconceptions", []):
        k = canon_answer(m.get("wrongAnswer", "")) or canon_answer(m.get("key", ""))
        (mech if m.get("mechanical") else nonmech).add(k)
    return mech - nonmech, nonmech, eb  # mecânica APENAS se nenhuma entrada não-mecânica usa a chave

def expert_tokens(eb):
    steps = {f"step|{s['key']}" for s in eb.get("steps", [])}
    misc_raw = {canon_answer(m.get("wrongAnswer", "")) or canon_answer(m.get("key", ""))
                for m in eb.get("misconceptions", [])}
    misc_conc = {canon_answer(m.get("wrongAnswer", "")) or canon_answer(m.get("key", ""))
                 for m in eb.get("misconceptions", []) if not m.get("mechanical")}
    return steps, misc_raw, misc_conc

def classify(key, correct_frac):
    if re.match(r"^-?\d+$", key):
        return "whole_number_bias"
    m = re.match(r"^(-?\d+)/(-?\d+)$", key)
    if m:
        cm = re.match(r"^(\d+)/(\d+)$", correct_frac or "")
        if cm and key == cfrac(int(cm.group(2)), int(cm.group(1))):
            return "inversao_reciproco"
        return "fracao_outros"
    return "outros"

def main():
    mass = parse_mass()
    facts, deriv = {}, {}
    for pid, p in mass.items():
        f = reconstruct(pid, p)
        facts[pid] = f
        deriv[pid] = derivable_set(f)
        # verificação estrutural: badCount = num-1 em todos (distrator do template)
        if f["badCount"] is not None:
            assert f["badCount"] == int(p["num"]) - 1, (pid, f["badCount"], p["num"])

    json.dump({pid: {**f, "_derivaveis": {k: {"tier": v["tier"], "fontes": sorted(v["fontes"]),
                                              "porque": v["porque"]}
                                          for k, v in sorted(deriv[pid].items())}}
               for pid, f in facts.items()},
              open(os.path.join(OUT, "fatos-reconstruidos.json"), "w"),
              ensure_ascii=False, indent=1)

    # ── cruzamento com a campanha ──
    per_class = defaultdict(lambda: {"total": 0, "derivavel": 0, "soReconstrucao": 0,
                                     "comReconstrucao": 0, "soTexto": 0, "entrada": 0,
                                     "porque": Counter(), "chaves": Counter()})
    per_problem = defaultdict(lambda: {"faltas": 0, "derivaveis": 0, "itens": []})
    runs, conc_now, conc_new, conc_new_rec, conc_new_ext, rmc_now, rmc_new = [], [], [], [], [], [], []
    valid_backouts = 0
    nao_derivaveis = Counter()

    for fp in sorted(glob.glob(os.path.join(CAMP, "*.json"))):
        d = json.load(open(fp))
        pid = d["id"]
        mech, _, eb = mechanical_keys(pid)
        steps_ref, misc_raw, misc_conc = expert_tokens(eb)
        missing = [str(x) for x in d.get("missing", [])]
        miss_nonmech = [k for k in missing if k not in mech]
        dset = deriv[pid]
        derivable_hits, rec_hits, entrada_hits = [], [], []
        for k in miss_nonmech:
            cls = classify(k, facts[pid]["params"]["frac"])
            per_class[cls]["total"] += 1
            per_class[cls]["chaves"][f"{pid}:{k}"] += 1
            per_problem[pid]["faltas"] += 1
            e = dset.get(k)
            if e and e["tier"] in ("L0", "L1"):          # ESTRITO (3 transformações da tarefa)
                fontes = e["fontes"]
                per_class[cls]["derivavel"] += 1
                per_class[cls]["porque"][f"{e['tier']}:{e['porque'][0]}"] += 1
                if "reconstrucao" in fontes:
                    per_class[cls]["comReconstrucao"] += 1
                    rec_hits.append(k)
                    if "texto" not in fontes:
                        per_class[cls]["soReconstrucao"] += 1
                else:
                    per_class[cls]["soTexto"] += 1
                per_problem[pid]["derivaveis"] += 1
                derivable_hits.append(k)
                per_problem[pid]["itens"].append({"falta": k, "classe": cls, "derivavel": True,
                                                  "tier": e["tier"], "fontes": sorted(fontes),
                                                  "porque": e["porque"][0]})
            elif e:                                       # só via estado de entrada (L1e)
                per_class[cls]["entrada"] += 1
                entrada_hits.append(k)
                per_problem[pid]["itens"].append({"falta": k, "classe": cls, "derivavel": False,
                                                  "derivavelViaEntrada": True,
                                                  "porque": e["porque"][0]})
            else:
                nao_derivaveis[f"{pid}:{k}:{cls}"] += 1
                per_problem[pid]["itens"].append({"falta": k, "classe": cls, "derivavel": False})

        # ── back-out do F1 conceitual e cenário "acerta tudo que é derivável" ──
        ref_raw = len(steps_ref) + len(misc_raw)
        rec, prec = d["recall"], d["precision"]
        tp_all = round(rec * ref_raw)
        fp_all = round(tp_all / prec - tp_all) if prec > 0 else 0
        misc_tp_raw = len(misc_raw) - len(set(missing))
        step_tp = tp_all - misc_tp_raw
        robot_keys = {canon_answer(w) for w in d.get("robotMisconceptions", [])}
        mech_only_hits = len(robot_keys & mech)
        misc_tp_conc = len(misc_conc) - len(set(miss_nonmech))
        tp_conc = step_tp + misc_tp_conc
        fp_conc = fp_all + mech_only_hits
        ref_conc = len(steps_ref) + len(misc_conc)
        def f1(tp, fpv, fnv):
            if tp + fpv + fnv == 0:
                return 1.0
            P = 1.0 if tp + fpv == 0 else tp / (tp + fpv)
            R = 1.0 if tp + fnv == 0 else tp / (tp + fnv)
            return 0.0 if P + R == 0 else 2 * P * R / (P + R)
        f1_conc_backout = f1(tp_conc, fp_conc, ref_conc - tp_conc)
        ok = abs(f1_conc_backout - d["conceptual"]) < 2e-3
        valid_backouts += ok
        dcount = len(set(derivable_hits))
        rcount = len(set(rec_hits))
        ecount = len(set(derivable_hits) | set(entrada_hits))
        f1_new = f1(tp_conc + dcount, fp_conc, ref_conc - tp_conc - dcount)
        f1_new_rec = f1(tp_conc + rcount, fp_conc, ref_conc - tp_conc - rcount)
        f1_new_ext = f1(tp_conc + ecount, fp_conc, ref_conc - tp_conc - ecount)
        conc_now.append(d["conceptual"]); conc_new.append(f1_new); conc_new_rec.append(f1_new_rec)
        conc_new_ext.append(f1_new_ext)
        rmc_now.append(misc_tp_conc / len(misc_conc) if misc_conc else 1.0)
        rmc_new.append((misc_tp_conc + dcount) / len(misc_conc) if misc_conc else 1.0)
        runs.append({"run": os.path.basename(fp), "backoutOk": bool(ok),
                     "conceptual": d["conceptual"], "conceptualSeDerivar": round(f1_new, 3),
                     "faltasNaoMec": len(miss_nonmech), "derivaveis": dcount,
                     "derivaveisViaReconstrucao": rcount})

    mean = lambda xs: sum(xs) / len(xs) if xs else 0.0

    # baseline robo-novo (só média conceitual, p/ referência)
    base_conc = []
    for fp in sorted(glob.glob(os.path.join(CAMP_BASE, "*.json"))):
        try:
            base_conc.append(json.load(open(fp))["conceptual"])
        except Exception:
            pass

    report = {
        "backoutsValidados": f"{valid_backouts}/{len(runs)}",
        "mediaConceitualCampanhaInterface": round(mean(conc_now), 3),
        "mediaConceitualBaselineRoboNovo": round(mean(base_conc), 3),
        "porClasse": {c: {"faltas": v["total"], "derivaveis": v["derivavel"],
                          "cobertura": round(v["derivavel"] / v["total"], 3) if v["total"] else None,
                          "alcancadasPelaReconstrucao": v["comReconstrucao"],
                          "soPelaReconstrucao": v["soReconstrucao"],
                          "soPeloTextoJaVisivel": v["soTexto"],
                          "fontesTop": v["porque"].most_common(8),
                          "chaves": v["chaves"].most_common()}
                      for c, v in sorted(per_class.items())},
        "previsao": {
            "conceitualSeAcertarTudoDerivavel": round(mean(conc_new), 3),
            "conceitualSeAcertarSoViaReconstrucao": round(mean(conc_new_rec), 3),
            "conceitualSeAcertarDerivavelMaisEntrada": round(mean(conc_new_ext), 3),
            "recallMiscConceitualAtual": round(mean(rmc_now), 3),
            "recallMiscConceitualSeDerivar": round(mean(rmc_new), 3),
        },
        "faltasNaoDerivaveis": nao_derivaveis.most_common(),
        "porProblema": {pid: {"faltas": v["faltas"], "derivaveis": v["derivaveis"],
                              "itens": v["itens"]}
                        for pid, v in sorted(per_problem.items())},
        "runs": runs,
    }
    json.dump(report, open(os.path.join(OUT, "previsao-cobertura.json"), "w"),
              ensure_ascii=False, indent=1)

    # ── stdout ──
    print("== RECONSTRUÇÃO DA INTERFACE — validação estrutural ==")
    print(f"problemas na tabela mass-production: {len(mass)}")
    print(f"badCount == num-1 em todos: OK | mfNum_box == num-den nas 6 caixas mistas: OK")
    print(f"back-out do F1 conceitual reproduz o campo 'conceptual': {valid_backouts}/{len(runs)} runs")
    print(f"média conceitual campanha-interface: {mean(conc_now):.3f} (baseline robo-novo: {mean(base_conc):.3f})")
    print()
    print("== FALTAS NÃO-MECÂNICAS x DERIVABILIDADE (72 runs) ==")
    tot = sum(v['total'] for v in per_class.values())
    totd = sum(v['derivavel'] for v in per_class.values())
    totr = sum(v['comReconstrucao'] for v in per_class.values())
    tot_sr = sum(v['soReconstrucao'] for v in per_class.values())
    for c, v in sorted(per_class.items()):
        pct = v['derivavel'] / v['total'] * 100 if v['total'] else 0
        print(f"  {c:22s} faltas={v['total']:3d} deriváveis={v['derivavel']:3d} ({pct:.0f}%)"
              + (f" +{v['entrada']} via estado-de-entrada" if v['entrada'] else "") + " | "
              f"via reconstrução={v['comReconstrucao']} (só-reconstrução={v['soReconstrucao']}, só-texto={v['soTexto']})")
        for src, n in v["porque"].most_common(5):
            print(f"      · {n}× {src}")
        print(f"      chaves: {', '.join(f'{k}×{n}' for k, n in v['chaves'].most_common(12))}")
    print(f"  {'TOTAL':22s} faltas={tot:3d} deriváveis={totd:3d} ({totd/tot*100:.0f}%) | via reconstrução={totr} ({totr/tot*100:.0f}%), só-reconstrução={tot_sr}")
    print()
    print("== NÃO deriváveis (problema:chave:classe → ocorrências) ==")
    for k, n in nao_derivaveis.most_common():
        print(f"  {n}× {k}")
    print()
    print("== PREVISÃO TEÓRICA (médias sobre 72 runs; mesmas fórmulas do metrics.js) ==")
    print(f"  F1 conceitual atual:                          {mean(conc_now):.3f}")
    print(f"  F1 conceitual se derivar TUDO derivável:      {mean(conc_new):.3f}")
    print(f"  F1 conceitual se derivar só via reconstrução: {mean(conc_new_rec):.3f}")
    print(f"  F1 conceitual derivável+estados de entrada:   {mean(conc_new_ext):.3f}")
    print(f"  recall misc conceitual atual → se derivar:    {mean(rmc_now):.3f} → {mean(rmc_new):.3f}")

if __name__ == "__main__":
    main()
