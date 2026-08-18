import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";

export type Player = "red" | "blue" | "green" | "yellow";
export type MeteorSize = "small" | "large";
export type GameVariant = "classic" | "team" | "item" | "team-item";
export type ItemKind = "shield" | "booster" | "holo" | "orbit" | "blast" | "pulse" | "recall" | "gravity";
export type Pos = { r: number; c: number };
export type Meteor = Pos & { owner: Player; size: MeteorSize; id: number; consumable?: boolean };
export type ObstacleMeteor = Pos & { owner: Player; id: number; turns?: number };
export type PulseDevice = Pos & { owner: Player; id: number; turns: number; createdTurnCount?: number };
export type Inventory = Record<Player, Record<MeteorSize, number>>;
export type Phase = "setup" | "move" | "place" | "switch" | "over";
export type PendingSwitch = { kind: "holo" | "orbit" | "blast" | "pulse" | "recall"; player: Player };

export type GameState = {
  size: number;
  variant: GameVariant;
  players: Player[];
  turn: Player;
  phase: Phase;
  bonusMove: boolean;
  shield: Record<Player, boolean>;
  shieldCharges?: Record<Player, number>;
  boosterMoves: Record<Player, number>;
  immobilizedMoves?: Record<Player, number>;
  capsuleMeteors: Record<Player, number>;
  turnCount: number;
  probes: Record<Player, Pos>;
  meteors: Meteor[];
  obstaclesEnabled: boolean;
  obstacles: ObstacleMeteor[];
  pulseDevices?: PulseDevice[];
  obstacleAvailable: Record<Player, number>;
  layoutOffset: number;
  startingPlayer: Player;
  botPlayers: Player[];
  playerTurns: Record<Player, number>;
  passAvailable: Record<Player, boolean>;
  inventory: Inventory;
  selected: MeteorSize | "obstacle" | "capsule";
  winner: Player | "draw" | null;
  finishOrder?: Player[];
  message: string;
  log: string[];
  nextMeteorId: number;
  nextPulseDeviceId?: number;
  repetitions: Record<string, number>;
  pendingSwitches?: PendingSwitch[];
  switchResume?: "place" | "finish";
  itemHands?: Partial<Record<Player, ItemKind[]>>;
  setupConfirmed?: Partial<Record<Player, boolean>>;
  balance?: BalanceConfig;
  ranked?: boolean;
  rankedGravityRoundsRemaining?: number;
  rankedRoundActed?: Player[];
  rankedGravityPulse?: number;
};

export type MeteorResolution = {
  state: GameState;
  target: Pos;
  size: MeteorSize;
  destroyedIds: number[];
  pushed: Partial<Record<Player, { from: Pos; dr: number; dc: number }>>;
};

export const PLAYER_ORDER: Player[] = ["red", "blue", "green", "yellow"];
export const isTeamVariant = (variant: GameVariant) => variant === "team" || variant === "team-item";
export const isItemVariant = (variant: GameVariant) => variant === "item" || variant === "team-item";
export const activePlayers = (state: GameState): Player[] =>
  state.players?.length ? state.players : ["red", "blue"];
const gameBalance = (state: GameState) => normalizeBalance(state.balance);
export const activeObstacles = (state: GameState): ObstacleMeteor[] => {
  return state.obstacles ?? [];
};
export const activePulseDevices = (state: GameState): PulseDevice[] =>
  (state.pulseDevices ?? []).filter((device) => device.turns > 0);
export const isPulseLocked = (state: GameState, player: Player): boolean =>
  activePulseDevices(state).some((device) => distance(device, state.probes[player]) <= gameBalance(state).pulseRadius);
export const canPlaceObstacle = (state: GameState, player?: Player) => {
  void state;
  void player;
  return false;
};
export const obstacleCount = (state: GameState, player?: Player) => {
  void state;
  void player;
  return 0;
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
function startCells(state: GameState): Pos[] {
  const mid = Math.floor(state.size / 2);
  const inset = state.size === 9 ? 0 : 1;
  return [
    { r: state.size - 1 - inset, c: mid }, { r: inset, c: mid },
    { r: mid, c: inset }, { r: mid, c: state.size - 1 - inset },
  ];
}
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

export function resolveCoreArrivals(state: GameState, next: GameState, reached: Player[]): GameState {
  if (!reached.length) return next;
  const first = coreWinner(state, reached);
  const ordered = [first, ...reached.filter((player) => player !== first)];
  const multiRank = !isTeamVariant(state.variant) &&
    (activePlayers(state).length > 2 || (state.finishOrder?.length ?? 0) > 0);
  if (!multiRank) {
    return {
      ...next,
      phase: "over",
      bonusMove: false,
      winner: first,
      message: isTeamVariant(state.variant)
        ? `${playerName(first)} / ${teamOf(first) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"} TEAM WIN!`
        : `${playerName(first)} WIN!`,
    };
  }
  const finishOrder = [...(state.finishOrder ?? [])];
  ordered.forEach((player) => {
    if (!finishOrder.includes(player)) finishOrder.push(player);
  });
  const remaining = activePlayers(state).filter((player) => !finishOrder.includes(player));
  if (remaining.length <= 1) {
    const finalOrder = [...finishOrder, ...remaining];
    return {
      ...next,
      players: remaining,
      phase: "over",
      bonusMove: false,
      winner: finalOrder[0] ?? first,
      finishOrder: finalOrder,
      message: `${playerName(finalOrder[0] ?? first)} WIN!　順位が確定しました`,
    };
  }
  let turn = remaining.includes(next.turn) ? next.turn : remaining[0];
  if (!remaining.includes(next.turn)) {
    const players = activePlayers(state);
    const index = Math.max(0, players.indexOf(state.turn));
    for (let offset = 1; offset <= players.length; offset += 1) {
      const candidate = players[(index + offset) % players.length];
      if (remaining.includes(candidate)) {
        turn = candidate;
        break;
      }
    }
  }
  return {
    ...next,
    players: remaining,
    turn,
    phase: "move",
    bonusMove: false,
    winner: null,
    finishOrder,
    message: `${playerName(first)} GOAL!　${finishOrder.length}位確定。${playerName(turn)}の移動`,
  };
}

export function initialGameState(
  size = 9,
  first: Player = "red",
  playerCount = 2,
  obstaclesEnabled = false,
  layoutOffset = 0,
  botPlayers: Player[] = [],
  variant: GameVariant = "classic",
  balance: BalanceConfig = DEFAULT_BALANCE,
  ranked = false,
): GameState {
  void obstaclesEnabled;
  if (isTeamVariant(variant)) {
    playerCount = 4;
    if (size === 9 || size === 11) size = 13;
  }
  if (variant === "item" && size === 9) size = 11;
  const count = Math.max(2, Math.min(4, playerCount));
  const players =
    isTeamVariant(variant)
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
  const probes = {
    red: slots[offset % 4],
    blue: slots[(offset + 1) % 4],
    green: slots[(offset + 2) % 4],
    yellow: slots[(offset + 3) % 4],
  };
  return {
    size,
    balance: normalizeBalance(balance),
    variant,
    players,
    turn: first,
    startingPlayer: first,
    botPlayers: botPlayers.filter((player) => players.includes(player)),
    playerTurns: { red: 0, blue: 0, green: 0, yellow: 0 },
    passAvailable: { red: true, blue: true, green: true, yellow: true },
    layoutOffset: offset,
    phase: isItemVariant(variant) ? "setup" : "move",
    bonusMove: false,
    shield: { red: false, blue: false, green: false, yellow: false },
    shieldCharges: { red: 0, blue: 0, green: 0, yellow: 0 },
    boosterMoves: { red: 0, blue: 0, green: 0, yellow: 0 },
    immobilizedMoves: { red: 0, blue: 0, green: 0, yellow: 0 },
    capsuleMeteors: { red: 0, blue: 0, green: 0, yellow: 0 },
    turnCount: 0,
    probes,
    meteors: [],
    obstaclesEnabled: false,
    obstacles: [],
    pulseDevices: [],
    obstacleAvailable: {
      red: 0,
      blue: 0,
      green: 0,
      yellow: 0,
    },
    inventory: {
      red: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
      blue: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
      green: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
      yellow: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
    },
    selected: "small",
    winner: null,
    finishOrder: [],
    message: `${playerName(first)}：探査機を1マス移動`,
    log: [`ゲーム開始 — ${playerName(first)}が先攻`],
    nextMeteorId: 1,
    nextPulseDeviceId: 1,
    repetitions: {},
    itemHands: {},
    setupConfirmed: {},
    ranked,
    rankedGravityRoundsRemaining: balance.rankedGravityRounds,
    rankedRoundActed: [],
    rankedGravityPulse: 0,
  };
}

export function applySetupItem(state: GameState, kind: ItemKind, player = state.turn): GameState {
  if (!isItemVariant(state.variant) || state.phase !== "setup") {
    throw new Error("アイテム選択フェーズではありません");
  }
  const hand = state.itemHands?.[player] ?? [];
  const balance = gameBalance(state);
  if (kind === "gravity") throw new Error("GRAVITY is reserved for ranked orbital convergence");
  if (hand.length >= balance.itemHandTotal) throw new Error(`持ち込めるアイテムは${balance.itemHandTotal}個までです`);
  if (hand.filter((entry) => entry === kind).length >= balance.itemSameMax) {
    throw new Error(`同じアイテムは${balance.itemSameMax}個までです`);
  }
  const nextHand = [...hand, kind];
  const itemHands = { ...(state.itemHands ?? {}), [player]: nextHand };
  return {
    ...state,
    itemHands,
    setupConfirmed: { ...(state.setupConfirmed ?? {}), [player]: false },
    message: nextHand.length === balance.itemHandTotal
      ? `${playerName(player)}：持ち込みを確認して決定`
      : `${playerName(player)}：アイテムをあと${balance.itemHandTotal - nextHand.length}個選択`,
    log: [...state.log, `${playerName(player)} selected ${kind.toUpperCase()}`],
  };
}

export function resetSetupItems(state: GameState, player = state.turn): GameState {
  if (!isItemVariant(state.variant) || state.phase !== "setup") throw new Error("アイテム選択フェーズではありません");
  return {
    ...state,
    itemHands: { ...(state.itemHands ?? {}), [player]: [] },
    setupConfirmed: { ...(state.setupConfirmed ?? {}), [player]: false },
    message: `${playerName(player)}：アイテムを3個選択`,
    log: [...state.log, `${playerName(player)} reset item loadout`],
  };
}

export function confirmSetupItems(state: GameState, player = state.turn): GameState {
  if (!isItemVariant(state.variant) || state.phase !== "setup") throw new Error("アイテム選択フェーズではありません");
  if ((state.itemHands?.[player]?.length ?? 0) !== gameBalance(state).itemHandTotal) throw new Error("必要数のアイテムを選んでください");
  const players = activePlayers(state);
  const setupConfirmed = { ...(state.setupConfirmed ?? {}), [player]: true };
  const nextTurn = players.find((player) => !setupConfirmed[player]);
  if (nextTurn) {
    return {
      ...state,
      setupConfirmed,
      turn: nextTurn,
      message: `${playerName(nextTurn)}：アイテムを3個選択`,
      log: [...state.log, `${playerName(player)} completed item loadout`],
    };
  }
  return {
    ...state,
    setupConfirmed,
    turn: state.startingPlayer,
    phase: "move",
    message: `${playerName(state.startingPlayer)}：探査機を1マス移動`,
    log: [...state.log, "全員のアイテム選択完了 — ゲームスタート"],
  };
}

export function legalMoves(state: GameState, player = state.turn): Pos[] {
  if ((state.immobilizedMoves?.[player] ?? 0) > 0 || isPulseLocked(state, player)) return [];
  const probe = state.probes[player];
  const players = activePlayers(state);
  const directions = [
    { r: -1, c: 0 },
    { r: 1, c: 0 },
    { r: 0, c: -1 },
    { r: 0, c: 1 },
  ];
  const maxSteps =
    isItemVariant(state.variant) && (state.boosterMoves?.[player] ?? 0) > 0 ? 2 : 1;
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
        !activeObstacles(state).some((obstacle) => samePos(obstacle, target)) &&
        !activePulseDevices(state).some((device) => samePos(device, target));
      if (!legal) {
        const canJumpMeteor = maxSteps > 1 && step === 1 &&
          (state.meteors.some((meteor) => samePos(meteor, target)) || activePulseDevices(state).some((device) => samePos(device, target)));
        if (canJumpMeteor) continue;
        break;
      }
      const mid = Math.floor(state.size / 2);
      moves.push(target);
      // BOOSTER may enter CORE on either of its two movement steps. CORE ends
      // movement immediately, so cells beyond it are never offered.
      if (target.r === mid && target.c === mid) break;
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
    JSON.stringify(state.pulseDevices ?? []),
    JSON.stringify(state.obstacleAvailable ?? {}),
    JSON.stringify(state.passAvailable ?? {}),
    JSON.stringify(state.playerTurns ?? {}),
    JSON.stringify(state.inventory),
    JSON.stringify(state.itemHands ?? {}),
    JSON.stringify(state.shield ?? {}),
    JSON.stringify(state.boosterMoves ?? {}),
    JSON.stringify(state.capsuleMeteors ?? {}),
    state.bonusMove ? "bonus" : "normal",
  ].join("/");
}

export function finishTurn(draft: GameState, extraLog?: string): GameState {
  // SHIELD no longer decays with turns — it only depletes when it actually
  // absorbs a blast hit (see applyMeteor/applyBlastSwitch), so just keep the
  // boolean flag in sync with whatever charges remain.
  const shieldCharges = draft.shieldCharges ?? { red: 0, blue: 0, green: 0, yellow: 0 };
  const obstacles = activeObstacles(draft)
    .map((obstacle) => obstacle.turns === -1
      ? obstacle
      : ({ ...obstacle, turns: Math.max(0, (obstacle.turns ?? 1) - 1) }))
    .filter((obstacle) => obstacle.turns === -1 || (obstacle.turns ?? 0) > 0);
  const pulseDevices = activePulseDevices(draft)
    .map((device) => device.createdTurnCount === draft.turnCount
      ? device
      : ({ ...device, turns: Math.max(0, device.turns - 1) }))
    .filter((device) => device.turns > 0);
  let turnDraft: GameState = {
    ...draft,
    shieldCharges,
    shield: Object.fromEntries(PLAYER_ORDER.map((p) => [p, (shieldCharges[p] ?? 0) > 0])) as Record<Player, boolean>,
    obstacles,
    pulseDevices,
  };
  let rankedGravityTriggered = false;
  if (turnDraft.ranked) {
    const rankedPlayers = activePlayers(turnDraft);
    const acted = [...new Set([...(turnDraft.rankedRoundActed ?? []), turnDraft.turn])]
      .filter((player) => rankedPlayers.includes(player));
    if (rankedPlayers.every((player) => acted.includes(player))) {
      const gravityRounds = gameBalance(turnDraft).rankedGravityRounds;
      const remaining = Math.max(1, turnDraft.rankedGravityRoundsRemaining ?? gravityRounds) - 1;
      if (remaining <= 0) {
        turnDraft = applyGravity({
          ...turnDraft,
          rankedGravityRoundsRemaining: gravityRounds,
          rankedRoundActed: [],
          rankedGravityPulse: (turnDraft.rankedGravityPulse ?? 0) + 1,
        }, true);
        rankedGravityTriggered = true;
      } else {
        turnDraft = { ...turnDraft, rankedGravityRoundsRemaining: remaining, rankedRoundActed: [] };
      }
    } else {
      turnDraft = { ...turnDraft, rankedRoundActed: acted };
    }
  }
  const nextTurn = nextPlayer(turnDraft);
  const nextCount = turnDraft.turnCount + 1;
  const inventory = turnDraft.inventory;
  const turnLogs = [
    ...(extraLog ? [extraLog] : []),
    ...(rankedGravityTriggered ? ["ORBITAL GRAVITY activated"] : []),
  ];
  const playerTurns = {
    ...(turnDraft.playerTurns ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
    [turnDraft.turn]: (turnDraft.playerTurns?.[turnDraft.turn] ?? 0) + 1,
  };
  const key = stateKey(turnDraft, nextTurn);
  const repetitions = {
    ...turnDraft.repetitions,
    [key]: (turnDraft.repetitions[key] ?? 0) + 1,
  };
  const drawByRepeat = repetitions[key] >= 3;
  const drawByLimit = nextCount >= 120;
  if (rankedGravityTriggered) {
    const core = { r: Math.floor(turnDraft.size / 2), c: Math.floor(turnDraft.size / 2) };
    const reached = activePlayers(turnDraft).filter((player) => samePos(turnDraft.probes[player], core));
    if (reached.length) {
      return resolveCoreArrivals(turnDraft, {
        ...turnDraft,
        turn: nextTurn,
        phase: "move",
        bonusMove: false,
        turnCount: nextCount,
        playerTurns,
        repetitions,
        message: "ORBITAL GRAVITY",
        log: [...draft.log, ...turnLogs],
      }, reached);
    }
  }
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
          : (turnDraft.capsuleMeteors?.[nextTurn] ?? 0) > 0
            ? "capsule"
          : canPlaceObstacle(turnDraft, nextTurn)
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
  // BOOSTER is consumed by the very next move regardless of how many squares
  // that move actually covers (a 1-square move still spends the charge).
  if ((state.boosterMoves?.[state.turn] ?? 0) > 0) {
    state = {
      ...state,
      boosterMoves: {
        ...state.boosterMoves,
        [state.turn]: state.boosterMoves[state.turn] - 1,
      },
    };
  }
  const log = [
    ...state.log,
    `${playerName(state.turn)}が (${target.r},${target.c}) へ移動`,
  ];
  if (target.r === mid && target.c === mid) {
    return resolveCoreArrivals(state, {
      ...state,
      probes,
      phase: "over",
      bonusMove: false,
      winner: state.turn,
      message:
        isTeamVariant(state.variant)
          ? `${playerName(state.turn)} / ${
              teamOf(state.turn) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"
            } TEAM WIN!`
          : `${playerName(state.turn)} WIN!`,
      log: [...log, `${playerName(state.turn)}が中央へ到達`],
    }, [state.turn]);
  }
  if (state.turnCount === 0) {
    return finishTurn({ ...state, probes, log }, "先攻の初手：メテオ配置なし");
  }
  const meteorless =
    state.inventory[state.turn].small +
      state.inventory[state.turn].large +
      (state.capsuleMeteors?.[state.turn] ?? 0) ===
    0;
  if (meteorless && !state.bonusMove && gameBalance(state).emptyMeteorBonusMoves > 0) {
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
    message: `${playerName(state.turn)}：メテオを配置`,
    log,
  };
}

function finishSwitch(state: GameState): GameState {
  const remaining = (state.pendingSwitches ?? []).slice(1);
  if (remaining.length) {
    return { ...state, pendingSwitches: remaining, message: `${remaining[0].kind.toUpperCase()} SWITCH` };
  }
  const cleared = { ...state, pendingSwitches: [], phase: "place" as Phase };
  if (state.switchResume === "finish" || state.turnCount === 0) return finishTurn(cleared);
  return { ...cleared, message: `${playerName(state.turn)}: メテオを配置` };
}

export function canUseItem(state: GameState, kind: ItemKind, player = state.turn) {
  if (!isItemVariant(state.variant) || state.phase !== "place") return false;
  if (kind === "gravity") return false;
  if (!(state.itemHands?.[player] ?? []).includes(kind)) return false;
  if (kind === "shield" && (state.shieldCharges?.[player] ?? 0) > 0) return false;
  if (kind === "booster" && (state.boosterMoves?.[player] ?? 0) > 0) return false;
  if (kind === "recall" &&
      !state.meteors.some((meteor) => meteor.owner === player && !meteor.consumable) &&
      !activeObstacles(state).some((holo) => holo.owner === player)) return false;
  return true;
}

function consumeItem(state: GameState, player: Player, kind: ItemKind) {
  const hand = [...(state.itemHands?.[player] ?? [])];
  const index = hand.indexOf(kind);
  if (index < 0) throw new Error("そのアイテムを持っていません");
  hand.splice(index, 1);
  return { ...(state.itemHands ?? {}), [player]: hand };
}

export function applyGravity(state: GameState, forceThroughObstacles = false): GameState {
  const mid = Math.floor(state.size / 2);
  const players = activePlayers(state);
  const occupied = (target: Pos) =>
    state.meteors.some((meteor) => samePos(meteor, target)) ||
    activeObstacles(state).some((obstacle) => samePos(obstacle, target)) ||
    activePulseDevices(state).some((device) => samePos(device, target)) ||
    players.some((player) => samePos(state.probes[player], target));
  const proposals = new Map<Player, Pos>();

  players.forEach((player, playerIndex) => {
    const start = state.probes[player];
    const vertical = { r: start.r + Math.sign(mid - start.r), c: start.c };
    const horizontal = { r: start.r, c: start.c + Math.sign(mid - start.c) };
    const verticalDistance = Math.abs(start.r - mid);
    const horizontalDistance = Math.abs(start.c - mid);
    const candidates = verticalDistance === horizontalDistance && playerIndex % 2 === 1
      ? [horizontal, vertical]
      : verticalDistance >= horizontalDistance
        ? [vertical, horizontal]
        : [horizontal, vertical];
    let target = candidates.find((candidate) =>
      !samePos(candidate, start) &&
      candidate.r >= 0 && candidate.c >= 0 && candidate.r < state.size && candidate.c < state.size &&
      !occupied(candidate));
    if (!target && forceThroughObstacles) {
      target = candidates.find((candidate) =>
        !samePos(candidate, start) &&
        candidate.r >= 0 && candidate.c >= 0 && candidate.r < state.size && candidate.c < state.size &&
        !players.some((other) => other !== player && samePos(state.probes[other], candidate)));
    }
    if (target) proposals.set(player, target);
  });

  const counts = new Map<string, number>();
  proposals.forEach((target) => {
    const key = `${target.r},${target.c}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const probes = { ...state.probes };
  const clearedTargets: Pos[] = [];
  proposals.forEach((target, player) => {
    if (counts.get(`${target.r},${target.c}`) === 1) {
      probes[player] = target;
      clearedTargets.push(target);
    }
  });
  if (!forceThroughObstacles) return { ...state, probes };
  const inventory: Inventory = Object.fromEntries(
    PLAYER_ORDER.map((player) => [player, { ...state.inventory[player] }]),
  ) as Inventory;
  const meteors = state.meteors.filter((meteor) => {
    if (!clearedTargets.some((target) => samePos(target, meteor))) return true;
    if (!meteor.consumable) inventory[meteor.owner][meteor.size] += 1;
    return false;
  });
  const obstacles = activeObstacles(state).flatMap((obstacle) => {
    if (!clearedTargets.some((target) => samePos(target, obstacle))) return [obstacle];
    if (obstacle.turns === -1) return [];
    const turns = Math.max(0, (obstacle.turns ?? 1) - players.length);
    return turns > 0 ? [{ ...obstacle, turns }] : [];
  });
  const pulseDevices = activePulseDevices(state).filter(
    (device) => !clearedTargets.some((target) => samePos(target, device)),
  );
  return { ...state, probes, inventory, meteors, obstacles, pulseDevices };
}

export function applyUseItem(state: GameState, kind: ItemKind): GameState {
  if (!canUseItem(state, kind)) throw new Error("このアイテムは現在使用できません");
  const player = state.turn;
  const itemHands = consumeItem(state, player, kind);
  const log = [...state.log, `${playerName(player)} used ${kind.toUpperCase()}`];
  if (kind === "shield") {
    const charges = gameBalance(state).shieldHitCapacity;
    return finishTurn({
      ...state,
      itemHands,
      shield: { ...state.shield, [player]: true },
      shieldCharges: {
        red: state.shieldCharges?.red ?? 0,
        blue: state.shieldCharges?.blue ?? 0,
        green: state.shieldCharges?.green ?? 0,
        yellow: state.shieldCharges?.yellow ?? 0,
        [player]: charges,
      },
      log,
    }, `${playerName(player)}：SHIELDを起動`);
  }
  if (kind === "booster") {
    return finishTurn({
      ...state,
      itemHands,
      boosterMoves: { ...state.boosterMoves, [player]: gameBalance(state).boosterUses },
      log,
    }, `${playerName(player)}：BOOSTERを起動`);
  }
  if (kind === "gravity") {
    const pulled = applyGravity({ ...state, itemHands, log });
    const advanced = finishTurn({
      ...pulled,
      log: [...pulled.log, "GRAVITY pulled all available probes one cell toward CORE"],
    }, `${playerName(player)} activated GRAVITY`);
    const core = { r: Math.floor(state.size / 2), c: Math.floor(state.size / 2) };
    const reached = activePlayers(state).filter((candidate) => samePos(pulled.probes[candidate], core));
    return resolveCoreArrivals(state, advanced, reached);
  }
  if (kind === "recall") {
    const inventory: Inventory = Object.fromEntries(
      PLAYER_ORDER.map((candidate) => [candidate, { ...state.inventory[candidate] }]),
    ) as Inventory;
    const recalled = state.meteors.filter((meteor) => meteor.owner === player && !meteor.consumable);
    recalled.forEach((meteor) => { inventory[player][meteor.size] += 1; });
    const holoCount = activeObstacles(state).filter((holo) => holo.owner === player).length;
    return finishTurn({
      ...state,
      itemHands,
      inventory,
      meteors: state.meteors.filter((meteor) => meteor.owner !== player || meteor.consumable),
      obstacles: activeObstacles(state).filter((holo) => holo.owner !== player),
      log: [...log, `${playerName(player)} recalled all meteors (${recalled.length}) and removed holos (${holoCount})`],
    }, `${playerName(player)}：自分のメテオを全回収`);
  }
  return {
    ...state,
    itemHands,
    phase: "switch",
    pendingSwitches: [{ kind, player }],
    switchResume: "finish",
    message: `${playerName(player)}：${kind.toUpperCase()}の対象を選択`,
    log,
  };
}

export function cancelPendingItem(state: GameState): GameState {
  const current = state.pendingSwitches?.[0];
  if (state.phase !== "switch" || !current) throw new Error("戻れるアイテム選択ではありません");
  return {
    ...state,
    phase: "place",
    itemHands: {
      ...(state.itemHands ?? {}),
      [current.player]: [...(state.itemHands?.[current.player] ?? []), current.kind],
    },
    pendingSwitches: [],
    switchResume: undefined,
    message: `${playerName(current.player)}：アイテムかメテオを選択`,
    log: state.log.slice(0, -1),
  };
}

export function applyHoloSwitch(state: GameState, target: Pos): GameState {
  const current = state.pendingSwitches?.[0];
  const mid = Math.floor(state.size / 2);
  if (state.phase !== "switch" || current?.kind !== "holo" ||
      target.r < 0 || target.c < 0 || target.r >= state.size || target.c >= state.size ||
      samePos(target, { r: mid, c: mid }) ||
      startCells(state).some((cell) => samePos(cell, target)) ||
      activePlayers(state).some((p) => samePos(state.probes[p], target)) ||
      state.meteors.some((m) => samePos(m, target)) || activeObstacles(state).some((m) => samePos(m, target)) ||
      activePulseDevices(state).some((device) => samePos(device, target))) throw new Error("お邪魔を置けないマスです");
  return finishSwitch({
    ...state,
    obstacles: [...activeObstacles(state), {
      ...target,
      owner: current.player,
      id: state.nextMeteorId,
      turns: gameBalance(state).holoUnlimited ? -1 : activePlayers(state).length * gameBalance(state).holoRounds,
    }],
    nextMeteorId: state.nextMeteorId + 1,
    log: [...state.log, `${playerName(current.player)} placed HOLO at (${target.r},${target.c})`],
  });
}

const ringOf = (state: GameState, pos: Pos) => {
  const mid = Math.floor(state.size / 2);
  return Math.max(Math.abs(pos.r - mid), Math.abs(pos.c - mid));
};
const rotatePos = (size: number, pos: Pos, clockwise: boolean): Pos =>
  clockwise ? { r: pos.c, c: size - 1 - pos.r } : { r: size - 1 - pos.c, c: pos.r };

export function applyOrbitSwitch(state: GameState, ring: number, clockwise: boolean): GameState {
  const current = state.pendingSwitches?.[0];
  const maxRing = Math.floor(state.size / 2);
  if (state.phase !== "switch" || current?.kind !== "orbit" || ring < 1 || ring > maxRing) {
    throw new Error("回転するリングを選んでください");
  }
  const rotate = <T extends Pos>(value: T): T => ringOf(state, value) === ring ? { ...value, ...rotatePos(state.size, value, clockwise) } : value;
  const probes = Object.fromEntries(PLAYER_ORDER.map((p) => [p, rotate(state.probes[p])])) as Record<Player, Pos>;
  const next = finishSwitch({
    ...state,
    probes,
    meteors: state.meteors.map(rotate),
    obstacles: activeObstacles(state).map(rotate),
    pulseDevices: (state.pulseDevices ?? []).map(rotate),
    log: [...state.log, `${playerName(current.player)} rotated ring ${ring} ${clockwise ? "CW" : "CCW"}`],
  });
  const mid = Math.floor(state.size / 2);
  const reached = activePlayers(next).filter((p) => samePos(next.probes[p], { r: mid, c: mid }));
  return resolveCoreArrivals(state, next, reached);
}

export function applyBlastSwitch(state: GameState, target: Pos): GameState {
  const current = state.pendingSwitches?.[0];
  if (state.phase !== "switch" || current?.kind !== "blast" || target.r < 0 || target.c < 0 ||
      target.r >= state.size || target.c >= state.size || activePlayers(state).some((p) => samePos(state.probes[p], target))) {
    throw new Error("BLASTを発動できないマスです");
  }
  const probes = { ...state.probes };
  const mid = Math.floor(state.size / 2);
  const radius = gameBalance(state).blastRadius;
  const shieldCharges = { ...(state.shieldCharges ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  for (const player of activePlayers(state)) {
    const start = probes[player];
    const range = distance(start, target);
    if (range < 1 || range > radius) continue;
    const rawSteps = radius - range + 1;
    const charges = shieldCharges[player] ?? 0;
    const blocked = charges > 0;
    if (blocked) shieldCharges[player] = Math.max(0, charges - rawSteps);
    const steps = blocked ? 0 : rawSteps;
    const dr = Math.sign(start.r - target.r);
    const dc = Math.sign(start.c - target.c);
    let position = { ...start };
    for (let index = 0; index < steps; index += 1) {
      const next = { r: position.r + dr, c: position.c + dc };
      if (next.r < 0 || next.c < 0 || next.r >= state.size || next.c >= state.size ||
          state.meteors.some((m) => samePos(m, next)) || activeObstacles(state).some((m) => samePos(m, next)) ||
          activePulseDevices(state).some((device) => samePos(device, next)) ||
          activePlayers(state).some((p) => p !== player && samePos(probes[p], next))) break;
      position = next;
    }
    probes[player] = position;
  }
  const obstacles: ObstacleMeteor[] = [];
  for (const obstacle of activeObstacles(state)) {
    const range = distance(obstacle, target);
    if (range < 1 || range > radius) {
      obstacles.push(obstacle);
      continue;
    }
    if (obstacle.turns === -1) {
      obstacles.push(obstacle);
      continue;
    }
    const durability = Math.max(0, (obstacle.turns ?? 1) - (radius - range + 1) * activePlayers(state).length);
    if (durability > 0) obstacles.push({ ...obstacle, turns: durability });
  }
  const next = finishSwitch({
    ...state,
    probes,
    obstacles,
    shieldCharges,
    shield: Object.fromEntries(PLAYER_ORDER.map((p) => [p, (shieldCharges[p] ?? 0) > 0])) as Record<Player, boolean>,
    log: [...state.log, `${playerName(current.player)} fired BLAST radius ${radius} at (${target.r},${target.c})`],
  });
  const reached = activePlayers(next).filter((p) => samePos(next.probes[p], { r: mid, c: mid }));
  return resolveCoreArrivals(state, next, reached);
}

export function applyPulseSwitch(state: GameState, target: Pos): GameState {
  const current = state.pendingSwitches?.[0];
  const mid = Math.floor(state.size / 2);
  if (state.phase !== "switch" || current?.kind !== "pulse" || target.r < 0 || target.c < 0 ||
      target.r >= state.size || target.c >= state.size || activePlayers(state).some((p) => samePos(state.probes[p], target)) ||
      samePos(target, { r: mid, c: mid }) || state.meteors.some((meteor) => samePos(meteor, target)) ||
      activeObstacles(state).some((obstacle) => samePos(obstacle, target)) ||
      (state.pulseDevices ?? []).some((device) => samePos(device, target))) {
    throw new Error("PULSE発生装置を置けないマスです");
  }
  const radius = gameBalance(state).pulseRadius;
  return finishSwitch({
    ...state,
    pulseDevices: [...(state.pulseDevices ?? []), {
      ...target,
      owner: current.player,
      id: state.nextPulseDeviceId ?? 1,
      turns: activePlayers(state).length * 2,
      createdTurnCount: state.turnCount,
    }],
    nextPulseDeviceId: (state.nextPulseDeviceId ?? 1) + 1,
    log: [...state.log, `${playerName(current.player)} placed and activated PULSE radius ${radius} at (${target.r},${target.c})`],
  });
}

export function applyRecallItem(state: GameState, meteorId?: number): GameState {
  void meteorId;
  const current = state.pendingSwitches?.[0];
  if (state.phase !== "switch" || current?.kind !== "recall") {
    throw new Error("リコールを使用できません");
  }
  const inventory: Inventory = Object.fromEntries(
    PLAYER_ORDER.map((player) => [player, { ...state.inventory[player] }]),
  ) as Inventory;
  const recalled = state.meteors.filter((meteor) => meteor.owner === current.player && !meteor.consumable);
  recalled.forEach((meteor) => { inventory[current.player][meteor.size] += 1; });
  return finishSwitch({
    ...state,
    inventory,
    meteors: state.meteors.filter((meteor) => meteor.owner !== current.player || meteor.consumable),
    obstacles: activeObstacles(state).filter((holo) => holo.owner !== current.player),
    log: [...state.log, `${playerName(current.player)} recalled all own meteors`],
  });
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
    activePulseDevices(state).some((device) => samePos(device, target)) ||
    (useCapsule
      ? chosenSize !== "small" || (state.capsuleMeteors?.[state.turn] ?? 0) <= 0
      : state.inventory[state.turn][chosenSize] <= 0)
  ) {
    throw new Error("そのマスにはメテオを配置できません");
  }

  const radius = chosenSize === "small" ? 1 : 2;
  const destroyed = state.meteors.filter((meteor) => distance(meteor, target) <= radius);
  const survivors = state.meteors.filter((meteor) => distance(meteor, target) > radius);
  const obstacles = activeObstacles(state).flatMap((obstacle) => {
    const range = distance(obstacle, target);
    if (range < 1 || range > radius || obstacle.turns === -1) return [obstacle];
    const damage = (chosenSize === "small" ? 1 : radius - range + 1) * activePlayers(state).length;
    const durability = Math.max(0, (obstacle.turns ?? 1) - damage);
    return durability > 0 ? [{ ...obstacle, turns: durability }] : [];
  });
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
  const blockingMeteors = [...state.meteors, ...obstacles, ...activePulseDevices(state), placed];
  const before = state.probes;
  const probes = Object.fromEntries(
    PLAYER_ORDER.map((player) => [player, { ...before[player] }]),
  ) as Record<Player, Pos>;
  const reached: Player[] = [];
  const shieldCharges = { ...(state.shieldCharges ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };

  activePlayers(state).forEach((player) => {
    const start = before[player];
    const d = distance(start, target);
    const rawSteps =
      chosenSize === "small" ? (d === 1 ? 1 : 0) : d === 1 ? 2 : d === 2 ? 1 : 0;
    if (!rawSteps) return;
    const charges = shieldCharges[player] ?? 0;
    const shieldBlocked = charges > 0;
    if (shieldBlocked) shieldCharges[player] = Math.max(0, charges - rawSteps);
    const steps = shieldBlocked ? 0 : rawSteps;
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
    obstacles,
    inventory,
    capsuleMeteors,
    shieldCharges,
    shield: Object.fromEntries(PLAYER_ORDER.map((p) => [p, (shieldCharges[p] ?? 0) > 0])) as Record<Player, boolean>,
    nextMeteorId: state.nextMeteorId + 1,
    log,
  };

  let next: GameState;
  if (reached.length) {
    const winner = coreWinner(state, reached) as Player | "draw";
    next = resolveCoreArrivals(state, {
      ...draft,
      phase: "over",
      winner,
      message:
        winner === "draw"
          ? "同時到達 — DRAW"
          : isTeamVariant(state.variant)
            ? `${playerName(winner)} / ${
                teamOf(winner) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"
              } TEAM WIN!`
            : `${playerName(winner)} WIN!`,
      log: [...log, winner === "draw" ? "両機が中央へ到達" : `${playerName(winner)}が爆風で中央へ到達`],
    }, reached);
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
    activePulseDevices(state).some((device) => samePos(device, target)) ||
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
