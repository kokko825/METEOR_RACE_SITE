import { env } from "cloudflare:workers";
import { PLAYER_ORDER, TEAM_TURN_ORDER, activePlayers, applyBlastSwitch, applyHoloSwitch, applyMeteor, applyMove, applyObstacle, applyOrbitSwitch, applyPass, applyPulseSwitch, applyRecallItem, applySetupItem, applyUseItem, cancelPendingItem, confirmSetupItems, finishTurn, initialGameState, isItemVariant, isPulseLocked, isTeamVariant, legalMoves, rematchPlayerCount, resetSetupItems, samePos, type GameState, type GameVariant, type ItemKind, type MeteorSize, type Player, type Pos } from "../../game-rules";
import { DEFAULT_BALANCE, normalizeBalance } from "../../balance-config";
import { isRankedOpen } from "../../ranked-schedule";
import { withinRateLimit, rateLimitedResponse } from "../../rate-limit";
import { ratingDelta, ABANDON_PENALTY } from "../../duel-rating";
import { applyDuelRatingChange } from "../../duel-rating-store";
import { containsBlockedChatLanguage } from "../../chat-moderation";
import { COMMUNITY_SAFETY } from "../../../config/community-safety";

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
  updated_at: number;
};

const WAITING_ROOM_TTL_MS = 30 * 60 * 1000;
const PLAYING_ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_HEARTBEAT_INTERVAL_MS = 60 * 1000;

// A Worker isolate handles many requests in a row (e.g. every 500ms room-poll
// tick from each connected client), so memoize this instead of re-running the
// idempotent CREATE TABLE/INDEX statements on every single request.
let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
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
  schemaEnsured = true;
}

async function publishedBalance() {
  return normalizeBalance(DEFAULT_BALANCE);
}

function emailFrom(request: Request) {
  const authenticated = request.headers.get("cf-access-authenticated-user-email") ??
    request.headers.get("oai-authenticated-user-email");
  if (authenticated?.trim()) return authenticated.trim().toLowerCase();
  const anonymous = request.headers.get("x-meteor-player-id")?.trim().toLowerCase() ?? "";
  return /^player:[a-z0-9-]{20,80}$/.test(anonymous) ? anonymous : null;
}

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "PLAYER";
  return local.replace(/[._-]+/g, " ").trim().slice(0, 24) || "PLAYER";
}

function normalizeNickname(value: unknown, email: string) {
  const nickname = typeof value === "string" ? value.trim().slice(0, COMMUNITY_SAFETY.nicknameMaxLength) : "";
  const fallback = displayNameFromEmail(email);
  if (nickname && !containsBlockedChatLanguage(nickname)) return nickname;
  return containsBlockedChatLanguage(fallback) ? "PLAYER" : fallback;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function codeValue() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function shuffledPlayers(players: Player[]) {
  const shuffled = [...players];
  const random = crypto.getRandomValues(new Uint32Array(Math.max(1, shuffled.length)));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = random[index] % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

async function roomByCode(code: string) {
  return env.DB.prepare(
    "SELECT code, host_email, guest_email, player3_email, player4_email, max_players, seat_order_json, state_json, version, status, updated_at FROM game_rooms WHERE code = ?",
  )
    .bind(code)
    .first<RoomRow>();
}

async function cleanupAbandonedRooms(now = Date.now()) {
  await env.DB.prepare(
    `DELETE FROM game_rooms
     WHERE (status = 'waiting' AND updated_at < ?)
        OR (status <> 'waiting' AND updated_at < ?)`,
  )
    .bind(now - WAITING_ROOM_TTL_MS, now - PLAYING_ROOM_TTL_MS)
    .run();
}

function roomMemberEmails(room: RoomRow) {
  return [room.host_email, room.guest_email, room.player3_email, room.player4_email];
}

function roomPayload(room: RoomRow, email: string) {
  const memberEmails = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
  const seats = JSON.parse(room.seat_order_json) as Array<Player | null>;
  const state = JSON.parse(room.state_json);
  const memberIndex = memberEmails.indexOf(email);
  const role: Player | null = memberIndex >= 0 ? seats[memberIndex] ?? null : null;
  const roomCount = memberEmails.filter(Boolean).length;
  const joinedPlayers = memberEmails.filter((member, index) => Boolean(member && seats[index])).length;
  return {
    code: room.code,
    role,
    status: room.status,
    version: room.version,
    maxPlayers: 4,
    joinedPlayers,
    roomCount,
    spectatorCount: roomCount - joinedPlayers,
    memberNames: memberEmails
      .map((member, index) =>
        member
          ? state.roomMemberNames?.[index] || displayNameFromEmail(member)
          : null,
      )
      .filter((name): name is string => Boolean(name)),
    memberRoles: memberEmails
      .map((member, index) => (member ? seats[index] ?? null : null))
      .filter((_, index) => Boolean(memberEmails[index])),
    isHost: email === room.host_email,
    joinLocked: Boolean(state.roomJoinLocked),
    state,
  };
}

export async function GET(request: Request) {
  if (!(await withinRateLimit(request, "rooms-get", 120, 60))) return rateLimitedResponse();
  const email = emailFrom(request);
  if (!email) return json({ error: "プレイヤー識別情報を作成できませんでした" }, 401);
  await ensureSchema();
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase();
  if (!code) return json({ error: "ルームコードが必要です" }, 400);
  const room = await roomByCode(code);
  if (!room) return json({ error: "ルームが見つかりません" }, 404);
  const now = Date.now();
  const memberIsPresent = roomMemberEmails(room).includes(email);
  const ttl = room.status === "waiting" ? WAITING_ROOM_TTL_MS : PLAYING_ROOM_TTL_MS;
  if (!memberIsPresent && room.updated_at < now - ttl) {
    await env.DB.prepare("DELETE FROM game_rooms WHERE code = ? AND updated_at = ?")
      .bind(code, room.updated_at)
      .run();
    return json({ error: "このルームの有効期限が切れました" }, 404);
  }
  if (memberIsPresent && room.updated_at < now - ROOM_HEARTBEAT_INTERVAL_MS) {
    await env.DB.prepare("UPDATE game_rooms SET updated_at = ? WHERE code = ? AND updated_at = ?")
      .bind(now, code, room.updated_at)
      .run();
    room.updated_at = now;
  }
  return json(roomPayload(room, email));
}

export async function POST(request: Request) {
  if (!(await withinRateLimit(request, "rooms-post", 90, 60))) return rateLimitedResponse();
  const email = emailFrom(request);
  if (!email) return json({ error: "プレイヤー識別情報を作成できませんでした" }, 401);
  await ensureSchema();
  const body = (await request.json()) as {
    action?: string;
    code?: string;
    size?: number;
    first?: Player;
    playerCount?: number;
    humanCount?: number;
    aiCount?: number;
    obstaclesEnabled?: boolean;
    version?: number;
    target?: Pos;
    meteorSize?: MeteorSize;
    nickname?: string;
    variant?: GameVariant;
    useCapsule?: boolean;
    itemKind?: ItemKind;
    ring?: number;
    clockwise?: boolean;
    meteorId?: number;
    setupActor?: Player;
    ranked?: boolean;
    locked?: boolean;
    targetIndex?: number;
    targetRole?: Player | null;
    memberAction?: "seat" | "spectate" | "kick";
    teamEnabled?: boolean;
  };
  if (body.action === "create") {
    if (!(await withinRateLimit(request, "rooms-create", 10, 300))) return rateLimitedResponse();
    await cleanupAbandonedRooms();
    const liveBalance = await publishedBalance();
    const createRanked = Boolean(body.ranked) && isRankedOpen();
    const createVariant: GameVariant = createRanked
      ? (body.variant === "item" ? "item" : "classic")
      : body.variant === "team" || body.variant === "item" || body.variant === "team-item"
        ? body.variant
        : "classic";
    const requestedHumans = Math.max(1, Math.min(4, Math.round(body.humanCount ?? 2)));
    const requestedAi = Math.max(0, Math.min(3, Math.round(body.aiCount ?? 0)));
    const playerCount = createRanked
      ? 2
      : isTeamVariant(createVariant)
        ? 4
        : Math.max(2, Math.min(4, requestedHumans + requestedAi));
    const humanCount = createRanked ? 2 : Math.min(requestedHumans, playerCount);
    const requestedSize = [9, 11, 13, 15].includes(body.size ?? 9) ? body.size! : 9;
    const minimumSize = createVariant === "team" || createVariant === "team-item"
      ? 13
      : createVariant === "item" || playerCount > 2
        ? 11
        : 9;
    const size = Math.max(requestedSize, minimumSize);
    const allowedPlayers = PLAYER_ORDER.slice(0, playerCount);
    const first: Player = body.first && allowedPlayers.includes(body.first) ? body.first : allowedPlayers[0];
    const humanSeats = [allowedPlayers[0]];
    const botPlayers = createRanked ? [] : allowedPlayers.slice(humanCount);
    const layoutOffset =
      playerCount === 3 ? crypto.getRandomValues(new Uint8Array(1))[0] % 4 : 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = codeValue();
      const now = Date.now();
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO game_rooms (code, host_email, max_players, seat_order_json, state_json, version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
      )
        .bind(
          code,
          email,
          4,
          JSON.stringify(humanSeats),
          JSON.stringify({
            ...initialGameState(
              size,
              first,
              playerCount,
              Boolean(body.obstaclesEnabled),
              layoutOffset,
              botPlayers,
              createVariant,
              liveBalance,
              createRanked,
            ),
            roomMemberNames: [normalizeNickname(body.nickname, email)],
            roomPreferredRoles: ["red"],
          }),
          "waiting",
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

  if (body.action === "leave") {
    const memberEmails = [
      room.host_email,
      room.guest_email,
      room.player3_email,
      room.player4_email,
    ];
    const seats = JSON.parse(room.seat_order_json) as Player[];
    const leavingIndex = memberEmails.indexOf(email);
    if (leavingIndex < 0) return json({ left: true });
    const leavingRole = seats[leavingIndex] ?? null;
    const remaining = memberEmails
      .map((member, index) => ({ member, seat: seats[index] ?? null }))
      .filter((entry) => entry.member !== null && entry.member !== email);
    if (!remaining.length) {
      await env.DB.prepare("DELETE FROM game_rooms WHERE code = ?").bind(code).run();
      return json({ left: true });
    }
    const state = JSON.parse(room.state_json);
    const names = memberEmails.map((member, index) =>
      member
        ? state.roomMemberNames?.[index] || displayNameFromEmail(member)
        : null,
    );
    if (
      leavingRole &&
      room.status === "playing" &&
      !(state.botPlayers ?? []).includes(leavingRole)
    ) {
      state.botPlayers = [...(state.botPlayers ?? []), leavingRole];
      if (state.ranked) {
        await applyDuelRatingChange(email, state.variant, ABANDON_PENALTY);
      }
    }
    const nextSeats = remaining
      .map((entry) => entry.seat)
      .filter((seat): seat is Player => Boolean(seat));
    state.roomMemberNames = memberEmails
      .map((member, index) => ({ member, name: names[index] }))
      .filter((entry) => Boolean(entry.member) && entry.member !== email)
      .map((entry) => entry.name);
    state.roomPreferredRoles = memberEmails
      .map((member, index) => ({
        member,
        role: state.roomPreferredRoles?.[index] ?? seats[index] ?? null,
      }))
      .filter((entry) => Boolean(entry.member) && entry.member !== email)
      .map((entry) => entry.role);
    await env.DB.prepare(
      `UPDATE game_rooms
       SET host_email = ?, guest_email = ?, player3_email = ?, player4_email = ?,
           seat_order_json = ?, state_json = ?, version = version + 1, updated_at = ?
       WHERE code = ?`,
    )
      .bind(
        remaining[0].member,
        remaining[1]?.member ?? null,
        remaining[2]?.member ?? null,
        remaining[3]?.member ?? null,
        JSON.stringify(nextSeats),
        JSON.stringify(state),
        Date.now(),
        code,
      )
      .run();
    return json({ left: true });
  }

  if (body.action === "join") {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const memberEmails = [
        room.host_email,
        room.guest_email,
        room.player3_email,
        room.player4_email,
      ];
      const existingSlot = memberEmails.indexOf(email);
      if (existingSlot >= 0) {
        const state = JSON.parse(room.state_json);
        const names = [...(state.roomMemberNames ?? [])];
        names[existingSlot] = normalizeNickname(body.nickname, email);
        state.roomMemberNames = names;
        await env.DB.prepare(
          "UPDATE game_rooms SET state_json = ?, version = version + 1, updated_at = ? WHERE code = ?",
        ).bind(JSON.stringify(state), Date.now(), code).run();
        room = (await roomByCode(code))!;
        return json(roomPayload(room, email));
      }
      const waitingState = JSON.parse(room.state_json);
      if (waitingState.roomJoinLocked) return json({ error: "このルームは参加受付を締め切っています" }, 409);
      const openSlot = memberEmails.findIndex((member) => !member);
      if (openSlot < 0) return json({ error: "ルームの参加枠が埋まっています" }, 409);
      const column = ["host_email", "guest_email", "player3_email", "player4_email"][openSlot];
      const state = JSON.parse(room.state_json);
      const names = [...(state.roomMemberNames ?? [])];
      names[openSlot] = normalizeNickname(body.nickname, email);
      state.roomMemberNames = names;
      const seats = JSON.parse(room.seat_order_json) as Array<Player | null>;
      if (room.status === "waiting") {
        const available = PLAYER_ORDER.filter((player) => !seats.includes(player));
        seats[openSlot] = available.length ? available[crypto.getRandomValues(new Uint8Array(1))[0] % available.length] : null;
      } else {
        seats[openSlot] = null;
      }
      const result = await env.DB.prepare(
        `UPDATE game_rooms SET ${column} = ?, seat_order_json = ?, state_json = ?, version = version + 1, updated_at = ? WHERE code = ? AND ${column} IS NULL`,
      )
        .bind(email, JSON.stringify(seats), JSON.stringify(state), Date.now(), code)
        .run();
      room = (await roomByCode(code))!;
      if (result.meta.changes) return json(roomPayload(room, email));
    }
    return json({ error: "入室が重なりました。もう一度お試しください" }, 409);
  }

  if (body.action === "manage_member") {
    if (email !== room.host_email) return json({ error: "ルームリーダーだけが変更できます" }, 403);
    if (room.status === "playing") return json({ error: "メンバー変更は待機中に行ってください" }, 409);
    const targetIndex = Math.max(0, Math.min(3, Number(body.targetIndex ?? -1)));
    if (targetIndex === 0 && body.memberAction === "kick") return json({ error: "ルームリーダーは退出操作を使用してください" }, 400);
    const members = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
    if (!members[targetIndex]) return json({ error: "メンバーが見つかりません" }, 404);
    const seats = JSON.parse(room.seat_order_json) as Array<Player | null>;
    const state = JSON.parse(room.state_json);
    if (body.memberAction === "kick") {
      const remaining = members.map((member, index) => ({ member, role: seats[index] ?? null, name: state.roomMemberNames?.[index] ?? null })).filter((entry, index) => Boolean(entry.member) && index !== targetIndex);
      state.roomMemberNames = remaining.map((entry) => entry.name);
      await env.DB.prepare("UPDATE game_rooms SET host_email = ?, guest_email = ?, player3_email = ?, player4_email = ?, seat_order_json = ?, state_json = ?, version = version + 1, updated_at = ? WHERE code = ?")
        .bind(remaining[0].member, remaining[1]?.member ?? null, remaining[2]?.member ?? null, remaining[3]?.member ?? null, JSON.stringify(remaining.map((entry) => entry.role)), JSON.stringify(state), Date.now(), code).run();
      room = (await roomByCode(code))!;
      return json(roomPayload(room, email));
    } else if (body.memberAction === "spectate") {
      seats[targetIndex] = null;
    } else {
      const requested = PLAYER_ORDER.includes(body.targetRole as Player) ? body.targetRole as Player : null;
      if (!requested) return json({ error: "座席を選択してください" }, 400);
      const occupied = seats.findIndex((seat, index) => index !== targetIndex && seat === requested);
      if (occupied >= 0) seats[occupied] = null;
      seats[targetIndex] = requested;
    }
    await env.DB.prepare("UPDATE game_rooms SET seat_order_json = ?, state_json = ?, version = version + 1, updated_at = ? WHERE code = ?")
      .bind(JSON.stringify(seats), JSON.stringify(state), Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "assign_teams") {
    if (email !== room.host_email) return json({ error: "ルームリーダーだけがチーム戦を変更できます" }, 403);
    if (room.status === "playing") return json({ error: "チーム変更は待機中に行ってください" }, 409);
    const members = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
    const seats = JSON.parse(room.seat_order_json) as Array<Player | null>;
    const assigned = TEAM_TURN_ORDER;
    let activeIndex = 0;
    for (let index = 0; index < members.length; index += 1) {
      if (members[index] && seats[index]) seats[index] = body.teamEnabled ? assigned[activeIndex++] : PLAYER_ORDER[activeIndex++];
    }
    await env.DB.prepare("UPDATE game_rooms SET seat_order_json = ?, version = version + 1, updated_at = ? WHERE code = ?")
      .bind(JSON.stringify(seats), Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "switch_team") {
    if (room.status === "playing") return json({ error: "チーム変更は待機中に行ってください" }, 409);
    const members = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
    const memberIndex = members.indexOf(email);
    if (memberIndex < 0) return json({ error: "ルームに参加していません" }, 403);
    const seats = JSON.parse(room.seat_order_json) as Array<Player | null>;
    const current = seats[memberIndex];
    if (!current) return json({ error: "観戦者はチーム移動できません" }, 409);
    const targetRoles: Player[] = current === "red" || current === "yellow" ? ["blue", "green"] : ["red", "yellow"];
    const target = targetRoles.find((role) => !seats.includes(role));
    if (!target) return json({ error: "移動先のチームが満員です" }, 409);
    seats[memberIndex] = target;
    await env.DB.prepare("UPDATE game_rooms SET seat_order_json = ?, version = version + 1, updated_at = ? WHERE code = ?")
      .bind(JSON.stringify(seats), Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "swap_role") {
    if (room.status === "playing") return json({ error: "座席交換は待機中に行ってください" }, 409);
    const members = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
    const memberIndex = members.indexOf(email);
    if (memberIndex < 0) return json({ error: "ルームに参加していません" }, 403);
    const targetRole = PLAYER_ORDER.includes(body.targetRole as Player) ? body.targetRole as Player : null;
    if (!targetRole) return json({ error: "入れ替える座席を選んでください" }, 400);
    const seats = JSON.parse(room.seat_order_json) as Array<Player | null>;
    const currentRole = seats[memberIndex];
    if (!currentRole) return json({ error: "観戦者は座席交換できません" }, 409);
    const occupiedIndex = seats.findIndex((role, index) => index !== memberIndex && role === targetRole);
    seats[memberIndex] = targetRole;
    if (occupiedIndex >= 0) seats[occupiedIndex] = currentRole;
    await env.DB.prepare("UPDATE game_rooms SET seat_order_json = ?, version = version + 1, updated_at = ? WHERE code = ?")
      .bind(JSON.stringify(seats), Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "toggle_lock") {
    if (email !== room.host_email) return json({ error: "ルームリーダーだけが変更できます" }, 403);
    if (room.status !== "waiting") return json({ error: "参加受付は待機中だけ変更できます" }, 409);
    const state = JSON.parse(room.state_json);
    state.roomJoinLocked = Boolean(body.locked);
    await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, version = version + 1, updated_at = ? WHERE code = ?",
    ).bind(JSON.stringify(state), Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "nickname") {
    const memberEmails = [
      room.host_email,
      room.guest_email,
      room.player3_email,
      room.player4_email,
    ];
    const memberIndex = memberEmails.indexOf(email);
    if (memberIndex < 0) return json({ error: "ルームに参加していません" }, 403);
    const state = JSON.parse(room.state_json);
    const names = [...(state.roomMemberNames ?? [])];
    names[memberIndex] = normalizeNickname(body.nickname, email);
    state.roomMemberNames = names;
    await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, version = version + 1, updated_at = ? WHERE code = ?",
    ).bind(JSON.stringify(state), Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "return_lobby") {
    if (email !== room.host_email) return json({ error: "ルームリーダーだけが仕切り直せます" }, 403);
    await env.DB.prepare("UPDATE game_rooms SET status = 'waiting', version = version + 1, updated_at = ? WHERE code = ?")
      .bind(Date.now(), code).run();
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  if (body.action === "new_game") {
    if (email !== room.host_email) {
      return json({ error: "ルームリーダーだけが設定を変更できます" }, 403);
    }
    if (body.version !== room.version) {
      return json({ error: "盤面が更新されました", room: roomPayload(room, email) }, 409);
    }
    const liveBalance = await publishedBalance();
    const previous = JSON.parse(room.state_json);
    const memberEmails = [
      room.host_email,
      room.guest_email,
      room.player3_email,
      room.player4_email,
    ];
    const currentSeats = JSON.parse(room.seat_order_json) as Array<Player | null>;
    const joinedPlayers = memberEmails.filter((member, index) => Boolean(member && currentSeats[index])).length;
    let humanCount = Math.max(
      1,
      Math.min(joinedPlayers, Number(body.humanCount ?? joinedPlayers)),
    );
    let aiCount = Math.max(0, Math.min(4 - humanCount, Number(body.aiCount ?? 0)));
    if (humanCount + aiCount < 2) aiCount = 1;
    let variant: GameVariant =
      body.variant === "team" || body.variant === "item" || body.variant === "team-item"
        ? body.variant
        : "classic";
    const ranked = Boolean(body.ranked) && isRankedOpen();
    if (ranked) {
      if (joinedPlayers < 2) return json({ error: "ランク戦には対戦相手が必要です" }, 400);
      humanCount = 2;
      aiCount = 0;
      variant = isItemVariant(variant) ? "item" : "classic";
    }
    if (isTeamVariant(variant)) {
      aiCount = Math.max(0, 4 - humanCount);
    }
    const players = isTeamVariant(variant) ? 4 : humanCount + aiCount;
    const playerList: Player[] = PLAYER_ORDER.slice(0, players);
    const previousSeats = currentSeats;
    const preferredRoles: Array<Player | null> = [
      ...(previous.roomPreferredRoles ?? previousSeats),
    ];
    const humanSeats: Player[] = [];
    const activeMemberIndices = memberEmails.map((member, index) => member && previousSeats[index] ? index : -1).filter((index) => index >= 0).slice(0, humanCount);
    for (let seatIndex = 0; seatIndex < activeMemberIndices.length; seatIndex += 1) {
      const index = activeMemberIndices[seatIndex];
      const preferredRole = preferredRoles[index] ?? previousSeats[index];
      if (
        preferredRole &&
        playerList.includes(preferredRole) &&
        !humanSeats.includes(preferredRole)
      ) {
        humanSeats.push(preferredRole);
      } else {
        humanSeats.push(playerList.find((player) => !humanSeats.includes(player))!);
      }
      preferredRoles[index] = humanSeats[seatIndex];
    }
    const botPlayers = playerList.filter((player) => !humanSeats.includes(player));
    const requestedSize =
      body.size === 15 ? 15 : body.size === 13 ? 13 : body.size === 11 ? 11 : 9;
    const size =
      isTeamVariant(variant) && (requestedSize === 9 || requestedSize === 11)
          ? 13
        : players > 2 && requestedSize === 9
          ? 11
          : requestedSize;
    const turnOrder =
      isTeamVariant(variant)
        ? [...TEAM_TURN_ORDER]
        : shuffledPlayers(playerList);
    const first =
      isTeamVariant(variant)
        ? turnOrder[crypto.getRandomValues(new Uint8Array(1))[0] % turnOrder.length]
        : turnOrder[0];
    const nextOffset =
      players === 3 ? ((previous.layoutOffset ?? 0) + 1) % 4 : 0;
    const nextState = initialGameState(
      size,
      first,
      players,
      players === 2 && size === 9 ? false : Boolean(body.obstaclesEnabled),
      nextOffset,
      botPlayers,
      variant,
      liveBalance,
      ranked,
    );
    nextState.players = turnOrder;
    (nextState as typeof nextState & { roomMemberNames: string[] }).roomMemberNames =
      previous.roomMemberNames ?? [];
    (
      nextState as typeof nextState & {
        roomPreferredRoles: Array<Player | null>;
      }
    ).roomPreferredRoles = preferredRoles;
    const result = await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, seat_order_json = ?, max_players = ?, version = version + 1, status = 'playing', updated_at = ? WHERE code = ? AND version = ?",
    )
      .bind(
        JSON.stringify(nextState),
        JSON.stringify(memberEmails.map((member, index) => member && activeMemberIndices.includes(index) ? preferredRoles[index] : null)),
        humanCount,
        Date.now(),
        code,
        room.version,
      )
      .run();
    if (!result.meta.changes) {
      return json({ error: "盤面が更新されました" }, 409);
    }
    room = (await roomByCode(code))!;
    return json(roomPayload(room, email));
  }

  const memberEmails = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
  const seats = JSON.parse(room.seat_order_json) as Player[];
  const memberIndex = memberEmails.indexOf(email);
  const role: Player | null = memberIndex >= 0 ? seats[memberIndex] ?? null : null;
  if (!role) return json({ error: "このルームには参加していません" }, 403);

  if (body.action === "rematch") {
    if (room.status !== "finished") return json({ error: "対局終了後に再戦できます" }, 409);
    const liveBalance = await publishedBalance();
    const previous = JSON.parse(room.state_json);
    const players = rematchPlayerCount(previous, room.max_players);
    const playerList = PLAYER_ORDER.slice(0, players);
    const turnOrder =
      isTeamVariant(previous.variant ?? "classic")
        ? [...TEAM_TURN_ORDER]
        : shuffledPlayers(playerList);
    const nextFirst =
      isTeamVariant(previous.variant ?? "classic")
        ? turnOrder[crypto.getRandomValues(new Uint8Array(1))[0] % turnOrder.length]
        : turnOrder[0];
    const nextOffset =
      players === 3 ? ((previous.layoutOffset ?? 0) + 1) % 4 : 0;
    const nextState = initialGameState(
      previous.size,
      nextFirst,
      players,
      Boolean(previous.obstaclesEnabled),
      nextOffset,
      previous.botPlayers ?? [],
      previous.variant ?? "classic",
      liveBalance,
      Boolean(previous.ranked),
    );
    nextState.players = turnOrder;
    (nextState as typeof nextState & { roomMemberNames: string[] }).roomMemberNames =
      previous.roomMemberNames ?? [];
    (
      nextState as typeof nextState & {
        roomPreferredRoles: Array<Player | null>;
      }
    ).roomPreferredRoles = previous.roomPreferredRoles ?? JSON.parse(room.seat_order_json);
    await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, version = version + 1, status = 'playing', updated_at = ? WHERE code = ? AND version = ?",
    )
      .bind(JSON.stringify(nextState), Date.now(), code, room.version)
      .run();
    room = await roomByCode(code);
    return json(roomPayload(room!, email));
  }
  if (room.status !== "playing") return json({ error: "対戦相手の参加を待っています" }, 409);
  const isSetupAction =
    body.action === "setup_item" ||
    body.action === "setup_confirm" ||
    body.action === "setup_cancel";
  if (body.version !== room.version && !isSetupAction) {
    return json({ error: "盤面が更新されました", room: roomPayload(room, email) }, 409);
  }

  const state = JSON.parse(room.state_json);
  const hostControlsBot =
    email === room.host_email && (state.botPlayers ?? []).includes(state.turn);
  const independentSetupAction = state.phase === "setup" && isSetupAction && Boolean(role);
  const requestedSetupActor = PLAYER_ORDER.includes(body.setupActor as Player)
    ? body.setupActor as Player
    : role ?? state.turn;
  const mayControlSetupActor =
    requestedSetupActor === role ||
    (email === room.host_email && (state.botPlayers ?? []).includes(requestedSetupActor));
  if (independentSetupAction && !mayControlSetupActor) {
    return json({ error: "そのプレイヤーのアイテムは選択できません" }, 403);
  }
  const setupActor: Player = mayControlSetupActor ? requestedSetupActor : state.turn;
  if (state.turn !== role && !hostControlsBot && !independentSetupAction) {
    return json({ error: "相手の手番です" }, 403);
  }

  try {
    let nextState: GameState & { onlineEffect?: unknown; onlineItemEffect?: unknown };
    let effect = null;
    let itemEffect = null;
    if (body.action === "setup_item" && body.itemKind) {
      nextState = applySetupItem(state, body.itemKind, setupActor);
    } else if (body.action === "setup_confirm") {
      nextState = confirmSetupItems(state, setupActor);
    } else if (body.action === "setup_cancel") {
      nextState = resetSetupItems(state, setupActor);
    } else if (body.action === "use_item" && body.itemKind) {
      nextState = applyUseItem(state, body.itemKind);
      if (body.itemKind === "shield" || body.itemKind === "booster" || body.itemKind === "recall") {
        itemEffect = { kind: body.itemKind, player: state.turn };
      }
    } else if (body.action === "cancel_item") {
      nextState = cancelPendingItem(state);
    } else if (body.action === "move" && body.target) {
      nextState = applyMove(state, body.target);
    } else if (
      body.action === "skip_move" &&
      state.phase === "move" &&
      (state.bonusMove || state.turnCount === 0 || (state.immobilizedMoves?.[state.turn] ?? 0) > 0 || isPulseLocked(state, state.turn)) &&
      legalMoves(state).length === 0
    ) {
      if ((state.immobilizedMoves?.[state.turn] ?? 0) > 0) {
        nextState = {
          ...state,
          immobilizedMoves: {
            ...(state.immobilizedMoves ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
            [state.turn]: Math.max(0, (state.immobilizedMoves?.[state.turn] ?? 0) - 1),
          },
          phase: "place",
          message: `${state.turn.toUpperCase()}：電磁拘束中・メテオまたはアイテムを使用`,
          log: [...state.log, `${state.turn.toUpperCase()}はBLASTの電磁拘束で移動不能`],
        };
      } else if (isPulseLocked(state, state.turn)) {
        nextState = {
          ...state,
          phase: "place",
          message: `${state.turn.toUpperCase()}：PULSE範囲内・メテオまたはアイテムを使用`,
          log: [...state.log, `${state.turn.toUpperCase()}はPULSE範囲内のため移動不能`],
        };
      } else {
        nextState = finishTurn({ ...state, bonusMove: false }, "移動先なし・手番終了");
      }
    } else if (body.action === "pass") {
      nextState = applyPass(state);
    } else if (body.action === "obstacle" && body.target) {
      nextState = applyObstacle(state, body.target);
    } else if (body.action === "meteor" && body.target && body.meteorSize) {
      const resolution = applyMeteor(state, body.target, body.meteorSize, Boolean(body.useCapsule));
      nextState = resolution.state;
      effect = {
        target: resolution.target,
        size: resolution.size,
        destroyedIds: resolution.destroyedIds,
        pushed: resolution.pushed,
      };
    } else if (body.action === "switch_holo" && body.target) {
      nextState = applyHoloSwitch(state, body.target);
      itemEffect = { kind: "holo", player: state.pendingSwitches?.[0]?.player ?? state.turn };
    } else if (body.action === "switch_blast" && body.target) {
      nextState = applyBlastSwitch(state, body.target);
      const pushed = Object.fromEntries(
        activePlayers(state)
          .filter((player) => !samePos(state.probes[player], nextState.probes[player]))
          .map((player) => [player, {
            from: state.probes[player],
            dr: nextState.probes[player].r - state.probes[player].r,
            dc: nextState.probes[player].c - state.probes[player].c,
          }]),
      );
      itemEffect = {
        kind: "blast",
        player: state.pendingSwitches?.[0]?.player ?? state.turn,
        target: body.target,
        radius: state.balance?.blastRadius ?? 1,
        pushed,
      };
    } else if (body.action === "switch_pulse" && body.target) {
      nextState = applyPulseSwitch(state, body.target);
      itemEffect = {
        kind: "pulse",
        player: state.pendingSwitches?.[0]?.player ?? state.turn,
        target: body.target,
        radius: state.balance?.pulseRadius ?? 1,
      };
    } else if (body.action === "switch_orbit") {
      nextState = applyOrbitSwitch(state, Number(body.ring), Boolean(body.clockwise));
      itemEffect = {
        kind: "orbit",
        player: state.pendingSwitches?.[0]?.player ?? state.turn,
        ring: Number(body.ring),
        clockwise: Boolean(body.clockwise),
      };
    } else if (body.action === "switch_recall") {
      nextState = applyRecallItem(state, Number(body.meteorId));
      itemEffect = { kind: "recall", player: state.pendingSwitches?.[0]?.player ?? state.turn };
    } else {
      return json({ error: "操作が正しくありません" }, 400);
    }
    const nextVersion = room.version + 1;
    if (effect) {
      nextState = {
        ...nextState,
        onlineEffect: {
          ...effect,
          owner: state.turn,
          version: nextVersion,
        },
      };
    }
    if (itemEffect) {
      nextState = {
        ...nextState,
        onlineItemEffect: {
          ...itemEffect,
          version: nextVersion,
        },
      };
    }
    const status = nextState.phase === "over" ? "finished" : "playing";
    if (status === "finished" && (nextState.ranked ?? state.ranked)) {
      const finishedVariant = nextState.variant ?? state.variant;
      const winner = nextState.winner ?? null;
      const finishOrder = nextState.finishOrder;
      const botPlayers = nextState.botPlayers ?? [];
      for (let index = 0; index < seats.length; index += 1) {
        const seatPlayer = seats[index];
        const identity = memberEmails[index];
        if (!identity || !seatPlayer || botPlayers.includes(seatPlayer)) continue;
        await applyDuelRatingChange(identity, finishedVariant, ratingDelta(finishedVariant, winner, finishOrder, seatPlayer));
      }
    }
    const nextStateJson = JSON.stringify(nextState);
    const result = await env.DB.prepare(
      "UPDATE game_rooms SET state_json = ?, version = ?, status = ?, updated_at = ? WHERE code = ? AND version = ?",
    )
      .bind(nextStateJson, nextVersion, status, Date.now(), code, room.version)
      .run();
    if (!result.meta.changes) return json({ error: "盤面が更新されました" }, 409);
    // Every field besides state_json/version/status is unchanged by a game
    // action, so build the response from what we already have instead of
    // spending another D1 round-trip re-reading the row we just wrote.
    const updatedRoom: RoomRow = { ...room, state_json: nextStateJson, version: nextVersion, status };
    return json({ ...roomPayload(updatedRoom, email), effect });
  } catch (error) {
    room = await roomByCode(code);
    return json(
      {
        error: error instanceof Error ? error.message : "操作できませんでした",
        ...(room ? { room: roomPayload(room, email) } : {}),
      },
      400,
    );
  }
}
