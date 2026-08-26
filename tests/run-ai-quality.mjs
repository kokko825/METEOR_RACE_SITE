import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function run(difficulty, extraEnv = {}) {
  const result = spawnSync(process.execPath, ["tests/run-ai-lab.mjs", difficulty], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AI_LAB_GAMES: "4",
      AI_LAB_SUMMARY: "1",
      AI_LAB_ASSERT_QUALITY: "1",
      ...extraEnv,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  const reports = result.stdout.trim().split(/\r?\n/).filter((line) => line.startsWith("{")).map(JSON.parse);
  for (const report of reports) console.log(JSON.stringify(report));
  return reports;
}

for (const difficulty of ["easy", "normal", "hard"]) run(difficulty);

function assertDifficultyGap(variant, size) {
  const [report] = run("normal", {
    AI_LAB_GAMES: "48",
    AI_LAB_ASSERT_QUALITY: "0",
    AI_LAB_SCENARIO: `${variant}-${size}`,
    AI_LAB_RED_DIFFICULTY: "normal",
    AI_LAB_BLUE_DIFFICULTY: "easy",
  });
  assert.ok(report.wins.red / report.games >= 0.6, `${variant}-${size}: NORMAL must clearly outperform EASY`);
  const [hardReport] = run("hard", {
    AI_LAB_GAMES: "32",
    AI_LAB_ASSERT_QUALITY: "0",
    AI_LAB_SCENARIO: `${variant}-${size}`,
    AI_LAB_RED_DIFFICULTY: "hard",
    AI_LAB_BLUE_DIFFICULTY: "normal",
  });
  assert.ok(hardReport.wins.red / hardReport.games >= 0.7, `${variant}-${size}: HARD must clearly outperform NORMAL`);
}

assertDifficultyGap("classic", 9);
assertDifficultyGap("item", 11);
console.log("ai-quality: pacing, decision hygiene and difficulty separation passed");
