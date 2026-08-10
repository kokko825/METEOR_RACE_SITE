import { env } from "cloudflare:workers";
import { PLAYER_ORDER, applyHoloSwitch, applyMeteor, applyMove, applyObstacle, applyOrbitSwitch, applyPass, applyPulseSwitch, applySetupSwitch, finishTurn, initialGameState, legalMoves, type GameVariant, type MeteorSize, type Player, type Pos } from "../../game-rules";

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

function displayNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "PLAYER";
  return local.replace(/[._-]+/g, " ").trim().slice(0, 24) || "PLAYER";
}

function normalizeNickname(value: unknown, email: string) {
  const nickname = typeof value === "string" ? value.trim().slice(0, 16) : "";
  return nickname || displayNameFromEmail(email);
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
    "SELECT code, host_email, guest_email, player3_email, player4_email, max_players, seat_order_json, state_json, version, status FROM game_rooms WHERE code = ?",
  )
    .bind(code)
    .first<RoomRow>();
}

function roomPayload(room: RoomRow, email: string) {
  const memberEmails = [room.host_email, room.guest_email, room.player3_email, room.player4_email];
  const seats = JSON.parse(room.seat_order_json) as Player[];
  const state = JSON.parse(room.state_json);
  const memberIndex = memberEmails.indexOf(email);
  const role: Player | null = memberIndex >= 0 ? seats[memberIndex] ?? null : null;
  const joinedPlayers = memberEmails
    .slice(0, 4)
    .filter(Boolean).length;
  return {
    code: room.code,
    role,
    status: room.status,
    version: room.version,
    maxPlayers: 4,
    joinedPlayers,
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
    state,
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
    humanCount?: number;
    aiCount?: number;
    obstaclesEnabled?: boolean;
    version?: number;
    target?: Pos;
    meteorSize?: MeteorSize;
    nickname?: string;
    variant?: GameVariant;
    useCapsule?: boolean;
  };

  if (body.action === "create") {
    const playerCount = 2;
    const requestedSize = body.size === 11 ? 11 : 9;
    const size = playerCount > 2 && requestedSize === 9 ? 11 : requestedSize;
    const allowedPlayers: Player[] = ["red", "blue", "green", "yellow"].slice(0, playerCount) as Player[];
    const first: Player = allowedPlayers[0];
    const humanSeats = [allowedPlayers[0]];
    const botPlayers = [allowedPlayers[1]];
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
      .filter((entry): entry is { member: string; seat: Player | null } =>
        Boolean(entry.member) && entry.member !== email,
      );
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
      const openSlot = memberEmails.slice(0, 4).findIndex((member) => !member);
      if (openSlot < 0) return json(roomPayload(room, email));
      const column = ["host_email", "guest_email", "player3_email", "player4_email"][openSlot];
      const state = JSON.parse(room.state_json);
      const names = [...(state.roomMemberNames ?? [])];
      names[openSlot] = normalizeNickname(body.nickname, email);
      state.roomMemberNames = names;
      const result = await env.DB.prepare(
        `UPDATE game_rooms SET ${column} = ?, state_json = ?, max_players = 4, version = version + 1, updated_at = ? WHERE code = ? AND ${column} IS NULL`,
      )
        .bind(email, JSON.stringify(state), Date.now(), code)
        .run();
      room = (await roomByCode(code))!;
      if (result.meta.changes) return json(roomPayload(room, email));
    }
    return json({ error: "入室が重なりました。もう一度お試しください" }, 409);
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

  if (body.action === "new_game") {
    if (email !== room.host_email) {
      return json({ error: "ルームリーダーだけが設定を変更できます" }, 403);
    }
    if (body.version !== room.version) {
      return json({ error: "盤面が更新されました", room: roomPayload(room, email) }, 409);
    }
    const previous = JSON.parse(room.state_json);
    const memberEmails = [
      room.host_email,
      room.guest_email,
      room.player3_email,
      room.player4_email,
    ];
    const joinedPlayers = memberEmails.slice(0, 4).filter(Boolean).length;
    const humanCount = Math.max(
      1,
      Math.min(joinedPlayers, Number(body.humanCount ?? joinedPlayers)),
    );
    let aiCount = Math.max(0, Math.min(4 - humanCount, Number(body.aiCount ?? 0)));
    if (humanCount + aiCount < 2) aiCount = 1;
    const variant: GameVariant =
      body.variant === "team" || body.variant === "item" ? body.variant : "classic";
    if (variant === "team") {
      aiCount = Math.max(0, 4 - humanCount);
    }
    const players = variant === "team" ? 4 : humanCount + aiCount;
    const playerList: Player[] = PLAYER_ORDER.slice(0, players);
    const previousSeats = JSON.parse(room.seat_order_json) as Player[];
    const preferredRoles: Array<Player | null> = [
      ...(previous.roomPreferredRoles ?? previousSeats),
    ];
    const humanSeats: Player[] = [];
    for (let index = 0; index < humanCount; index += 1) {
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
      preferredRoles[index] = humanSeats[index];
    }
    const botPlayers = playerList.filter((player) => !humanSeats.includes(player));
    const requestedSize =
      body.size === 15 ? 15 : body.size === 13 ? 13 : body.size === 11 ? 11 : 9;
    const size =
      variant === "item"
        ? 15
        : variant === "team" && (requestedSize === 9 || requestedSize === 11)
          ? 13
        : players > 2 && requestedSize === 9
          ? 11
          : requestedSize;
    const turnOrder =
      variant === "team"
        ? (["red", "blue", "yellow", "green"] as Player[])
        : shuffledPlayers(playerList);
    const first =
      variant === "team"
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
      "UPDATE game_rooms SET state_json = ?, seat_order_json = ?, max_players = 4, version = version + 1, status = 'playing', updated_at = ? WHERE code = ? AND version = ?",
    )
      .bind(
        JSON.stringify(nextState),
        JSON.stringify(humanSeats),
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
    const previous = JSON.parse(room.state_json);
    const players = previous.players?.length ?? room.max_players;
    const playerList = PLAYER_ORDER.slice(0, players);
    const turnOrder =
      previous.variant === "team"
        ? (["red", "blue", "yellow", "green"] as Player[])
        : shuffledPlayers(playerList);
    const nextFirst =
      previous.variant === "team"
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
  if (body.version !== room.version) {
    return json({ error: "盤面が更新されました", room: roomPayload(room, email) }, 409);
  }

  const state = JSON.parse(room.state_json);
  const hostControlsBot =
    email === room.host_email && (state.botPlayers ?? []).includes(state.turn);
  if (state.turn !== role && !hostControlsBot) return json({ error: "相手の手番です" }, 403);

  try {
    let nextState;
    let effect = null;
    if (body.action === "setup_switch" && body.target && body.itemKind) {
      nextState = applySetupSwitch(state, body.target, body.itemKind);
    } else if (body.action === "move" && body.target) {
      nextState = applyMove(state, body.target);
    } else if (
      body.action === "skip_move" &&
      state.phase === "move" &&
      (state.bonusMove || state.turnCount === 0) &&
      legalMoves(state).length === 0
    ) {
      nextState = finishTurn(
        { ...state, bonusMove: false },
        "ボーナス移動先なし・手番終了",
      );
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
    } else if (body.action === "switch_pulse" && body.target) {
      nextState = applyPulseSwitch(state, body.target);
    } else if (body.action === "switch_orbit") {
      nextState = applyOrbitSwitch(state, Number(body.ring), Boolean(body.clockwise));
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
