#!/bin/bash
# Re-materializa os 4 corpora antigos com o espelho v3 (produção 5263488,
# registro de componentes completo: 44). O 8.12 já nasceu em v3.
set -u
cd /root/sti-graph-validation
R=/root/sti-graph-validation/resultados
mat () {  # $1=dataset  $2=pasta  $3=braço
  export STI_DATASET=$1
  node -r dotenv/config scripts/materializar-lote.mjs --runs $2/fixa-$3/runs --out $2/materializado-v3-fixa-$3 --yes > $2/log-mat-v3-$3.txt 2>&1
  echo "EXIT=$?" >> $2/log-mat-v3-$3.txt
}
mat frac-numberline-6.17 $R/rodada4-interface-fixa-2026-08-15 custo-beneficio
mat frac-numberline-6.17 $R/rodada4-interface-fixa-2026-08-15 estudantes-qwen
mat frac-estimates-6.19  $R/bloco1-mathtutor-2026-08-16/6.19  custo-beneficio
mat frac-estimates-6.19  $R/bloco1-mathtutor-2026-08-16/6.19  estudantes-qwen
mat equiv-fractions-6.18 $R/bloco1-mathtutor-2026-08-16/6.18  custo-beneficio
mat equiv-fractions-6.18 $R/bloco1-mathtutor-2026-08-16/6.18  estudantes-qwen
mat fraction-ordering-6.20 $R/bloco1-mathtutor-2026-08-16/6.20 custo-beneficio
mat fraction-ordering-6.20 $R/bloco1-mathtutor-2026-08-16/6.20 estudantes-qwen
echo TODOS-V3-OK > $R/EXPERIMENTO-CONSOLIDADO-2026-08/v3-terminou.txt
