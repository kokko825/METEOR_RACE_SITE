import { env } from "cloudflare:workers";
import { applyMeteor, applyMove, initialGameState, type MeteorSize, type Player, type Pos } from "../../game-rules";

export const dynamic = "force-dynamic";

type RoomRow = {
  code: string;
  host_email: string;
  guest_email: string | null;
  player3_email: string | null;
  player4_email: string | null;
  max_players: number;
  seat_order_json: string;
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
      player3_email TEXT,
      player4_email TEXT,
      max_players INTEGER NOT NULL DEFAULT 2,
      seat_order_json TEXT NOT NULL DEFAULT '["red","blue"]',
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
    "SELECT code, host_email, guest_email, player3_email, player4_email, max_players, seat_order_json, state_json, version, status FROM game_rooms WHERE code = ?",
  )
    .bind(code)
    .first<RoomRow>();
}

function roomPayload(room: RoomRow, email: string) {
  const memberEmails = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
  const seats = JSON.parse(room.seat_order_json) as Player[];
  const memberIndex = memberEmails.indexOf(email);
  const role: Player | null = memberIndex >= 0 ? seats[memberIndex] ?? null : null;
  const joinedPlayers = memberEmails
    .slice(0, room.max_players)
    .filter(Boolean).length;
  return {
    code: room.code,
    role,
    status: room.status,
    version: room.version,
    maxPlayers: room.max_players,
    joinedPlayers,
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
  if (
    ![room.host_email, room.guest_email, room.player3_email, room.player4_email].includes(email)
  ) {
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
    playerCount?: number;
    version?: number;
    target?: Pos;
    meteorSize?: MeteorSize;
  };

  if (body.action === "create") {
    const playerCount = body.playerCount === 3 || body.playerCount === 4 ? body.playerCount : 2;
    const requestedSize = body.size === 13 ? 13 : body.size === 11 ? 11 : 9;
    const size = playerCount > 2 && requestedSize === 9 ? 11 : requestedSize;
    const allowedPlayers: Player[] = ["red", "blue", "green", "yellow"].slice(0, playerCount) as Player[];
    const seats = [...allowedPlayers];
    for (let index = seats.length - 1; index > 0; index -= 1) {
      const randomIndex = crypto.getRandomValues(new Uint8Array(1))[0] % (index + 1);
      [seats[index], seats[randomIndex]] = [seats[randomIndex], seats[index]];
    }
    const first: Player =
      allowedPlayers[crypto.getRandomValues(new Uint8Array(1))[0] % allowedPlayers.length];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = codeValue();
      const now = Date.now();
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO game_rooms (code, host_email, max_players, seat_order_json, state_json, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'waiting', ?, ?)",
      )
        .bind(
          code,
          email,
          playerCount,
          JSON.stringify(seats),
          JSON.stringify(initialGameState(size, first, playerCount)),
          now,
          now,
        )
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
    const memberEmails = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
    const existingSlot = memberEmails.indexOf(email);
    const openSlot = memberEmails.slice(0, room.max_players).findIndex((member) => !member);
    if (existingSlot < 0 && openSlot < 0) {
      return json({ error: "このルームは満員です" }, 409);
    }
    if (existingSlot < 0) {
      const column = ["host_email", "guest_email", "player3_email", "player4_email"][openSlot];
      const nextJoined = memberEmails.slice(0, room.max_players).filter(Boolean).length + 1;
      const nextStatus = nextJoined === room.max_players ? "playing" : "waiting";
      await env.DB.prepare(
        `UPDATE game_rooms SET ${column} = ?, status = ?, version = version + 1, updated_at = ? WHERE code = ? AND ${column} IS NULL`,
      )
        .bind(email, nextStatus, Date.now(), code)
        .run();
      room = await roomByCode(code);
    }
    return json(roomPayload(room!, email));
  }

  const memberEmails = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
  const seats = JSON.parse(room.seat_order_json) as Player[];
  const memberIndex = memberEmails.indexOf(email);
  const role: Player | null = memberIndex >= 0 ? seats[memberIndex] ?? null : null;
  if (!role) return json({ error: "このルームには参加していません" }, 403);

  if (body.action === "rematch") {
    if (room.status !== "finished") return json({ error: "対局終了後に再戦できます" }, 409);
    const previous = JSON.parse(room.state_json);
    const players = previous.players?.length ?? room.max_players;
    const firstIndex = Math.max(0, previous.players?.indexOf(previous.turn) ?? 0);
    const nextFirst = (previous.players ?? ["red", "blue"])[(firstIndex + 1) % players] as Player;
    const nextState = initialGameState(previous.size, nextFirst, players);
    await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, version = version + 1, status = 'playing', updated_at = ? WHERE code = ? AND version = ?",
    )
      .bind(JSON.stringify(nextState), Date.now(), code, room.version)
      .run();
    room = await roomByCode(code);
    return json(roomPayload(room!, email));
  }
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
