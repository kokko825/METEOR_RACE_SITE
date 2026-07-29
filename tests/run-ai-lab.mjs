import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const output = path.join(root, ".ai-lab-fast");
fs.mkdirSync(path.join(output, "app"), { recursive: true });
fs.mkdirSync(path.join(output, "tests"), { recursive: true });
for (const file of ["app/game-rules.ts", "app/ai-engine.ts", "tests/ai-lab-simulation.ts"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g, 'from "$1.js"');
  fs.writeFileSync(path.join(output, file.replace(/\.ts$/, ".js")), code);
}
await import(`${pathToFileURL(path.join(output, "tests/ai-lab-simulation.js")).href}?t=${Date.now()}`);
