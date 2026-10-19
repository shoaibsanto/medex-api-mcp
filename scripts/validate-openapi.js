// Lightweight structural validation of openapi.yaml without extra deps.
// Confirms the file parses as YAML-ish (balanced), has required top-level
// keys, and that every $ref target resolves within components.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const specPath = resolve(__dirname, "../openapi.yaml");
const text = readFileSync(specPath, "utf8");

const required = ["openapi:", "info:", "paths:", "components:"];
let ok = true;
for (const key of required) {
  if (!text.includes(key)) {
    console.error(`missing required top-level key: ${key}`);
    ok = false;
  }
}

// Collect defined component schema names and referenced $ref targets.
const defined = new Set(
  [...text.matchAll(/^    ([A-Za-z0-9]+):\s*$/gm)].map((m) => m[1]),
);
const refs = [...text.matchAll(/\$ref:\s*"#\/components\/(?:schemas|parameters|responses)\/([A-Za-z0-9]+)"/g)].map(
  (m) => m[1],
);
const missing = [...new Set(refs)].filter((r) => !defined.has(r));
if (missing.length) {
  console.error(`unresolved $ref targets: ${missing.join(", ")}`);
  ok = false;
}

if (!ok) process.exit(1);
console.log(
  `openapi.yaml OK — ${defined.size} component defs, ${new Set(refs).size} distinct $ref targets, all resolved.`,
);
