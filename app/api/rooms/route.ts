import { env } from "cloudflare:workers";
import { applyMeteor, applyMove, initialGameState, type MeteorSize, type Player, type Pos } from "../../game-rules";

export const dynamic = "force-dynamic";

type RoomRow = {
  code: string;
  host_email: string;
  guest_email: string | null;
  state_json: string;
  version: number;
  status: string;
};

async function ensureSchema() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS game_rooms (
      code TEXT PRIMARY KEY,
      host_email TEXT NOT NULL,
      guest_email TEXT,
      state_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS game_rooms_updated_idx ON game_rooms(updated_at)"),
  ]);
}

function emailFrom(request: Request) {
  return request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? null;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function codeValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

async function roomByCode(code: string) {
  return env.DB.prepare(
    "SELECT code, host_email, guest_email, state_json, version, status FROM game_rooms WHERE code = ?",
  )
    .bind(code)
    .first<RoomRow>();
}

function roomPayload(room: RoomRow, email: string) {
  const role: Player | null =
    email === room.host_email ? "red" : email === room.guest_email ? "blue" : null;
  return {
    code: room.code,
    role,
    status: room.status,
    version: room.version,
    state: JSON.parse(room.state_json),
  };
}

export async function GET(request: Request) {
  const email = emailFrom(request);
  if (!email) return json({ error: "ChatGPTでサインインしてください" }, 401);
  await ensureSchema();
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return json({ error: "ルームコードが必要です" }, 400);
  const room = await roomByCode(code);
  if (!room) return json({ error: "ルームが見つかりません" }, 404);
  if (email !== room.host_email && email !== room.guest_email) {
    return json({ error: "このルームには参加していません" }, 403);
  }
  return json(roomPayload(room, email));
}

export async function POST(request: Request) {
  const email = emailFrom(request);
  if (!email) return json({ error: "ChatGPTでサインインしてください" }, 401);
  await ensureSchema();
  const body = (await request.json()) as {
    action?: string;
    code?: string;
    size?: number;
    first?: Player;
    version?: number;
    target?: Pos;
    meteorSize?: MeteorSize;
  };

  if (body.action === "create") {
    const size = body.size === 11 ? 11 : 9;
    const first: Player = body.first === "blue" ? "blue" : "red";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = codeValue();
      const now = Date.now();
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO game_rooms (code, host_email, state_json, version, status, created_at, updated_at) VALUES (?, ?, ?, 1, 'waiting', ?, ?)",
      )
        .bind(code, email, JSON.stringify(initialGameState(size, first)), now, now)
        .run();
      if (result.meta.changes) {
        const room = await roomByCode(code);
        return json(roomPayload(room!, email), 201);
      }
    }
    return json({ error: "ルームを作成できませんでした" }, 503);
  }

  const code = body.code?.trim().toUpperCase();
  if (!code) return json({ error: "ルームコードが必要です" }, 400);
  let room = await roomByCode(code);
  if (!room) return json({ error: "ルームが見つかりません" }, 404);

  if (body.action === "join") {
    if (email !== room.host_email && room.guest_email && email !== room.guest_email) {
      return json({ error: "このルームは満員です" }, 409);
    }
    if (email !== room.host_email && !room.guest_email) {
      await env.DB.prepare(
        "UPDATE game_rooms SET guest_email = ?, status = 'playing', version = version + 1, updated_at = ? WHERE code = ? AND guest_email IS NULL",
      )
        .bind(email, Date.now(), code)
        .run();
      room = await roomByCode(code);
    }
    return json(roomPayload(room!, email));
  }

  const role: Player | null =
    email === room.host_email ? "red" : email === room.guest_email ? "blue" : null;
  if (!role) return json({ error: "このルームには参加していません" }, 403);
  if (room.status !== "playing") return json({ error: "対戦相手の参加を待っています" }, 409);
  if (body.version !== room.version) {
    return json({ error: "盤面が更新されました", room: roomPayload(room, email) }, 409);
  }

  const state = JSON.parse(room.state_json);
  if (state.turn !== role) return json({ error: "相手の手番です" }, 403);

  try {
    let nextState;
    let effect = null;
    if (body.action === "move" && body.target) {
      nextState = applyMove(state, body.target);
    } else if (body.action === "meteor" && body.target && body.meteorSize) {
      const resolution = applyMeteor(state, body.target, body.meteorSize);
      nextState = resolution.state;
      effect = {
        target: resolution.target,
        size: resolution.size,
        destroyedIds: resolution.destroyedIds,
        pushed: resolution.pushed,
      };
    } else {
      return json({ error: "操作が正しくありません" }, 400);
    }
    const nextVersion = room.version + 1;
    const status = nextState.phase === "over" ? "finished" : "playing";
    const result = await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, version = ?, status = ?, updated_at = ? WHERE code = ? AND version = ?",
    )
      .bind(JSON.stringify(nextState), nextVersion, status, Date.now(), code, room.version)
      .run();
    if (!result.meta.changes) return json({ error: "盤面が更新されました" }, 409);
    room = await roomByCode(code);
    return json({ ...roomPayload(room!, email), effect });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "操作できませんでした" }, 400);
  }
}
