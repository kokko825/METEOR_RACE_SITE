import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const root = process.cwd(), output = path.join(root, ".switch-ai-fast");
for (const file of ["config/game-balance.ts", "app/balance-config.ts", "app/game-rules.ts", "app/ai-engine.ts", "tests/switch-ai-simulation.ts"]) {
  const destination = path.join(output, file.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g, 'from "$1.js"');
  fs.writeFileSync(destination, code);
}
await import(`${pathToFileURL(path.join(output, "tests/switch-ai-simulation.js")).href}?t=${Date.now()}`);
