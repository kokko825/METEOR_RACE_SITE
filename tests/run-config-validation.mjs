import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = process.cwd();
const output = path.join(root, ".config-test-fast");
for (const file of [
  "config/game-balance.ts",
  "config/site-presentation.ts",
  "app/balance-config.ts",
  "app/site-config.ts",
  "tests/config-validation.test.ts",
]) {
  const destination = path.join(output, file.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g, 'from "$1.js"');
  fs.writeFileSync(destination, code);
}
await import(`${pathToFileURL(path.join(output, "tests/config-validation.test.js")).href}?t=${Date.now()}`);
