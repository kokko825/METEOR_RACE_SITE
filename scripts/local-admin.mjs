import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const allowedExtensions = new Set([".mp3", ".wav", ".ogg"]);
const simpleSlots = new Map([
  ["title", "title"],
  ["fanfare", "fanfare"],
  ["waiting", "waiting"],
  ["game-start", "game-start"],
]);
const tracks = new Set(["meteor", "orbit", "zero_gravity", "cosmic_error"]);
const stems = new Set(["base", "pulse", "rhythm", "tension", "final"]);

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 42 * 1024 * 1024) throw new Error("音源は40MB以下にしてください");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function replaceAudio(directory, stem, extension, bytes) {
  await mkdir(directory, { recursive: true });
  for (const name of await readdir(directory)) {
    if (name.startsWith(`${stem}.`) && allowedExtensions.has(extname(name).toLowerCase())) {
      await unlink(join(directory, name));
    }
  }
  const target = join(directory, `${stem}${extension}`);
  await writeFile(target, bytes);
  return target;
}

async function upload(body) {
  const extension = extname(String(body.fileName ?? "")).toLowerCase();
  if (!allowedExtensions.has(extension)) throw new Error("MP3・WAV・OGGだけ選べます");
  const match = /^data:audio\/[a-z0-9.+-]+;base64,(.+)$/i.exec(String(body.dataUrl ?? ""));
  if (!match) throw new Error("音源データを読み込めませんでした");
  const bytes = Buffer.from(match[1], "base64");
  const slot = String(body.slot ?? "");
  if (simpleSlots.has(slot)) {
    const stem = simpleSlots.get(slot);
    await replaceAudio(join(root, "public", "music"), stem, extension, bytes);
    return { url: `/music/${stem}${extension}` };
  }
  const [track, stem] = slot.split(":");
  if (!tracks.has(track) || !stems.has(stem)) throw new Error("保存先が正しくありません");
  await replaceAudio(join(root, "public", "music", "battle", track), stem, extension, bytes);
  return { url: `/music/battle/${track}/${stem}${extension}`, baseUrl: `/music/battle/${track}/` };
}

function publishAudio() {
  const add = spawnSync("git", ["add", "public/music"], { cwd: root, encoding: "utf8" });
  if (add.status !== 0) throw new Error(add.stderr || "音源をGitへ追加できませんでした");
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root });
  if (diff.status === 0) return { message: "公開する音源変更はありません" };
  const commit = spawnSync("git", ["commit", "-m", "Update game audio assets"], { cwd: root, encoding: "utf8" });
  if (commit.status !== 0) throw new Error(commit.stderr || "音源を保存できませんでした");
  const push = spawnSync("git", ["push", "origin", "main"], { cwd: root, encoding: "utf8" });
  if (push.status !== 0) throw new Error(push.stderr || "GitHubへ公開できませんでした");
  return { message: "音源をGitHubへ公開しました。約1分でサイトへ反映されます" };
}

const helper = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return json(response, 204, {});
  try {
    if (request.method === "GET" && request.url === "/health") return json(response, 200, { ok: true });
    if (request.method === "POST" && request.url === "/upload") return json(response, 200, await upload(await readBody(request)));
    if (request.method === "POST" && request.url === "/publish") return json(response, 200, publishAudio());
    return json(response, 404, { error: "見つかりません" });
  } catch (error) {
    return json(response, 400, { error: error instanceof Error ? error.message : "処理できませんでした" });
  }
});

helper.listen(4317, "127.0.0.1");
const dev = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "admin:dev"], { cwd: root, stdio: "inherit" });
setTimeout(() => spawn("cmd", ["/c", "start", "", "http://localhost:3000/balance"], { detached: true, stdio: "ignore" }).unref(), 2500);

function stop() {
  helper.close();
  dev.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.on("exit", (code) => { helper.close(); process.exit(code ?? 0); });
