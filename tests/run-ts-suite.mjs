import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** Compile explicit dependencies. npm run typecheck checks their types separately. */
export async function runTsSuite(directory, files, entry) {
  const output = path.resolve(directory);
  for (const file of files) {
    const destination = path.join(output, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace(/from "(\.[^"]+)(?<!\.js)"/g, 'from "$1.js"');
    fs.writeFileSync(destination, code);
  }
  await import(pathToFileURL(path.join(output, entry.replace(/\.ts$/, ".js"))).href);
}
