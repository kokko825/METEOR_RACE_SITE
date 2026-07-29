export type Player = "red" | "blue" | "green" | "yellow";
export type MeteorSize = "small" | "large";
export type GameVariant = "classic" | "team" | "item";
export type ItemKind = "shield" | "booster" | "capsule";
export type Pos = { r: number; c: number };
export type Meteor = Pos & { owner: Player; size: MeteorSize; id: number; consumable?: boolean };
export type FieldItem = Pos & { kind: ItemKind; id: number };
export type ObstacleMeteor = Pos & { owner: Player; id: number };
export type Inventory = Record<Player, Record<MeteorSize, number>>;
export type Phase = "move" | "place" | "over";

export type GameState = {
  size: number;
  variant: GameVariant;
  players: Player[];
  turn: Player;
  phase: Phase;
  bonusMove: boolean;
  fieldItems: FieldItem[];
  shield: Record<Player, boolean>;
  boosterMoves: Record<Player, number>;
  capsuleMeteors: Record<Player, number>;
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
  selected: MeteorSize | "obstacle" | "capsule";
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
export const activeObstacles = (_state: GameState): ObstacleMeteor[] => [];
export const canPlaceObstacle = (_state: GameState, _player?: Player) => false;
export const obstacleCount = (_state: GameState, _player?: Player) => 0;
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
  variant: GameVariant = "classic",
): GameState {
  if (variant === "team") {
    playerCount = 4;
  }
  if (variant === "item") size = 15;
  const count = Math.max(2, Math.min(4, playerCount));
  const players =
    variant === "team"
      ? (["red", "blue", "yellow", "green"] as Player[])
      : PLAYER_ORDER.slice(0, count);
  if (!players.includes(first)) first = players[0];
  if (![9, 11, 13, 15].includes(size)) size = 9;
  if (count > 2 && size === 9) size = 11;
  const mid = Math.floor(size / 2);
  // 9×9だけは外周スタート。それより大きい盤面は人数に関係なく1周内側。
  const inset = size === 9 ? 0 : 1;
  const slots = [
    { r: size - 1 - inset, c: mid },
    { r: inset, c: mid },
    { r: mid, c: inset },
    { r: mid, c: size - 1 - inset },
  ];
  const offset = ((layoutOffset % 4) + 4) % 4;
  const fieldItems: FieldItem[] =
    variant === "item"
      ? [
          { r: 3, c: 3, kind: "shield", id: 1 },
          { r: 3, c: mid, kind: "booster", id: 2 },
          { r: 3, c: size - 4, kind: "capsule", id: 3 },
          { r: mid, c: 3, kind: "capsule", id: 4 },
          { r: mid, c: size - 4, kind: "shield", id: 5 },
          { r: size - 4, c: 3, kind: "booster", id: 6 },
          { r: size - 4, c: mid, kind: "shield", id: 7 },
          { r: size - 4, c: size - 4, kind: "capsule", id: 8 },
        ]
      : [];
  return {
    size,
    variant,
    players,
    turn: first,
    startingPlayer: first,
    botPlayers: botPlayers.filter((player) => players.includes(player)),
    playerTurns: { red: 0, blue: 0, green: 0, yellow: 0 },
    passAvailable: { red: true, blue: true, green: true, yellow: true },
    layoutOffset: offset,
    phase: "move",
    bonusMove: false,
    fieldItems,
    shield: { red: false, blue: false, green: false, yellow: false },
    boosterMoves: { red: 0, blue: 0, green: 0, yellow: 0 },
    capsuleMeteors: { red: 0, blue: 0, green: 0, yellow: 0 },
    turnCount: 0,
    probes: {
      red: slots[offset % 4],
      blue: slots[(offset + 1) % 4],
      green: slots[(offset + 2) % 4],
      yellow: slots[(offset + 3) % 4],
    },
    meteors: [],
    obstaclesEnabled: false,
    obstacles: [],
    obstacleAvailable: {
      red: 0,
      blue: 0,
      green: 0,
      yellow: 0,
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
  const directions = [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ];
  const maxSteps =
    state.variant === "item" && (state.boosterMoves?.[player] ?? 0) > 0 ? 2 : 1;
  const moves: Pos[] = [];
  directions.forEach((direction) => {
    for (let step = 1; step <= maxSteps; step += 1) {
      const target = {
        r: probe.r + direction.r * step,
        c: probe.c + direction.c * step,
      };
      const legal =
        target.r >= 0 &&
        target.c >= 0 &&
        target.r < state.size &&
        target.c < state.size &&
        !players.some(
          (candidate) => candidate !== player && samePos(target, state.probes[candidate]),
        ) &&
        !state.meteors.some((meteor) => samePos(meteor, target)) &&
        !activeObstacles(state).some((obstacle) => samePos(obstacle, target));
      if (!legal) break;
      moves.push(target);
    }
  });
  return moves;
}

export const teamOf = (player: Player): "sun" | "moon" =>
  player === "red" || player === "yellow" ? "sun" : "moon";

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
    JSON.stringify(state.fieldItems ?? []),
    JSON.stringify(state.shield ?? {}),
    JSON.stringify(state.boosterMoves ?? {}),
    JSON.stringify(state.capsuleMeteors ?? {}),
    state.bonusMove ? "bonus" : "normal",
  ].join("/");
}

export function finishTurn(draft: GameState, extraLog?: string): GameState {
  const nextTurn = nextPlayer(draft);
  const nextCount = draft.turnCount + 1;
  const inventory = draft.inventory;
  const turnDraft = draft;
  const turnLogs = extraLog ? [extraLog] : [];
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
      bonusMove: false,
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
    bonusMove: false,
    turnCount: nextCount,
    playerTurns,
    repetitions,
    selected:
      inventory[nextTurn].small > 0
        ? "small"
        : inventory[nextTurn].large > 0
          ? "large"
          : (draft.capsuleMeteors?.[nextTurn] ?? 0) > 0
            ? "capsule"
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
  const picked = state.fieldItems?.find((item) => samePos(item, target));
  const shield = { ...(state.shield ?? { red: false, blue: false, green: false, yellow: false }) };
  const boosterMoves = { ...(state.boosterMoves ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  const capsuleMeteors = { ...(state.capsuleMeteors ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  if (picked?.kind === "shield") shield[state.turn] = true;
  if (picked?.kind === "booster") boosterMoves[state.turn] = 2;
  else if ((boosterMoves[state.turn] ?? 0) > 0) boosterMoves[state.turn] -= 1;
  if (picked?.kind === "capsule") capsuleMeteors[state.turn] += 1;
  const pickedLabel =
    picked?.kind === "shield"
      ? "シールド"
      : picked?.kind === "booster"
        ? "ブースト"
        : picked?.kind === "capsule"
          ? "使い捨てメテオ"
          : null;
  state = {
    ...state,
    fieldItems: picked
      ? state.fieldItems.filter((item) => item.id !== picked.id)
      : state.fieldItems ?? [],
    shield,
    boosterMoves,
    capsuleMeteors,
  };
  const mid = Math.floor(state.size / 2);
  const probes = { ...state.probes, [state.turn]: target };
  const pickupMessage = pickedLabel ? `・${pickedLabel}を取得` : "";
  const log = [
    ...state.log,
    `${playerName(state.turn)}が (${target.r},${target.c}) へ移動${pickupMessage}`,
  ];
  if (target.r === mid && target.c === mid) {
    return {
      ...state,
      probes,
      phase: "over",
      bonusMove: false,
      winner: state.turn,
      message:
        state.variant === "team"
          ? `${playerName(state.turn)} / ${
              teamOf(state.turn) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"
            } TEAM WIN!`
          : `${playerName(state.turn)} WIN!`,
      log: [...log, `${playerName(state.turn)}が中央へ到達`],
    };
  }
  if (state.turnCount === 0) {
    return finishTurn({ ...state, probes, log }, "先攻の初手：メテオ配置なし");
  }
  const meteorless =
    state.inventory[state.turn].small +
      state.inventory[state.turn].large +
      (state.capsuleMeteors?.[state.turn] ?? 0) ===
    0;
  if (meteorless && !state.bonusMove) {
    return {
      ...state,
      probes,
      phase: "move",
      bonusMove: true,
      message: `${playerName(state.turn)}：ボーナス移動でもう1マス`,
      log: [...log, `${playerName(state.turn)}：手持ちメテオ0・ボーナス移動`],
    };
  }
  if (state.bonusMove) {
    return finishTurn(
      { ...state, probes, bonusMove: false, log },
      `${playerName(state.turn)}：ボーナス移動完了`,
    );
  }
  const hasPlacement =
    state.inventory[state.turn].small +
      state.inventory[state.turn].large +
      (state.capsuleMeteors?.[state.turn] ?? 0) >
      0 ||
    canPlaceObstacle(state);
  if (!hasPlacement) return finishTurn({ ...state, probes, log }, "配置できるメテオなし");
  return {
    ...state,
    probes,
    phase: "place",
    message: pickedLabel
      ? `${playerName(state.turn)}：${pickedLabel}を取得・メテオを配置`
      : `${playerName(state.turn)}：メテオを配置`,
    log,
  };
}

export function applyMeteor(
  state: GameState,
  target: Pos,
  chosenSize: MeteorSize,
  useCapsule = false,
): MeteorResolution {
  const mid = Math.floor(state.size / 2);
  if (
    state.phase !== "place" ||
    state.turnCount === 0 ||
    samePos(target, { r: mid, c: mid }) ||
    activePlayers(state).some((player) => samePos(target, state.probes[player])) ||
    state.meteors.some((meteor) => samePos(meteor, target)) ||
    activeObstacles(state).some((obstacle) => samePos(obstacle, target)) ||
    (useCapsule
      ? chosenSize !== "small" || (state.capsuleMeteors?.[state.turn] ?? 0) <= 0
      : state.inventory[state.turn][chosenSize] <= 0)
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
    consumable: useCapsule,
  };
  const inventory: Inventory = {
    red: { ...state.inventory.red },
    blue: { ...state.inventory.blue },
    green: { ...state.inventory.green },
    yellow: { ...state.inventory.yellow },
  };
  if (!useCapsule) inventory[state.turn][chosenSize] -= 1;
  destroyed.forEach((meteor) => {
    if (!meteor.consumable) inventory[meteor.owner][meteor.size] += 1;
  });
  const capsuleMeteors = {
    ...(state.capsuleMeteors ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
  };
  if (useCapsule) capsuleMeteors[state.turn] -= 1;

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
    const baseSteps =
      chosenSize === "small" ? (d === 1 ? 1 : 0) : d === 1 ? 2 : d === 2 ? 1 : 0;
    // BOOSTER中は敵の爆風に弱い。ただし自分の爆風を倍化して加速には使えない。
    const steps =
      (state.boosterMoves?.[player] ?? 0) > 0 && player !== state.turn
        ? baseSteps * 2
        : baseSteps;
    if (!steps) return;
    if (state.shield?.[player]) return;
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

  let fieldItems = state.fieldItems ?? [];
  const boosterMoves = {
    ...(state.boosterMoves ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
  };
  const shieldAfterBlast = {
    ...(state.shield ?? { red: false, blue: false, green: false, yellow: false }),
    ...Object.fromEntries(
      activePlayers(state)
        .filter((player) => {
          const d = distance(before[player], target);
          return Boolean(state.shield?.[player]) &&
            (chosenSize === "small" ? d === 1 : d === 1 || d === 2);
        })
        .map((player) => [player, false]),
    ),
  };
  const pickupLogs: string[] = [];
  activePlayers(state).forEach((player) => {
    if (samePos(before[player], probes[player])) return;
    const picked = fieldItems.find((item) => samePos(item, probes[player]));
    if (!picked) return;
    fieldItems = fieldItems.filter((item) => item.id !== picked.id);
    if (picked.kind === "shield") shieldAfterBlast[player] = true;
    if (picked.kind === "booster") boosterMoves[player] = 2;
    if (picked.kind === "capsule") capsuleMeteors[player] += 1;
    const label =
      picked.kind === "shield"
        ? "シールド"
        : picked.kind === "booster"
          ? "ブースト"
          : "使い捨てメテオ";
    pickupLogs.push(`${playerName(player)}が爆風着地で${label}を取得`);
  });

  const placementLog = `${playerName(state.turn)}が${meteorName(chosenSize)}を (${target.r},${target.c}) に配置`;
  const recoveryLog = destroyed.length ? ` — メテオ${destroyed.length}個を破壊・返還` : "";
  const log = [...state.log, placementLog + recoveryLog, ...pickupLogs];
  const draft: GameState = {
    ...state,
    probes,
    fieldItems,
    meteors: [...survivors, placed],
    inventory,
    capsuleMeteors,
    boosterMoves,
    shield: shieldAfterBlast,
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
      message:
        winner === "draw"
          ? "同時到達 — DRAW"
          : state.variant === "team"
            ? `${playerName(winner)} / ${
                teamOf(winner) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"
              } TEAM WIN!`
            : `${playerName(winner)} WIN!`,
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
