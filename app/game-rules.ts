export type Player = "red" | "blue" | "green" | "yellow";
export type MeteorSize = "small" | "large";
export type Pos = { r: number; c: number };
export type Meteor = Pos & { owner: Player; size: MeteorSize; id: number };
export type ObstacleMeteor = Pos & { owner: Player; id: number };
export type Inventory = Record<Player, Record<MeteorSize, number>>;
export type Phase = "move" | "place" | "over";

export type GameState = {
  size: number;
  players: Player[];
  turn: Player;
  phase: Phase;
  turnCount: number;
  probes: Record<Player, Pos>;
  meteors: Meteor[];
  obstaclesEnabled: boolean;
  obstacles: ObstacleMeteor[];
  obstacleAvailable: Record<Player, number>;
  layoutOffset: number;
  startingPlayer: Player;
  botPlayers: Player[];
  playerTurns: Record<Player, number>;
  passAvailable: Record<Player, boolean>;
  inventory: Inventory;
  selected: MeteorSize | "obstacle";
  winner: Player | "draw" | null;
  message: string;
  log: string[];
  nextMeteorId: number;
  repetitions: Record<string, number>;
};

export type MeteorResolution = {
  state: GameState;
  target: Pos;
  size: MeteorSize;
  destroyedIds: number[];
  pushed: Partial<Record<Player, { from: Pos; dr: number; dc: number }>>;
};

export const PLAYER_ORDER: Player[] = ["red", "blue", "green", "yellow"];
export const activePlayers = (state: GameState): Player[] =>
  state.players?.length ? state.players : ["red", "blue"];
export const activeObstacles = (state: GameState): ObstacleMeteor[] =>
  state.obstacles ?? [];
export const canPlaceObstacle = (state: GameState, player = state.turn) =>
  Boolean(
    state.obstaclesEnabled &&
      (state.playerTurns?.[player] ?? 0) >= 2 &&
      (typeof state.obstacleAvailable?.[player] === "number"
        ? state.obstacleAvailable[player] > 0
        : state.obstacleAvailable?.[player] ?? true),
  );
export const obstacleCount = (state: GameState, player = state.turn) => {
  const value = state.obstacleAvailable?.[player];
  return typeof value === "number" ? value : value === false ? 0 : state.obstaclesEnabled ? 1 : 0;
};
export const nextPlayer = (state: GameState, player = state.turn): Player => {
  const players = activePlayers(state);
  return players[(players.indexOf(player) + 1) % players.length];
};
export const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
export const distance = (a: Pos, b: Pos) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
export const orthogonallyAdjacent = (a: Pos, b: Pos) =>
  Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
export const viewToBoardPos = (view: Pos, size: number, perspectiveSlot: number): Pos => {
  const last = size - 1;
  const slot = ((perspectiveSlot % 4) + 4) % 4;
  if (slot === 1) return { r: last - view.r, c: last - view.c };
  if (slot === 2) return { r: view.c, c: last - view.r };
  if (slot === 3) return { r: last - view.c, c: view.r };
  return view;
};
export const boardToViewDelta = (delta: Pos, perspectiveSlot: number): Pos => {
  const slot = ((perspectiveSlot % 4) + 4) % 4;
  if (slot === 1) return { r: -delta.r, c: -delta.c };
  if (slot === 2) return { r: -delta.c, c: delta.r };
  if (slot === 3) return { r: delta.c, c: -delta.r };
  return delta;
};
export const playerName = (player: Player) => player.toUpperCase();
export const meteorName = (size: MeteorSize) => (size === "small" ? "小メテオ" : "大メテオ");

export function coreWinner(state: GameState, reached: Player[]): Player {
  if (reached.includes(state.turn)) return state.turn;
  const players = activePlayers(state);
  const turnIndex = players.indexOf(state.turn);
  for (let offset = 1; offset <= players.length; offset += 1) {
    const candidate = players[(turnIndex + offset) % players.length];
    if (reached.includes(candidate)) return candidate;
  }
  return reached[0];
}

export function initialGameState(
  size = 9,
  first: Player = "red",
  playerCount = 2,
  obstaclesEnabled = false,
  layoutOffset = 0,
  botPlayers: Player[] = [],
): GameState {
  const count = Math.max(2, Math.min(4, playerCount));
  const players = PLAYER_ORDER.slice(0, count);
  if (!players.includes(first)) first = players[0];
  if (size === 13) size = 11;
  if (![9, 11].includes(size)) size = 9;
  if (count > 2 && size === 9) size = 11;
  const mid = Math.floor(size / 2);
  const inset = count > 2 ? 1 : 0;
  const slots = [
    { r: size - 1 - inset, c: mid },
    { r: inset, c: mid },
    { r: mid, c: inset },
    { r: mid, c: size - 1 - inset },
  ];
  const offset = ((layoutOffset % 4) + 4) % 4;
  return {
    size,
    players,
    turn: first,
    startingPlayer: first,
    botPlayers: botPlayers.filter((player) => players.includes(player)),
    playerTurns: { red: 0, blue: 0, green: 0, yellow: 0 },
    passAvailable: { red: true, blue: true, green: true, yellow: true },
    layoutOffset: offset,
    phase: "move",
    turnCount: 0,
    probes: {
      red: slots[offset % 4],
      blue: slots[(offset + 1) % 4],
      green: slots[(offset + 2) % 4],
      yellow: slots[(offset + 3) % 4],
    },
    meteors: [],
    obstaclesEnabled,
    obstacles: [],
    obstacleAvailable: {
      red: obstaclesEnabled ? 2 : 0,
      blue: obstaclesEnabled ? 2 : 0,
      green: obstaclesEnabled ? 2 : 0,
      yellow: obstaclesEnabled ? 2 : 0,
    },
    inventory: {
      red: { small: 2, large: 1 },
      blue: { small: 2, large: 1 },
      green: { small: 2, large: 1 },
      yellow: { small: 2, large: 1 },
    },
    selected: "small",
    winner: null,
    message: `${playerName(first)}：探査機を1マス移動`,
    log: [`ゲーム開始 — ${playerName(first)}が先攻`],
    nextMeteorId: 1,
    repetitions: {},
  };
}

export function legalMoves(state: GameState, player = state.turn): Pos[] {
  const probe = state.probes[player];
  const players = activePlayers(state);
  return [
    { r: probe.r - 1, c: probe.c },
    { r: probe.r + 1, c: probe.c },
    { r: probe.r, c: probe.c - 1 },
    { r: probe.r, c: probe.c + 1 },
  ].filter(
    (target) =>
      target.r >= 0 &&
      target.c >= 0 &&
      target.r < state.size &&
      target.c < state.size &&
      !players.some(
        (candidate) => candidate !== player && samePos(target, state.probes[candidate]),
      ) &&
      !state.meteors.some((meteor) => samePos(meteor, target)) &&
      !activeObstacles(state).some((obstacle) => samePos(obstacle, target)),
  );
}

function stateKey(state: GameState, nextTurn: Player) {
  const meteors = [...state.meteors]
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((meteor) => `${meteor.r},${meteor.c},${meteor.owner},${meteor.size}`)
    .join("|");
  return [
    nextTurn,
    activePlayers(state)
      .map((player) => `${player}:${state.probes[player].r},${state.probes[player].c}`)
      .join("|"),
    meteors,
    activeObstacles(state)
      .map((obstacle) => `${obstacle.r},${obstacle.c},${obstacle.owner}`)
      .join("|"),
    JSON.stringify(state.obstacleAvailable ?? {}),
    JSON.stringify(state.passAvailable ?? {}),
    JSON.stringify(state.playerTurns ?? {}),
    JSON.stringify(state.inventory),
  ].join("/");
}

export function finishTurn(draft: GameState, extraLog?: string): GameState {
  const nextTurn = nextPlayer(draft);
  const nextCount = draft.turnCount + 1;
  const supplyLargeMeteor = activePlayers(draft).length >= 3 && nextCount === 15;
  const inventory = supplyLargeMeteor
    ? (Object.fromEntries(
        PLAYER_ORDER.map((player) => [
          player,
          {
            ...draft.inventory[player],
            large:
              draft.inventory[player].large +
              (activePlayers(draft).includes(player) ? 1 : 0),
          },
        ]),
      ) as Inventory)
    : draft.inventory;
  const turnDraft = { ...draft, inventory };
  const turnLogs = [
    ...(extraLog ? [extraLog] : []),
    ...(supplyLargeMeteor
      ? ["METEOR SUPPLY：全プレイヤーに大メテオ＋1"]
      : []),
  ];
  const playerTurns = {
    ...(draft.playerTurns ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
    [draft.turn]: (draft.playerTurns?.[draft.turn] ?? 0) + 1,
  };
  const key = stateKey(turnDraft, nextTurn);
  const repetitions = {
    ...draft.repetitions,
    [key]: (draft.repetitions[key] ?? 0) + 1,
  };
  const drawByRepeat = repetitions[key] >= 3;
  const drawByLimit = nextCount >= 120;
  if (drawByRepeat || drawByLimit) {
    const reason = drawByRepeat ? "同一局面が3回繰り返されました" : "60ラウンドが終了しました";
    return {
      ...turnDraft,
      phase: "over",
      winner: "draw",
      message: `引き分け — ${reason}`,
      repetitions,
      turnCount: nextCount,
      playerTurns,
      log: [...draft.log, ...(extraLog ? [extraLog] : []), `引き分け：${reason}`],
    };
  }
  return {
    ...turnDraft,
    turn: nextTurn,
    phase: "move",
    turnCount: nextCount,
    playerTurns,
    repetitions,
    selected:
      inventory[nextTurn].small > 0
        ? "small"
        : inventory[nextTurn].large > 0
          ? "large"
          : canPlaceObstacle(draft, nextTurn)
            ? "obstacle"
            : "small",
    message: `${playerName(nextTurn)}：探査機を1マス移動`,
    log: [...draft.log, ...turnLogs],
  };
}

export function applyPass(state: GameState): GameState {
  if (state.phase !== "place" || !(state.passAvailable?.[state.turn] ?? true)) {
    throw new Error("配置パスは使用できません");
  }
  return finishTurn(
    {
      ...state,
      passAvailable: { ...state.passAvailable, [state.turn]: false },
    },
    `${playerName(state.turn)}はメテオを配置しませんでした`,
  );
}

export function applyMove(state: GameState, target: Pos): GameState {
  if (state.phase !== "move" || !legalMoves(state).some((move) => samePos(move, target))) {
    throw new Error("そのマスへは移動できません");
  }
  const mid = Math.floor(state.size / 2);
  const probes = { ...state.probes, [state.turn]: target };
  const log = [...state.log, `${playerName(state.turn)}が (${target.r},${target.c}) へ移動`];
  if (target.r === mid && target.c === mid) {
    return {
      ...state,
      probes,
      phase: "over",
      winner: state.turn,
      message: `${playerName(state.turn)} WIN!`,
      log: [...log, `${playerName(state.turn)}が中央へ到達`],
    };
  }
  if (state.turnCount === 0) {
    return finishTurn({ ...state, probes, log }, "先攻の初手：メテオ配置なし");
  }
  const hasPlacement =
    state.inventory[state.turn].small + state.inventory[state.turn].large > 0 ||
    canPlaceObstacle(state);
  if (!hasPlacement) return finishTurn({ ...state, probes, log }, "配置できるメテオなし");
  return {
    ...state,
    probes,
    phase: "place",
    message: `${playerName(state.turn)}：メテオを配置`,
    log,
  };
}

export function applyMeteor(
  state: GameState,
  target: Pos,
  chosenSize: MeteorSize,
): MeteorResolution {
  const mid = Math.floor(state.size / 2);
  if (
    state.phase !== "place" ||
    samePos(target, { r: mid, c: mid }) ||
    activePlayers(state).some((player) => samePos(target, state.probes[player])) ||
    state.meteors.some((meteor) => samePos(meteor, target)) ||
    activeObstacles(state).some((obstacle) => samePos(obstacle, target)) ||
    state.inventory[state.turn][chosenSize] <= 0
  ) {
    throw new Error("そのマスにはメテオを配置できません");
  }

  const radius = chosenSize === "small" ? 1 : 2;
  const destroyed = state.meteors.filter((meteor) => distance(meteor, target) <= radius);
  const survivors = state.meteors.filter((meteor) => distance(meteor, target) > radius);
  const placed: Meteor = {
    ...target,
    owner: state.turn,
    size: chosenSize,
    id: state.nextMeteorId,
  };
  const inventory: Inventory = {
    red: { ...state.inventory.red },
    blue: { ...state.inventory.blue },
    green: { ...state.inventory.green },
    yellow: { ...state.inventory.yellow },
  };
  inventory[state.turn][chosenSize] -= 1;
  destroyed.forEach((meteor) => {
    inventory[meteor.owner][meteor.size] += 1;
  });

  // Probe movement is resolved while every old meteor is still on the board.
  const blockingMeteors = [...state.meteors, ...activeObstacles(state), placed];
  const before = state.probes;
  const probes = Object.fromEntries(
    PLAYER_ORDER.map((player) => [player, { ...before[player] }]),
  ) as Record<Player, Pos>;
  const reached: Player[] = [];

  activePlayers(state).forEach((player) => {
    const start = before[player];
    const d = distance(start, target);
    const steps =
      chosenSize === "small" ? (d === 1 ? 1 : 0) : d === 1 ? 2 : d === 2 ? 1 : 0;
    if (!steps) return;
    const dr = Math.sign(start.r - target.r);
    const dc = Math.sign(start.c - target.c);
    let position = { ...start };
    for (let index = 0; index < steps; index += 1) {
      const next = { r: position.r + dr, c: position.c + dc };
      const blocked =
        next.r < 0 ||
        next.c < 0 ||
        next.r >= state.size ||
        next.c >= state.size ||
        blockingMeteors.some((meteor) => samePos(meteor, next)) ||
        activePlayers(state).some(
          (candidate) => candidate !== player && samePos(next, before[candidate]),
        );
      if (blocked) break;
      position = next;
      if (samePos(position, { r: mid, c: mid })) {
        reached.push(player);
        break;
      }
    }
    probes[player] = position;
  });

  const placementLog = `${playerName(state.turn)}が${meteorName(chosenSize)}を (${target.r},${target.c}) に配置`;
  const recoveryLog = destroyed.length ? ` — メテオ${destroyed.length}個を破壊・返還` : "";
  const log = [...state.log, placementLog + recoveryLog];
  const draft: GameState = {
    ...state,
    probes,
    meteors: [...survivors, placed],
    inventory,
    nextMeteorId: state.nextMeteorId + 1,
    log,
  };

  let next: GameState;
  if (reached.length) {
    const winner = coreWinner(state, reached) as Player | "draw";
    next = {
      ...draft,
      phase: "over",
      winner,
      message: winner === "draw" ? "同時到達 — DRAW" : `${playerName(winner)} WIN!`,
      log: [...log, winner === "draw" ? "両機が中央へ到達" : `${playerName(winner)}が爆風で中央へ到達`],
    };
  } else {
    next = finishTurn(draft);
  }

  return {
    state: next,
    target,
    size: chosenSize,
    destroyedIds: destroyed.map((meteor) => meteor.id),
    pushed: Object.fromEntries(
      activePlayers(state)
        .filter((player) => !samePos(before[player], probes[player]))
        .map((player) => [
          player,
          {
            from: before[player],
            dr: probes[player].r - before[player].r,
            dc: probes[player].c - before[player].c,
          },
        ]),
    ),
  };
}

export function applyObstacle(state: GameState, target: Pos): GameState {
  const mid = Math.floor(state.size / 2);
  if (
    state.phase !== "place" ||
    !canPlaceObstacle(state) ||
    samePos(target, { r: mid, c: mid }) ||
    activePlayers(state).some((player) => samePos(target, state.probes[player])) ||
    state.meteors.some((meteor) => samePos(meteor, target)) ||
    activeObstacles(state).some((obstacle) => samePos(obstacle, target)) ||
    activeObstacles(state).some((obstacle) => orthogonallyAdjacent(obstacle, target))
  ) {
    throw new Error("そのマスにはお邪魔メテオを配置できません");
  }
  const obstacleAvailable = {
    ...state.obstacleAvailable,
    [state.turn]: Math.max(0, obstacleCount(state) - 1),
  };
  const obstacle: ObstacleMeteor = {
    ...target,
    owner: state.turn,
    id: state.nextMeteorId,
  };
  return finishTurn(
    {
      ...state,
      obstacles: [...activeObstacles(state), obstacle],
      obstacleAvailable,
      nextMeteorId: state.nextMeteorId + 1,
      log: [
        ...state.log,
        `${playerName(state.turn)}がお邪魔メテオを(${target.r},${target.c})に配置`,
      ],
    },
    "お邪魔メテオは破壊・回収されません",
  );
}
