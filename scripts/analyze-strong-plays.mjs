import { execFileSync } from "node:child_process";

const allowedCategories = new Set(["finish", "escape", "multi_pressure", "advance_pressure", "self_propulsion", "future_gate", "item_swing"]);
const categoryArg = process.argv.find((value) => value.startsWith("--category="))?.split("=")[1] ?? "";
const daysArg = Number(process.argv.find((value) => value.startsWith("--days="))?.split("=")[1] ?? 30);
if (categoryArg && !allowedCategories.has(categoryArg)) throw new Error("Unknown strong-play category");
const days = Math.max(1, Math.min(90, Number.isFinite(daysArg) ? Math.round(daysArg) : 30));
const since = Date.now() - days * 86_400_000;
const categoryWhere = categoryArg ? ` AND category = '${categoryArg}'` : "";
const query = `SELECT category, variant, difficulty, board_size,
  COUNT(*) AS plays, ROUND(AVG(score), 1) AS average_score, MAX(score) AS best_score
  FROM strong_plays WHERE created_at >= ${since}${categoryWhere}
  GROUP BY category, variant, difficulty, board_size
  ORDER BY plays DESC, average_score DESC LIMIT 100`;
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const output = execFileSync(executable, ["wrangler", "d1", "execute", "meteor-race-db", "--remote", "--command", query, "--json"], {
  cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"],
});
const parsed = JSON.parse(output);
const rows = Array.isArray(parsed) ? parsed.flatMap((entry) => entry.results ?? []) : parsed.results ?? [];
console.log(`METEOR RACE strong plays / last ${days} days${categoryArg ? ` / ${categoryArg}` : ""}`);
console.table(rows);
