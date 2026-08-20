#!/usr/bin/env node

/**
 * Gate offline de limites de licença.
 *
 * Impede que o pacote de pesquisa seja publicado acidentalmente no npm e
 * exige que o texto MIT permaneça padrão, separado dos avisos sobre corpus e
 * materiais CTAT/Mathtutor. Não decide titularidade nem substitui autorização
 * escrita do titular.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const EXPECTED_MIT = `MIT License

Copyright (c) 2026 João Carlos Queiroz / EducaOFF

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const REQUIRED = [
  "LICENSE",
  "DATA-LICENSE.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/PEDIDO-AUTORIZACAO-CMU.md",
  "README.md",
  "CITATION.cff",
  "package.json",
];

const failures = [];

function read(relative) {
  const absolute = path.join(REPO, relative);
  if (!fs.existsSync(absolute)) {
    failures.push(`${relative}: arquivo obrigatório ausente`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8").replaceAll("\r\n", "\n");
}

function requireCondition(condition, message) {
  if (!condition) failures.push(message);
}

for (const relative of REQUIRED) read(relative);

const license = read("LICENSE");
requireCondition(
  license === EXPECTED_MIT,
  "LICENSE: o texto MIT padrão foi alterado; esclarecimentos de escopo devem ficar fora dele",
);

const dataRights = read("DATA-LICENSE.md");
requireCondition(
  dataRights.startsWith("# Situação dos direitos sobre dados e corpus\n\n**Este arquivo não concede licença"),
  "DATA-LICENSE.md: deve começar declarando que não concede licença",
);
requireCondition(
  dataRights.includes("THIRD_PARTY_NOTICES.md"),
  "DATA-LICENSE.md: falta ligação ao inventário de terceiros",
);

const notices = read("THIRD_PARTY_NOTICES.md");
const pinnedCtatLicense =
  "https://github.com/CMUCTAT/CTAT/blob/4716009beab7f9b9099b822b30f8770bb4cdca08/LICENSE.md";
requireCondition(
  notices.includes(pinnedCtatLicense),
  "THIRD_PARTY_NOTICES.md: falta a fonte oficial do acordo CTAT fixada por commit",
);
for (const unit of ["6.17", "6.18", "6.19", "6.20", "7.12", "8.12"]) {
  requireCondition(
    notices.includes(`packages/${unit}%20HTML/`),
    `THIRD_PARTY_NOTICES.md: falta a fonte Mathtutor da unidade ${unit}`,
  );
}
requireCondition(
  /não (?:reproduz|funciona como sublicença)|não funciona como sublicença/i.test(notices),
  "THIRD_PARTY_NOTICES.md: deve negar expressamente qualquer sublicença CTAT",
);

const permissionRequest = read("docs/PEDIDO-AUTORIZACAO-CMU.md");
requireCondition(
  permissionRequest.includes("## Versão em português") &&
    permissionRequest.includes("## English version"),
  "docs/PEDIDO-AUTORIZACAO-CMU.md: o pedido deve permanecer bilíngue",
);
requireCondition(
  permissionRequest.includes("Não interpretarei a ausência de resposta como autorização") &&
    permissionRequest.includes("I will not interpret silence as permission"),
  "docs/PEDIDO-AUTORIZACAO-CMU.md: falta a regra de que silêncio não autoriza",
);

const readme = read("README.md");
for (const link of [
  "DATA-LICENSE.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/PEDIDO-AUTORIZACAO-CMU.md",
]) {
  requireCondition(readme.includes(link), `README.md: falta referência a ${link}`);
}
requireCondition(
  readme.includes("6 conjuntos") && readme.includes("5 conjuntos"),
  "README.md: deve distinguir seis conjuntos materializados de cinco analisados",
);

const citation = read("CITATION.cff");
requireCondition(
  /^version: "0\.7\.0"$/m.test(citation),
  "CITATION.cff: versão esperada 0.7.0",
);
requireCondition(
  citation.includes("A licença MIT aplica-se somente ao") &&
    citation.includes("THIRD_PARTY_NOTICES.md"),
  "CITATION.cff: deve limitar MIT ao software original e apontar os avisos",
);

let packageJson = null;
try {
  packageJson = JSON.parse(read("package.json"));
} catch (error) {
  failures.push(`package.json: JSON inválido (${error.message})`);
}
if (packageJson) {
  requireCondition(
    packageJson.private === true,
    "package.json: `private` deve ser true para impedir publicação npm acidental",
  );
  requireCondition(packageJson.license === "MIT", "package.json: licença do software deve ser MIT");
  requireCondition(packageJson.version === "0.7.0", "package.json: versão esperada 0.7.0");
  requireCondition(
    !packageJson.scripts?.publish && !packageJson.scripts?.prepublishOnly,
    "package.json: scripts de publicação npm não são permitidos neste pacote privado",
  );
  requireCondition(
    packageJson.scripts?.["verify:offline"]?.includes("license:verify"),
    "package.json: verify:offline deve executar license:verify",
  );
}

if (failures.length) {
  console.error(`Gate de licenças reprovado (${failures.length} problema(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  "Gate de licenças aprovado: pacote npm privado, MIT preservada e avisos de terceiros presentes.",
);
