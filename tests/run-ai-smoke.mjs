// Daily regression: one complete match per difficulty on the smallest board.
// Full balance evaluation remains available through `npm run test:ai`.
process.env.AI_LAB_GAMES = "1";
process.env.AI_LAB_SCENARIO = "classic-9";
await import("./run-ai-lab.mjs");
