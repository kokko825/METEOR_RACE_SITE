import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";

export type Player = "red" | "blue" | "green" | "yellow";
export type MeteorSize = "small" | "large";
export type GameVariant = "classic" | "team" | "item" | "team-item";
export type ItemKind = "shield" | "booster" | "holo" | "orbit" | "pulse" | "recall";
export type Pos = { r: number; c: number };
export type Meteor = Pos & { owner: Player; size: MeteorSize; id: number; consumable?: boolean };
export type FieldItem = Pos & { kind: ItemKind; id: number };
export type ObstacleMeteor = Pos & { owner: Player; id: number; turns?: number };
export type Inventory = Record<Player, Record<MeteorSize, number>>;
export type Phase = "setup" | "move" | "place" | "switch" | "over";
export type PendingSwitch = { kind: "holo" | "orbit" | "pulse" | "recall"; player: Player };

export type GameState = {
  size: number;
  variant: GameVariant;
  players: Player[];
  turn: Player;
  phase: Phase;
  bonusMove: boolean;
  fieldItems: FieldItem[];
  pendingItemDrops?: { turns: number }[];
  shield: Record<Player, boolean>;
  shieldTurns?: Record<Player, number>;
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
  nextItemId: number;
  itemSeed: number;
  repetitions: Record<string, number>;
  pendingSwitches?: PendingSwitch[];
  switchResume?: "place" | "finish";
  setupPlacements?: Partial<Record<Player, FieldItem[]>>;
  setupPending?: Partial<Record<Player, ItemKind[]>>;
  setupReady?: Player[];
  setupRejected?: Partial<Record<Player, Pos[]>>;
  itemHands?: Partial<Record<Player, ItemKind[]>>;
  setupConfirmed?: Partial<Record<Player, boolean>>;
  balance?: BalanceConfig;
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
export const SWITCH_SETUP_CELLS_15: Pos[] = [
  { r: 5, c: 5 }, { r: 5, c: 9 }, { r: 9, c: 5 }, { r: 9, c: 9 },
  { r: 3, c: 7 }, { r: 7, c: 3 }, { r: 7, c: 11 }, { r: 11, c: 7 },
  { r: 3, c: 3 }, { r: 3, c: 11 }, { r: 11, c: 3 }, { r: 11, c: 11 },
  { r: 2, c: 2 }, { r: 2, c: 12 }, { r: 12, c: 2 }, { r: 12, c: 12 },
];
export const isSwitchSetupCell = (target: Pos) =>
  SWITCH_SETUP_CELLS_15.some((cell) => samePos(cell, target));
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

function nextItemRandom(seed: number) {
  const nextSeed = (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
  return { seed: nextSeed, value: nextSeed / 4294967296 };
}

function randomItemLayout(
  size: number,
  probes: Record<Player, Pos>,
  seed: number,
): { items: FieldItem[]; seed: number } {
  const mid = Math.floor(size / 2);
  const nearbyCells: Pos[] = [];
  const fallbackCells: Pos[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const p = { r, c };
      const nearestProbe = Math.min(...PLAYER_ORDER.map((player) => distance(p, probes[player])));
      if (
        samePos(p, { r: mid, c: mid }) ||
        PLAYER_ORDER.some((player) => samePos(p, probes[player]))
      ) continue;
      fallbackCells.push(p);
      if (nearestProbe >= 2 && nearestProbe <= 5) nearbyCells.push(p);
    }
  }
  const kinds: ItemKind[] = ["shield", "booster", "holo", "orbit", "pulse", "recall"];
  const items: FieldItem[] = [];
  let currentSeed = seed;
  kinds.forEach((kind, index) => {
    const cells = nearbyCells.length ? nearbyCells : fallbackCells;
    const random = nextItemRandom(currentSeed);
    currentSeed = random.seed;
    const cellIndex = Math.floor(random.value * cells.length);
    const [cell] = cells.splice(cellIndex, 1);
    const fallbackIndex = fallbackCells.findIndex((candidate) => samePos(candidate, cell));
    if (fallbackIndex >= 0) fallbackCells.splice(fallbackIndex, 1);
    items.push({ ...cell, kind, id: index + 1 });
  });
  return { items, seed: currentSeed };
}

function respawnItem(
  state: GameState,
  fieldItems: FieldItem[],
  probes: Record<Player, Pos>,
): { fieldItems: FieldItem[]; itemSeed: number; nextItemId: number } {
  const mid = Math.floor(state.size / 2);
  const nearbyCells: Pos[] = [];
  const fallbackCells: Pos[] = [];
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const p = { r, c };
      if (
        samePos(p, { r: mid, c: mid }) ||
        activePlayers(state).some((player) => samePos(p, probes[player])) ||
        state.meteors.some((meteor) => samePos(p, meteor)) ||
        fieldItems.some((item) => samePos(p, item))
      ) continue;
      fallbackCells.push(p);
      const nearestProbe = Math.min(
        ...activePlayers(state).map((player) => distance(p, probes[player])),
      );
      if (nearestProbe >= 1 && nearestProbe <= 4) nearbyCells.push(p);
    }
  }
  const cells = nearbyCells.length ? nearbyCells : fallbackCells;
  if (!cells.length) {
    return {
      fieldItems,
      itemSeed: state.itemSeed ?? 1,
      nextItemId: state.nextItemId ?? 1,
    };
  }
  const kindRandom = nextItemRandom(state.itemSeed ?? 1);
  const cellRandom = nextItemRandom(kindRandom.seed);
  const kinds: ItemKind[] = ["shield", "booster", "holo", "orbit", "pulse"];
  const kind = kinds[Math.floor(kindRandom.value * kinds.length)];
  const cell = cells[Math.floor(cellRandom.value * cells.length)];
  const nextItemId = state.nextItemId ?? 7;
  return {
    fieldItems: [...fieldItems, { ...cell, kind, id: nextItemId }],
    itemSeed: cellRandom.seed,
    nextItemId: nextItemId + 1,
  };
}

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
  balance: BalanceConfig = DEFAULT_BALANCE,
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
  const initialItemSeed = Math.floor(Math.random() * 0xffffffff) || 1;
  const itemLayout = { items: [] as FieldItem[], seed: initialItemSeed };
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
    fieldItems: itemLayout.items,
    pendingItemDrops: [],
    shield: { red: false, blue: false, green: false, yellow: false },
    shieldTurns: { red: 0, blue: 0, green: 0, yellow: 0 },
    boosterMoves: { red: 0, blue: 0, green: 0, yellow: 0 },
    capsuleMeteors: { red: 0, blue: 0, green: 0, yellow: 0 },
    turnCount: 0,
    probes,
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
      red: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
      blue: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
      green: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
      yellow: { small: balance.meteorSmallStart, large: balance.meteorLargeStart },
    },
    selected: "small",
    winner: null,
    message: `${playerName(first)}：探査機を1マス移動`,
    log: [`ゲーム開始 — ${playerName(first)}が先攻`],
    nextMeteorId: 1,
    nextItemId: 1,
    itemSeed: itemLayout.seed,
    repetitions: {},
    setupPlacements: {},
    setupPending: {},
    setupReady: [],
    setupRejected: {},
    itemHands: {},
    setupConfirmed: {},
  };
}

export function applySetupItem(state: GameState, kind: ItemKind, player = state.turn): GameState {
  if (!isItemVariant(state.variant) || state.phase !== "setup") {
    throw new Error("アイテム選択フェーズではありません");
  }
  const hand = state.itemHands?.[player] ?? [];
  const balance = gameBalance(state);
  if (hand.length >= balance.itemHandTotal) throw new Error(`持ち込めるアイテムは${balance.itemHandTotal}個までです`);
  if (hand.filter((entry) => entry === kind).length >= balance.itemSameMax) {
    throw new Error(`同じアイテムは${balance.itemSameMax}個までです`);
  }
  const nextHand = [...hand, kind];
  const itemHands = { ...(state.itemHands ?? {}), [player]: nextHand };
  const setupPlacements = {
    ...(state.setupPlacements ?? {}),
    [player]: nextHand.map((entry, index) => ({ r: -1, c: -1 - index, kind: entry, id: index + 1 })),
  };
  return {
    ...state,
    itemHands,
    setupPlacements,
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
    setupPlacements: { ...(state.setupPlacements ?? {}), [player]: [] },
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

export function applySetupSwitch(state: GameState, target: Pos, kind: ItemKind): GameState {
  if (!isItemVariant(state.variant) || state.phase !== "setup") {
    throw new Error("スイッチ配置フェーズではありません");
  }
  const placements = state.setupPlacements ?? {};
  const own = placements[state.turn] ?? [];
  const pending = state.setupPending?.[state.turn] ?? [];
  if (pending.length ? !pending.includes(kind) : own.length >= 3 || own.some((item) => item.kind === kind)) {
    throw new Error("異なる3種類のスイッチを選んでください");
  }
  const mid = Math.floor(state.size / 2);
  const occupied =
    target.r < 0 || target.c < 0 || target.r >= state.size || target.c >= state.size ||
    !isSwitchSetupCell(target) ||
    samePos(target, { r: mid, c: mid }) ||
    activePlayers(state).some((player) => samePos(target, state.probes[player])) ||
    own.some((item) => samePos(target, item)) ||
    (state.setupRejected?.[state.turn] ?? []).some((cell) => samePos(target, cell));
  if (occupied) throw new Error("そのマスにはスイッチを配置できません");

  const nextOwn = [...own, { ...target, kind, id: state.nextItemId }];
  const nextPending = pending.length ? pending.filter((entry, index) => entry !== kind || index !== pending.indexOf(kind)) : [];
  const playerComplete = pending.length ? nextPending.length === 0 : nextOwn.length === 3;
  const setupPlacements = { ...placements, [state.turn]: nextOwn };
  const setupPending = { ...(state.setupPending ?? {}), [state.turn]: nextPending };
  const setupReady = playerComplete
    ? [...new Set([...(state.setupReady ?? []), state.turn])]
    : (state.setupReady ?? []);
  const players = activePlayers(state);
  let nextTurn = players.find((player) => !setupReady.includes(player)) ?? state.turn;

  if (setupReady.length === players.length) {
    const all = players.flatMap((player) => setupPlacements[player] ?? []);
    const conflictKeys = new Set(all.filter((item, index) => all.some((other, otherIndex) => index !== otherIndex && samePos(item, other))).map((item) => `${item.r},${item.c}`));
    if (!conflictKeys.size) {
      return {
        ...state, setupPlacements, setupPending, setupReady, fieldItems: all,
        nextItemId: state.nextItemId + 1, turn: state.startingPlayer, phase: "move",
        message: `${playerName(state.startingPlayer)}：探査機を1マス移動`,
        log: [...state.log, `${kind.toUpperCase()}を秘密配置`, "全員の配置完了 — ゲームスタート"],
      };
    }
    const retryPending: Partial<Record<Player, ItemKind[]>> = {};
    const retryPlacements: Partial<Record<Player, FieldItem[]>> = {};
    const retryRejected: Partial<Record<Player, Pos[]>> = { ...(state.setupRejected ?? {}) };
    players.forEach((player) => {
      const entries = setupPlacements[player] ?? [];
      const conflicts = entries.filter((item) => conflictKeys.has(`${item.r},${item.c}`));
      retryPending[player] = conflicts.map((item) => item.kind);
      retryPlacements[player] = entries.filter((item) => !conflictKeys.has(`${item.r},${item.c}`));
      retryRejected[player] = [
        ...(retryRejected[player] ?? []),
        ...conflicts.filter((item) => !(retryRejected[player] ?? []).some((cell) => samePos(cell, item))),
      ];
    });
    const retryReady = players.filter((player) => !(retryPending[player]?.length));
    nextTurn = players.find((player) => !retryReady.includes(player)) ?? state.startingPlayer;
    return {
      ...state, setupPlacements: retryPlacements, setupPending: retryPending,
      setupReady: retryReady, setupRejected: retryRejected,
      nextItemId: state.nextItemId + 1, turn: nextTurn,
      message: `${playerName(nextTurn)}：重なったスイッチだけ再配置`,
      log: [...state.log, `${kind.toUpperCase()}を秘密配置`, "配置が重複 — 該当スイッチを再配置"],
    };
  }

  return {
    ...state, setupPlacements, setupPending, setupReady,
    nextItemId: state.nextItemId + 1, turn: playerComplete ? nextTurn : state.turn,
    message: playerComplete
      ? `${playerName(nextTurn)}：スイッチを3個配置`
      : pending.length
        ? `重なったスイッチをあと${nextPending.length}個再配置`
        : `スイッチをあと${3 - nextOwn.length}個配置`,
    log: [...state.log, `${kind.toUpperCase()}を秘密配置`],
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
        !activeObstacles(state).some((obstacle) => samePos(obstacle, target));
      if (!legal) break;
      const mid = Math.floor(state.size / 2);
      if (step > 1 && target.r === mid && target.c === mid) break;
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
    JSON.stringify(state.itemHands ?? {}),
    JSON.stringify(state.fieldItems ?? []),
    JSON.stringify(state.pendingItemDrops ?? []),
    state.itemSeed ?? 0,
    state.nextItemId ?? 0,
    JSON.stringify(state.shield ?? {}),
    JSON.stringify(state.boosterMoves ?? {}),
    JSON.stringify(state.capsuleMeteors ?? {}),
    state.bonusMove ? "bonus" : "normal",
  ].join("/");
}

function scheduleItemDrops(state: GameState, count: number) {
  let itemSeed = state.itemSeed ?? 1;
  const pendingItemDrops = [...(state.pendingItemDrops ?? [])];
  for (let index = 0; index < count; index += 1) {
    const random = nextItemRandom(itemSeed);
    itemSeed = random.seed;
    const balance = gameBalance(state);
    const span = balance.itemRespawnMaxTurns - balance.itemRespawnMinTurns + 1;
    pendingItemDrops.push({ turns: balance.itemRespawnMinTurns + Math.floor(random.value * span) });
  }
  return { pendingItemDrops, itemSeed };
}

function advanceItemDrops(draft: GameState): GameState {
  if (!isItemVariant(draft.variant) || !(draft.pendingItemDrops?.length)) return draft;
  const waiting: { turns: number }[] = [];
  const due: { turns: number }[] = [];
  draft.pendingItemDrops.forEach((drop) => {
    const next = { turns: drop.turns - 1 };
    if (next.turns < 0) due.push(next);
    else waiting.push(next);
  });
  let fieldItems = draft.fieldItems ?? [];
  let itemSeed = draft.itemSeed;
  let nextItemId = draft.nextItemId;
  due.forEach(() => {
    if (fieldItems.length >= gameBalance(draft).itemBoardMax) {
      waiting.push({ turns: 0 });
      return;
    }
    const beforeCount = fieldItems.length;
    const spawned = respawnItem(
      { ...draft, fieldItems, itemSeed, nextItemId },
      fieldItems,
      draft.probes,
    );
    fieldItems = spawned.fieldItems;
    itemSeed = spawned.itemSeed;
    nextItemId = spawned.nextItemId;
    if (fieldItems.length === beforeCount) waiting.push({ turns: 0 });
  });
  return { ...draft, fieldItems, itemSeed, nextItemId, pendingItemDrops: waiting };
}

export function finishTurn(draft: GameState, extraLog?: string): GameState {
  const shieldTurns = Object.fromEntries(
    PLAYER_ORDER.map((player) => [player, Math.max(0, (draft.shieldTurns?.[player] ?? 0) - 1)]),
  ) as Record<Player, number>;
  const obstacles = activeObstacles(draft)
    .map((obstacle) => obstacle.turns === -1
      ? obstacle
      : ({ ...obstacle, turns: Math.max(0, (obstacle.turns ?? 1) - 1) }))
    .filter((obstacle) => obstacle.turns === -1 || (obstacle.turns ?? 0) > 0);
  const turnDraft = advanceItemDrops({
    ...draft,
    shieldTurns,
    shield: Object.fromEntries(PLAYER_ORDER.map((p) => [p, shieldTurns[p] > 0])) as Record<Player, boolean>,
    obstacles,
  });
  const nextTurn = nextPlayer(turnDraft);
  const nextCount = turnDraft.turnCount + 1;
  const inventory = turnDraft.inventory;
  const turnLogs = extraLog ? [extraLog] : [];
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
  const start = state.probes[state.turn];
  const moveSteps = distance(start, target);
  const stepDelta = {
    r: Math.sign(target.r - start.r),
    c: Math.sign(target.c - start.c),
  };
  const traversed = Array.from({ length: moveSteps }, (_, index) => ({
    r: start.r + stepDelta.r * (index + 1),
    c: start.c + stepDelta.c * (index + 1),
  }));
  const pickedItems = traversed
    .map((cell) => state.fieldItems?.find((item) => samePos(item, cell)))
    .filter((item): item is FieldItem => Boolean(item));
  const picked = pickedItems[pickedItems.length - 1];
  const shield = { ...(state.shield ?? { red: false, blue: false, green: false, yellow: false }) };
  const shieldTurns = { ...(state.shieldTurns ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  const boosterMoves = { ...(state.boosterMoves ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  const capsuleMeteors = { ...(state.capsuleMeteors ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  const pickedBooster = pickedItems.some((item) => item.kind === "booster");
  pickedItems.forEach((item) => {
    if (item.kind === "shield") {
      shield[state.turn] = true;
      shieldTurns[state.turn] += activePlayers(state).length * 2 + 1;
    }
  });
  if (pickedBooster) boosterMoves[state.turn] += pickedItems.filter((item) => item.kind === "booster").length;
  else if ((boosterMoves[state.turn] ?? 0) > 0 && moveSteps > 1) boosterMoves[state.turn] -= 1;
  const pickedLabel =
    picked?.kind === "shield"
      ? "シールド"
      : picked?.kind === "booster"
        ? "ブースト"
        : picked?.kind === "pulse"
          ? "使い捨てメテオ"
          : null;
  const mid = Math.floor(state.size / 2);
  const probes = { ...state.probes, [state.turn]: target };
  const pickedIds = new Set(pickedItems.map((item) => item.id));
  const fieldItems = (state.fieldItems ?? []).filter((item) => !pickedIds.has(item.id));
  const scheduled =
    isItemVariant(state.variant)
      ? scheduleItemDrops(state, pickedItems.length)
      : { pendingItemDrops: state.pendingItemDrops ?? [], itemSeed: state.itemSeed };
  state = {
    ...state,
    fieldItems,
    pendingItemDrops: scheduled.pendingItemDrops,
    itemSeed: scheduled.itemSeed,
    shield,
    shieldTurns,
    boosterMoves,
    capsuleMeteors,
  };
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
        isTeamVariant(state.variant)
          ? `${playerName(state.turn)} / ${
              teamOf(state.turn) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"
            } TEAM WIN!`
          : `${playerName(state.turn)} WIN!`,
      log: [...log, `${playerName(state.turn)}が中央へ到達`],
    };
  }
  const pendingSwitches: PendingSwitch[] = pickedItems
    .filter((item): item is FieldItem & { kind: PendingSwitch["kind"] } =>
      item.kind === "holo" || item.kind === "orbit" || item.kind === "pulse")
    .map((item) => ({ kind: item.kind, player: state.turn }));
  if (pendingSwitches.length) {
    return {
      ...state,
      probes,
      phase: "switch",
      pendingSwitches,
      switchResume: state.turnCount === 0 ? "finish" : "place",
      message: `${playerName(state.turn)}: ${pendingSwitches[0].kind.toUpperCase()} SWITCH`,
      log,
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
    message: pickedLabel
      ? `${playerName(state.turn)}：${pickedLabel}を取得・メテオを配置`
      : `${playerName(state.turn)}：メテオを配置`,
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
  if (!(state.itemHands?.[player] ?? []).includes(kind)) return false;
  if (kind === "shield" && (state.shieldTurns?.[player] ?? 0) > 0) return false;
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

export function applyUseItem(state: GameState, kind: ItemKind): GameState {
  if (!canUseItem(state, kind)) throw new Error("このアイテムは現在使用できません");
  const player = state.turn;
  const itemHands = consumeItem(state, player, kind);
  const log = [...state.log, `${playerName(player)} used ${kind.toUpperCase()}`];
  if (kind === "shield") {
    const duration = activePlayers(state).length * gameBalance(state).shieldRounds;
    return finishTurn({
      ...state,
      itemHands,
      shield: { ...state.shield, [player]: true },
      shieldTurns: {
        red: state.shieldTurns?.red ?? 0,
        blue: state.shieldTurns?.blue ?? 0,
        green: state.shieldTurns?.green ?? 0,
        yellow: state.shieldTurns?.yellow ?? 0,
        [player]: duration,
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
      state.fieldItems.some((item) => samePos(item, target))) throw new Error("お邪魔を置けないマスです");
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
    fieldItems: state.fieldItems.map(rotate),
    log: [...state.log, `${playerName(current.player)} rotated ring ${ring} ${clockwise ? "CW" : "CCW"}`],
  });
  const mid = Math.floor(state.size / 2);
  const reached = activePlayers(next).filter((p) => samePos(next.probes[p], { r: mid, c: mid }));
  return reached.length ? { ...next, phase: "over", winner: coreWinner(state, reached), message: `${playerName(coreWinner(state, reached))} WIN!` } : next;
}

export function applyPulseSwitch(state: GameState, target: Pos): GameState {
  const current = state.pendingSwitches?.[0];
  if (state.phase !== "switch" || current?.kind !== "pulse" || target.r < 0 || target.c < 0 ||
      target.r >= state.size || target.c >= state.size || activePlayers(state).some((p) => samePos(state.probes[p], target))) {
    throw new Error("PULSEを発動できないマスです");
  }
  const probes = { ...state.probes };
  const mid = Math.floor(state.size / 2);
  const core = { r: mid, c: mid };
  const radius = gameBalance(state).pulseRadius;
  for (const player of activePlayers(state)) {
    const start = probes[player];
    const range = distance(start, target);
    if (range < 1 || range > radius) continue;
    const shieldReduction = (state.shieldTurns?.[player] ?? 0) > 0 ? 1 : 0;
    const steps = Math.max(0, radius - range + 1 - shieldReduction);
    const dr = Math.sign(start.r - target.r);
    const dc = Math.sign(start.c - target.c);
    let position = { ...start };
    for (let index = 0; index < steps; index += 1) {
      const next = { r: position.r + dr, c: position.c + dc };
      if (next.r < 0 || next.c < 0 || next.r >= state.size || next.c >= state.size ||
          state.meteors.some((m) => samePos(m, next)) || activeObstacles(state).some((m) => samePos(m, next)) ||
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
    const steps = radius - range + 1;
    const dr = Math.sign(obstacle.r - target.r);
    const dc = Math.sign(obstacle.c - target.c);
    let position = { r: obstacle.r, c: obstacle.c };
    for (let index = 0; index < steps; index += 1) {
      const destination = { r: position.r + dr, c: position.c + dc };
      const blocked = destination.r < 0 || destination.c < 0 || destination.r >= state.size || destination.c >= state.size ||
        samePos(destination, core) || state.meteors.some((meteor) => samePos(meteor, destination)) ||
        activePlayers(state).some((player) => samePos(probes[player], destination)) ||
        obstacles.some((other) => samePos(other, destination)) ||
        activeObstacles(state).some((other) => other.id !== obstacle.id && samePos(other, destination));
      if (blocked) break;
      position = destination;
    }
    obstacles.push({ ...obstacle, ...position });
  }
  const next = finishSwitch({ ...state, probes, obstacles, log: [...state.log, `${playerName(current.player)} fired PULSE radius ${radius} at (${target.r},${target.c})`] });
  const reached = activePlayers(next).filter((p) => samePos(next.probes[p], { r: mid, c: mid }));
  return reached.length ? { ...next, phase: "over", winner: coreWinner(state, reached), message: `${playerName(coreWinner(state, reached))} WIN!` } : next;
}

export function applyRecallItem(state: GameState, meteorId: number): GameState {
  const current = state.pendingSwitches?.[0];
  const meteor = state.meteors.find((entry) => entry.id === meteorId);
  const holo = activeObstacles(state).find((entry) => entry.id === meteorId);
  const target = meteor ?? holo;
  if (state.phase !== "switch" || current?.kind !== "recall" || !target || target.owner !== current.player || meteor?.consumable) {
    throw new Error("回収できる自分のメテオを選んでください");
  }
  const inventory: Inventory = Object.fromEntries(
    PLAYER_ORDER.map((player) => [player, { ...state.inventory[player] }]),
  ) as Inventory;
  if (meteor) inventory[current.player][meteor.size] += 1;
  const itemHands = holo ? {
    ...(state.itemHands ?? {}),
    [current.player]: [...(state.itemHands?.[current.player] ?? []), "holo" as ItemKind],
  } : state.itemHands;
  return finishSwitch({
    ...state,
    inventory,
    itemHands,
    meteors: state.meteors.filter((entry) => entry.id !== meteorId),
    obstacles: activeObstacles(state).filter((entry) => entry.id !== meteorId),
    log: [...state.log, `${playerName(current.player)} recalled ${holo ? "HOLO" : meteor!.size} meteor`],
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
    const rawSteps =
      chosenSize === "small" ? (d === 1 ? 1 : 0) : d === 1 ? 2 : d === 2 ? 1 : 0;
    const steps = Math.max(0, rawSteps - ((state.shieldTurns?.[player] ?? 0) > 0 ? 1 : 0));
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

  let fieldItems = state.fieldItems ?? [];
  let itemSeed = state.itemSeed;
  const nextItemId = state.nextItemId;
  let pendingItemDrops = [...(state.pendingItemDrops ?? [])];
  const boosterMoves = {
    ...(state.boosterMoves ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
  };
  const shieldAfterBlast = { ...(state.shield ?? { red: false, blue: false, green: false, yellow: false }) };
  const shieldTurnsAfterBlast = { ...(state.shieldTurns ?? { red: 0, blue: 0, green: 0, yellow: 0 }) };
  const blastSwitches: PendingSwitch[] = [];
  const pickupLogs: string[] = [];
  activePlayers(state).forEach((player) => {
    if (samePos(before[player], probes[player])) return;
    const picked = fieldItems.find((item) => samePos(item, probes[player]));
    if (!picked) return;
    fieldItems = fieldItems.filter((item) => item.id !== picked.id);
    if (picked.kind === "shield") {
      shieldAfterBlast[player] = true;
      shieldTurnsAfterBlast[player] += activePlayers(state).length * 2 + 1;
    }
    if (picked.kind === "booster") boosterMoves[player] += 1;
    if (picked.kind === "recall") pendingItemDrops.push({ turns: activePlayers(state).length });
    if (picked.kind === "holo" || picked.kind === "orbit" || picked.kind === "pulse") {
      blastSwitches.push({ kind: picked.kind, player });
    }
    const scheduled = scheduleItemDrops(
      { ...state, pendingItemDrops, itemSeed, nextItemId },
      1,
    );
    pendingItemDrops = scheduled.pendingItemDrops;
    itemSeed = scheduled.itemSeed;
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
    pendingItemDrops,
    itemSeed,
    nextItemId,
    meteors: [...survivors, placed],
    inventory,
    capsuleMeteors,
    boosterMoves,
    shield: shieldAfterBlast,
    shieldTurns: shieldTurnsAfterBlast,
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
          : isTeamVariant(state.variant)
            ? `${playerName(winner)} / ${
                teamOf(winner) === "sun" ? "RED + YELLOW" : "BLUE + GREEN"
              } TEAM WIN!`
            : `${playerName(winner)} WIN!`,
      log: [...log, winner === "draw" ? "両機が中央へ到達" : `${playerName(winner)}が爆風で中央へ到達`],
    };
  } else if (blastSwitches.length) {
    next = {
      ...draft,
      phase: "switch",
      pendingSwitches: blastSwitches,
      switchResume: "finish",
      message: `${playerName(blastSwitches[0].player)}: ${blastSwitches[0].kind.toUpperCase()} SWITCH`,
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
