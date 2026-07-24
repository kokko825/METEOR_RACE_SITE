export type Player = "red" | "blue";
export type MeteorSize = "small" | "large";
export type Pos = { r: number; c: number };
export type Meteor = Pos & { owner: Player; size: MeteorSize; id: number };
export type Inventory = Record<Player, Record<MeteorSize, number>>;
export type Phase = "move" | "place" | "over";

export type GameState = {
  size: number;
  turn: Player;
  phase: Phase;
  turnCount: number;
  probes: Record<Player, Pos>;
  meteors: Meteor[];
  inventory: Inventory;
  selected: MeteorSize;
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

export const other = (player: Player): Player => (player === "red" ? "blue" : "red");
export const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
export const distance = (a: Pos, b: Pos) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
export const playerName = (player: Player) => (player === "red" ? "RED" : "BLUE");
export const meteorName = (size: MeteorSize) => (size === "small" ? "小メテオ" : "大メテオ");

export function initialGameState(size = 9, first: Player = "red"): GameState {
  const mid = Math.floor(size / 2);
  return {
    size,
    turn: first,
    phase: "move",
    turnCount: 0,
    probes: { red: { r: size - 1, c: mid }, blue: { r: 0, c: mid } },
    meteors: [],
    inventory: {
      red: { small: 2, large: 1 },
      blue: { small: 2, large: 1 },
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
      !samePos(target, state.probes[other(player)]) &&
      !state.meteors.some((meteor) => samePos(meteor, target)),
  );
}

function stateKey(state: GameState, nextTurn: Player) {
  const meteors = [...state.meteors]
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((meteor) => `${meteor.r},${meteor.c},${meteor.owner},${meteor.size}`)
    .join("|");
  return [
    nextTurn,
    `${state.probes.red.r},${state.probes.red.c}`,
    `${state.probes.blue.r},${state.probes.blue.c}`,
    meteors,
    JSON.stringify(state.inventory),
  ].join("/");
}

export function finishTurn(draft: GameState, extraLog?: string): GameState {
  const nextTurn = other(draft.turn);
  const nextCount = draft.turnCount + 1;
  const key = stateKey(draft, nextTurn);
  const repetitions = {
    ...draft.repetitions,
    [key]: (draft.repetitions[key] ?? 0) + 1,
  };
  const drawByRepeat = repetitions[key] >= 3;
  const drawByLimit = nextCount >= 120;
  if (drawByRepeat || drawByLimit) {
    const reason = drawByRepeat ? "同一局面が3回繰り返されました" : "60ラウンドが終了しました";
    return {
      ...draft,
      phase: "over",
      winner: "draw",
      message: `引き分け — ${reason}`,
      repetitions,
      turnCount: nextCount,
      log: [...draft.log, ...(extraLog ? [extraLog] : []), `引き分け：${reason}`],
    };
  }
  return {
    ...draft,
    turn: nextTurn,
    phase: "move",
    turnCount: nextCount,
    repetitions,
    selected: draft.inventory[nextTurn].small > 0 ? "small" : "large",
    message: `${playerName(nextTurn)}：探査機を1マス移動`,
    log: [...draft.log, ...(extraLog ? [extraLog] : [])],
  };
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
  const hasMeteor = state.inventory[state.turn].small + state.inventory[state.turn].large > 0;
  if (!hasMeteor) return finishTurn({ ...state, probes, log }, "手持ちメテオなし");
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
    samePos(target, state.probes.red) ||
    samePos(target, state.probes.blue) ||
    state.meteors.some((meteor) => samePos(meteor, target)) ||
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
  };
  inventory[state.turn][chosenSize] -= 1;
  destroyed.forEach((meteor) => {
    inventory[meteor.owner][meteor.size] += 1;
  });

  // Probe movement is resolved while every old meteor is still on the board.
  const blockingMeteors = [...state.meteors, placed];
  const before = state.probes;
  const probes: Record<Player, Pos> = {
    red: { ...before.red },
    blue: { ...before.blue },
  };
  const reached: Player[] = [];

  (["red", "blue"] as Player[]).forEach((player) => {
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
        samePos(next, before[other(player)]);
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
    const winner = reached.length === 1 ? reached[0] : "draw";
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
      (["red", "blue"] as Player[])
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
