"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PLAYER_ORDER,
  activeObstacles,
  activePlayers,
  applyObstacle,
  applyPass,
  boardToViewDelta,
  canPlaceObstacle,
  coreWinner,
  distance,
  finishTurn,
  initialGameState as initialState,
  legalMoves,
  meteorName,
  obstacleCount,
  orthogonallyAdjacent,
  playerName,
  samePos,
  viewToBoardPos,
  type GameState,
  type Inventory,
  type Meteor,
  type MeteorSize,
  type ObstacleMeteor,
  type Player,
  type Pos,
} from "./game-rules";

type Mode = "human" | "cpu" | "lab" | "online";
type BlastFx = {
  stage: "probe" | "recover";
  target: Pos;
  owner: Player;
  size: MeteorSize;
  destroyedIds: number[];
  pushed: Partial<Record<Player, { from: Pos; dr: number; dc: number }>>;
};

type OnlineEffect = Omit<BlastFx, "stage"> & { version: number };

function pushForPerspective(
  push: { from: Pos; dr: number; dc: number },
  perspectiveSlot: number,
) {
  const delta = boardToViewDelta({ r: push.dr, c: push.dc }, perspectiveSlot);
  return { ...push, dr: delta.r, dc: delta.c };
}

type OnlineRoom = {
  code: string;
  role: Player | null;
  status: "idle" | "waiting" | "playing" | "finished";
  version: number;
  maxPlayers: number;
  joinedPlayers: number;
  memberNames: string[];
  memberRoles: Array<Player | null>;
  error: string;
  pending: boolean;
  isHost: boolean;
};

function Game() {
  const [size, setSize] = useState(9);
  const [first, setFirst] = useState<Player>("red");
  const [game, setGame] = useState<GameState>(() => initialState(9, "red"));
  const [history, setHistory] = useState<GameState[]>([]);
  const [mode, setMode] = useState<Mode>("human");
  const [setupMode, setSetupMode] = useState<Mode>("human");
  const [needsNewGame, setNeedsNewGame] = useState(false);
  const [activeFirst, setActiveFirst] = useState<Player>("red");
  const [aiPlayerCount, setAiPlayerCount] = useState<2 | 3 | 4>(2);
  const [localAiCount, setLocalAiCount] = useState<0 | 1 | 2>(0);
  const [aiRunning, setAiRunning] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [obstaclesEnabled, setObstaclesEnabled] = useState(false);
  const [aiSpeed, setAiSpeed] = useState(420);
  const [blastFx, setBlastFx] = useState<BlastFx | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [nickname, setNickname] = useState("");
  const [onlinePlayerCount, setOnlinePlayerCount] = useState<1 | 2 | 3 | 4>(2);
  const [onlineAiCount, setOnlineAiCount] = useState<0 | 1 | 2 | 3>(0);
  const [online, setOnline] = useState<OnlineRoom>({
    code: "",
    role: null,
    status: "idle",
    version: 0,
    maxPlayers: 2,
    joinedPlayers: 0,
    memberNames: [],
    memberRoles: [],
    error: "",
    pending: false,
    isHost: false,
  });
  const [stats, setStats] = useState({
    games: 0,
    red: 0,
    blue: 0,
    green: 0,
    yellow: 0,
    draw: 0,
    turns: 0,
  });
  const recordedOutcome = useRef("");
  const playedOnlineEffect = useRef(0);
  const mid = Math.floor(game.size / 2);
  const moves = useMemo(() => legalMoves(game), [game]);
  const canControl =
    (mode === "online" || !needsNewGame) &&
    (mode !== "online" ||
      (online.status === "playing" &&
        (online.role === game.turn ||
          (online.isHost && (game.botPlayers ?? []).includes(game.turn))) &&
        !online.pending));
  const setupPlayerCount =
    setupMode === "cpu" || setupMode === "lab"
      ? aiPlayerCount
      : setupMode === "online"
        ? onlinePlayerCount + onlineAiCount
        : 2 + localAiCount;
  const competitiveNine = setupPlayerCount === 2 && size === 9;
  const setupPlayers = PLAYER_ORDER.slice(0, setupPlayerCount);
  const roomSettingsLocked =
    setupMode === "online" && Boolean(online.code) && !online.isHost;
  const settingPlayers =
    setupMode === "online" && online.code
      ? online.isHost
        ? PLAYER_ORDER.slice(0, onlinePlayerCount + onlineAiCount)
        : activePlayers(game)
      : setupPlayers;

  useEffect(() => {
    if (competitiveNine && obstaclesEnabled) setObstaclesEnabled(false);
  }, [competitiveNine, obstaclesEnabled]);

  const roomRequest = async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error ?? "オンライン操作に失敗しました"), { data });
    return data;
  };

  const createOnlineRoom = async () => {
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({
        action: "create",
        size,
        humanCount: onlinePlayerCount,
        aiCount: onlineAiCount,
        obstaclesEnabled,
        nickname,
      });
      setGame(data.state);
      setSize(data.state.size);
      setFirst(data.state.startingPlayer);
      setObstaclesEnabled(Boolean(data.state.obstaclesEnabled));
      setHistory([]);
      setOnline({
        code: data.code,
        role: data.role,
        status: data.status,
        version: data.version,
        maxPlayers: data.maxPlayers,
        joinedPlayers: data.joinedPlayers,
        memberNames: data.memberNames ?? [],
        memberRoles: data.memberRoles ?? [],
        error: "",
        pending: false,
        isHost: Boolean(data.isHost),
      });
      setOnlinePlayerCount(1);
      setOnlineAiCount(1);
      setNeedsNewGame(true);
      setRoomCodeInput(data.code);
    } catch (error) {
      setOnline((current) => ({
        ...current,
        pending: false,
        error: error instanceof Error ? error.message : "ルームを作成できませんでした",
      }));
    }
  };

  const joinOnlineRoom = async () => {
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({ action: "join", code, nickname });
      setGame(data.state);
      setSize(data.state.size);
      setFirst(data.state.startingPlayer);
      setObstaclesEnabled(Boolean(data.state.obstaclesEnabled));
      setHistory([]);
      setOnline({
        code: data.code,
        role: data.role,
        status: data.status,
        version: data.version,
        maxPlayers: data.maxPlayers,
        joinedPlayers: data.joinedPlayers,
        memberNames: data.memberNames ?? [],
        memberRoles: data.memberRoles ?? [],
        error: "",
        pending: false,
        isHost: Boolean(data.isHost),
      });
      setOnlinePlayerCount(
        activePlayers(data.state).filter(
          (player) => !(data.state.botPlayers ?? []).includes(player),
        ).length as 1 | 2 | 3 | 4,
      );
      setOnlineAiCount((data.state.botPlayers ?? []).length as 0 | 1 | 2 | 3);
      setRoomCodeInput(data.code);
    } catch (error) {
      setOnline((current) => ({
        ...current,
        pending: false,
        error: error instanceof Error ? error.message : "ルームに参加できませんでした",
      }));
    }
  };

  const submitOnlineAction = async (
    action: "move" | "meteor" | "obstacle" | "pass",
    target: Pos,
    meteorSize?: MeteorSize,
  ) => {
    if (mode !== "online" || !online.code) return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({
        action,
        code: online.code,
        version: online.version,
        target,
        meteorSize,
      });
      setOnline((current) => ({
        ...current,
        status: data.status,
        version: data.version,
        maxPlayers: data.maxPlayers,
        joinedPlayers: data.joinedPlayers,
        memberNames: data.memberNames ?? current.memberNames,
        memberRoles: data.memberRoles ?? current.memberRoles,
        pending: false,
        error: "",
      }));
    } catch (error) {
      const room = (error as Error & { data?: { room?: { state: GameState; version: number; status: OnlineRoom["status"] } } }).data?.room;
      if (room) setGame(room.state);
      setOnline((current) => ({
        ...current,
        version: room?.version ?? current.version,
        status: room?.status ?? current.status,
        pending: false,
        error: error instanceof Error ? error.message : "盤面を同期できませんでした",
      }));
    }
  };

  const leaveOnlineRoom = async () => {
    if (!online.code) return;
    const code = online.code;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      await roomRequest({ action: "leave", code });
    } finally {
      setOnline({
        code: "",
        role: null,
        status: "idle",
        version: 0,
        maxPlayers: 2,
        joinedPlayers: 0,
        memberNames: [],
        memberRoles: [],
        error: "",
        pending: false,
        isHost: false,
      });
      setRoomCodeInput("");
      setNeedsNewGame(true);
    }
  };

  const updateNickname = async () => {
    if (!online.code || !nickname.trim()) return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({
        action: "nickname",
        code: online.code,
        nickname,
      });
      setOnline((current) => ({
        ...current,
        version: data.version,
        memberNames: data.memberNames ?? current.memberNames,
        memberRoles: data.memberRoles ?? current.memberRoles,
        pending: false,
        error: "",
      }));
    } catch (error) {
      setOnline((current) => ({
        ...current,
        pending: false,
        error: error instanceof Error ? error.message : "ニックネームを変更できませんでした",
      }));
    }
  };

  const rematchOnlineRoom = async () => {
    if (!online.code || online.status !== "finished") return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({ action: "rematch", code: online.code });
      setGame(data.state);
      setHistory([]);
      setBlastFx(null);
      setIsAnimating(false);
      setOnline((current) => ({
        ...current,
        status: data.status,
        version: data.version,
        maxPlayers: data.maxPlayers,
        joinedPlayers: data.joinedPlayers,
        memberNames: data.memberNames ?? current.memberNames,
        memberRoles: data.memberRoles ?? current.memberRoles,
        pending: false,
        error: "",
      }));
    } catch (error) {
      setOnline((current) => ({
        ...current,
        pending: false,
        error: error instanceof Error ? error.message : "再戦を開始できませんでした",
      }));
    }
  };

  const commit = (next: GameState) => {
    setHistory((h) => [...h, game]);
    setGame(next);
  };

  const playBoom = () => {
    if (!soundEnabled) return;
    try {
      const AudioContextClass =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const duration = 0.72;
      const gain = context.createGain();
      const low = context.createOscillator();
      const noise = context.createBufferSource();
      const noiseFilter = context.createBiquadFilter();
      const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        const decay = Math.pow(1 - i / data.length, 2.8);
        data[i] = (Math.random() * 2 - 1) * decay;
      }
      noise.buffer = buffer;
      noiseFilter.type = "lowpass";
      noiseFilter.frequency.setValueAtTime(720, context.currentTime);
      noiseFilter.frequency.exponentialRampToValueAtTime(90, context.currentTime + duration);
      low.type = "sine";
      low.frequency.setValueAtTime(105, context.currentTime);
      low.frequency.exponentialRampToValueAtTime(34, context.currentTime + duration);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.7, context.currentTime + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      noise.connect(noiseFilter).connect(gain);
      low.connect(gain);
      gain.connect(context.destination);
      noise.start();
      low.start();
      noise.stop(context.currentTime + duration);
      low.stop(context.currentTime + duration);
      window.setTimeout(() => void context.close(), 900);
    } catch {
      // Some browsers block generated audio until the first user interaction.
    }
  };

  const moveProbe = (target: Pos) => {
    if (!canControl || game.phase !== "move" || !moves.some((p) => samePos(p, target))) return;
    if (mode === "online") void submitOnlineAction("move", target);
    const probes = { ...game.probes, [game.turn]: target };
    const log = [...game.log, `${playerName(game.turn)}が (${target.r},${target.c}) へ移動`];
    if (target.r === mid && target.c === mid) {
      commit({
        ...game,
        probes,
        phase: "over",
        winner: game.turn,
        message: `${playerName(game.turn)} WIN!`,
        log: [...log, `${playerName(game.turn)}が中央へ到達`],
      });
      return;
    }
    if (game.turnCount === 0) {
      commit(finishTurn({ ...game, probes, log }, "先攻の初手：メテオ配置なし"));
      return;
    }
    const hasMeteor =
      game.inventory[game.turn].small + game.inventory[game.turn].large > 0 ||
      canPlaceObstacle(game);
    if (!hasMeteor) {
      commit(finishTurn({ ...game, probes, log }, "手持ちメテオなし"));
      return;
    }
    commit({
      ...game,
      probes,
      phase: "place",
      message: `${playerName(game.turn)}：メテオを配置`,
      log,
    });
  };

  const skipBlockedMove = () => {
    if (game.phase !== "move" || moves.length > 0) return;
    const hasMeteor =
      game.inventory[game.turn].small + game.inventory[game.turn].large > 0 ||
      canPlaceObstacle(game);
    const log = [...game.log, `${playerName(game.turn)}は移動不能`];
    if (!hasMeteor) {
      commit(finishTurn({ ...game, log }, "手持ちメテオもないため手番終了"));
    } else {
      commit({
        ...game,
        phase: "place",
        message: `${playerName(game.turn)}：移動不能。メテオを配置`,
        log,
      });
    }
  };

  const placeMeteor = (target: Pos, sizeOverride?: MeteorSize) => {
    const chosenSize: MeteorSize =
      sizeOverride ?? (game.selected === "obstacle" ? "small" : game.selected);
    if (
      !canControl ||
      isAnimating ||
      game.phase !== "place" ||
      samePos(target, { r: mid, c: mid }) ||
      activePlayers(game).some((player) => samePos(target, game.probes[player])) ||
      game.meteors.some((m) => samePos(m, target)) ||
      activeObstacles(game).some((obstacle) => samePos(obstacle, target)) ||
      game.inventory[game.turn][chosenSize] <= 0
    )
      return;
    if (mode === "online") void submitOnlineAction("meteor", target, chosenSize);

    const blastRadius = chosenSize === "small" ? 1 : 2;
    const destroyed = game.meteors.filter((m) => distance(m, target) <= blastRadius);
    const survivors = game.meteors.filter((m) => distance(m, target) > blastRadius);
    const placed: Meteor = {
      ...target,
      owner: game.turn,
      size: chosenSize,
      id: game.nextMeteorId,
    };
    const inventory = Object.fromEntries(
      PLAYER_ORDER.map((player) => [player, { ...game.inventory[player] }]),
    ) as Inventory;
    inventory[game.turn][chosenSize] -= 1;
    destroyed.forEach((m) => {
      inventory[m.owner][m.size] += 1;
    });
    const remaining = [...survivors, placed];
    const blockingMeteors = [...game.meteors, ...activeObstacles(game), placed];
    const before = game.probes;
    const probes = Object.fromEntries(
      PLAYER_ORDER.map((player) => [player, { ...before[player] }]),
    ) as Record<Player, Pos>;
    const reached: Player[] = [];

    activePlayers(game).forEach((player) => {
      const start = before[player];
      const d = distance(start, target);
      const steps =
        chosenSize === "small"
          ? d === 1
            ? 1
            : 0
          : d === 1
            ? 2
            : d === 2
              ? 1
              : 0;
      if (!steps) return;
      const dr = Math.sign(start.r - target.r);
      const dc = Math.sign(start.c - target.c);
      let pos = { ...start };
      for (let i = 0; i < steps; i += 1) {
        const next = { r: pos.r + dr, c: pos.c + dc };
        const blocked =
          next.r < 0 ||
          next.c < 0 ||
          next.r >= game.size ||
          next.c >= game.size ||
          blockingMeteors.some((m) => samePos(m, next)) ||
          activePlayers(game).some(
            (candidate) => candidate !== player && samePos(next, before[candidate]),
          );
        if (blocked) break;
        pos = next;
        if (pos.r === mid && pos.c === mid) {
          reached.push(player);
          break;
        }
      }
      probes[player] = pos;
    });

    const placementLog = `${playerName(game.turn)}が${meteorName(chosenSize)}を (${target.r},${target.c}) に配置`;
    const destroyedLog = destroyed.length
      ? ` — メテオ${destroyed.length}個を破壊・返還`
      : "";
    const log = [...game.log, placementLog + destroyedLog];
    const draft: GameState = {
      ...game,
      probes,
      meteors: remaining,
      inventory,
      nextMeteorId: game.nextMeteorId + 1,
      log,
    };

    let resolved: GameState;
    if (reached.length) {
      const winner = coreWinner(game, reached) as Player | "draw";
      resolved = {
        ...draft,
        phase: "over",
        winner,
        message: winner === "draw" ? "同時到達 — DRAW" : `${playerName(winner)} WIN!`,
        log: [...log, winner === "draw" ? "両機が中央へ到達" : `${playerName(winner)}が爆風で中央へ到達`],
      };
    } else {
      resolved = finishTurn(draft);
    }

    setIsAnimating(true);
    setBlastFx({
      stage: "probe",
      target,
      owner: game.turn,
      size: chosenSize,
      destroyedIds: destroyed.map((meteor) => meteor.id),
      pushed: Object.fromEntries(
        activePlayers(game)
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
    });
    playBoom();
    const effectScale =
      mode !== "lab" ? 1 : aiSpeed <= 60 ? 0.08 : aiSpeed <= 240 ? 0.18 : 0.48;
    window.setTimeout(() => {
      setGame((current) => ({
        ...current,
        probes,
        message: destroyed.length
          ? `探査機移動完了 — メテオ${destroyed.length}個を回収`
          : "探査機移動完了",
      }));
      setBlastFx((effect) =>
        effect ? { ...effect, stage: "recover" } : effect,
      );
    }, Math.max(70, Math.round(1100 * effectScale)));
    window.setTimeout(() => {
      commit(resolved);
      setBlastFx(null);
      setIsAnimating(false);
    }, Math.max(140, Math.round(2020 * effectScale)));
  };

  const placeObstacle = (target: Pos) => {
    if (!canControl || isAnimating || game.phase !== "place") return;
    try {
      const next = applyObstacle(game, target);
      if (mode === "online") void submitOnlineAction("obstacle", target);
      commit(next);
    } catch {
      return;
    }
  };

  const passPlacement = () => {
    if (!canControl || game.phase !== "place" || !(game.passAvailable?.[game.turn] ?? true)) return;
    try {
      const next = applyPass(game);
      if (mode === "online") void submitOnlineAction("pass", { r: -1, c: -1 });
      commit(next);
    } catch {
      return;
    }
  };

  const handleCell = (r: number, c: number) => {
    if (isAnimating) return;
    if (game.phase === "move") moveProbe({ r, c });
    if (game.phase === "place") {
      if (game.selected === "obstacle") placeObstacle({ r, c });
      else placeMeteor({ r, c });
    }
  };

  const applyNewGameSettings = async () => {
    if (setupMode === "online" && online.code) {
      if (!online.isHost) return;
      setOnline((current) => ({ ...current, pending: true, error: "" }));
      try {
        const data = await roomRequest({
          action: "new_game",
          code: online.code,
          version: online.version,
          size,
          first,
          obstaclesEnabled:
            onlinePlayerCount + onlineAiCount === 2 && size === 9
              ? false
              : obstaclesEnabled,
          humanCount: onlinePlayerCount,
          aiCount: onlineAiCount,
        });
        setGame(data.state);
        setSize(data.state.size);
        setFirst(data.state.startingPlayer);
        setActiveFirst(data.state.startingPlayer);
        setBlastFx(null);
        setIsAnimating(false);
        setHistory([]);
        setMode("online");
        setNeedsNewGame(false);
        recordedOutcome.current = "";
        setOnline((current) => ({
          ...current,
          status: data.status,
          version: data.version,
          role: data.role,
          maxPlayers: data.maxPlayers,
          joinedPlayers: data.joinedPlayers,
          memberNames: data.memberNames ?? current.memberNames,
          memberRoles: data.memberRoles ?? current.memberRoles,
          isHost: Boolean(data.isHost),
          pending: false,
          error: "",
        }));
      } catch (error) {
        setOnline((current) => ({
          ...current,
          pending: false,
          error: error instanceof Error ? error.message : "ニューゲームを開始できませんでした",
        }));
      }
      return;
    }
    setBlastFx(null);
    setIsAnimating(false);
    setHistory([]);
    const playerCount =
      setupMode === "cpu" || setupMode === "lab"
        ? aiPlayerCount
        : setupMode === "human"
          ? 2 + localAiCount
          : onlinePlayerCount + onlineAiCount;
    const nextSize = playerCount > 2 && size === 9 ? 11 : size;
    const nextObstaclesEnabled =
      playerCount === 2 && nextSize === 9 ? false : obstaclesEnabled;
    const nextPlayers = PLAYER_ORDER.slice(0, playerCount);
    const nextFirst = nextPlayers.includes(first) ? first : nextPlayers[0];
    setSize(nextSize);
    setFirst(nextFirst);
    setActiveFirst(nextFirst);
    setMode(setupMode);
    setObstaclesEnabled(nextObstaclesEnabled);
    setNeedsNewGame(false);
    recordedOutcome.current = "";
    if (setupMode !== "online") {
      const layoutOffset =
        setupMode !== "cpu" && playerCount === 3 ? Math.floor(Math.random() * 4) : 0;
      const botPlayers =
        setupMode === "lab"
          ? nextPlayers
          : setupMode === "cpu"
            ? nextPlayers.slice(1)
            : nextPlayers.slice(2);
      setGame(
        initialState(
          nextSize,
          nextFirst,
          playerCount,
          nextObstaclesEnabled,
          layoutOffset,
          botPlayers,
        ),
      );
    }
  };

  const restartCurrentGame = () => {
    setBlastFx(null);
    setIsAnimating(false);
    setHistory([]);
    recordedOutcome.current = "";
    const players = activePlayers(game);
    const nextFirst =
      players.length === 2
        ? players[(players.indexOf(game.startingPlayer ?? activeFirst) + 1) % 2]
        : game.startingPlayer ?? activeFirst;
    const nextOffset = players.length === 3 ? ((game.layoutOffset ?? 0) + 1) % 4 : 0;
    setActiveFirst(nextFirst);
    setGame(
      initialState(
        game.size,
        nextFirst,
        players.length,
        Boolean(game.obstaclesEnabled),
        nextOffset,
        game.botPlayers ?? [],
      ),
    );
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setGame(previous);
    setHistory((h) => h.slice(0, -1));
  };

  const validBasePlacement = (r: number, c: number) =>
    canControl &&
    game.phase === "place" &&
    !(r === mid && c === mid) &&
    !activePlayers(game).some((player) => samePos({ r, c }, game.probes[player])) &&
    !game.meteors.some((m) => m.r === r && m.c === c) &&
    !activeObstacles(game).some((obstacle) => obstacle.r === r && obstacle.c === c);

  const validObstaclePlacement = (r: number, c: number) =>
    validBasePlacement(r, c) &&
    !activeObstacles(game).some((obstacle) =>
      orthogonallyAdjacent(obstacle, { r, c }),
    );

  const validPlacement = (r: number, c: number) =>
    game.selected === "obstacle"
      ? validObstaclePlacement(r, c)
      : validBasePlacement(r, c);

  const isAiTurn =
    mode === "lab" ||
    (mode === "cpu" && game.turn !== "red") ||
    ((mode === "human" || (mode === "online" && online.isHost)) &&
      (game.botPlayers ?? []).includes(game.turn));

  useEffect(() => {
    if (mode !== "online" || !online.code) return;
    const poll = window.setInterval(async () => {
      if (isAnimating || online.pending) return;
      try {
        const response = await fetch(`/api/rooms?code=${encodeURIComponent(online.code)}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "同期できませんでした");
        if (data.version > online.version) {
          const remoteEffect = data.state.onlineEffect as OnlineEffect | undefined;
          const shouldAnimate =
            remoteEffect &&
            remoteEffect.version === data.version &&
            remoteEffect.version > playedOnlineEffect.current;
          if (shouldAnimate) {
            playedOnlineEffect.current = remoteEffect.version;
            setIsAnimating(true);
            setBlastFx({ ...remoteEffect, stage: "probe" });
            playBoom();
            window.setTimeout(() => {
              setGame(data.state);
              setBlastFx((effect) =>
                effect ? { ...effect, stage: "recover" } : effect,
              );
            }, 1100);
            window.setTimeout(() => {
              setGame(data.state);
              setBlastFx(null);
              setIsAnimating(false);
            }, 2020);
          } else {
            setGame(data.state);
          }
          setSize(data.state.size);
          setFirst(data.state.startingPlayer);
          setObstaclesEnabled(Boolean(data.state.obstaclesEnabled));
          setHistory([]);
          setOnline((current) => ({
            ...current,
            status: data.status,
            version: data.version,
            role: data.role,
            maxPlayers: data.maxPlayers,
            joinedPlayers: data.joinedPlayers,
            memberNames: data.memberNames ?? current.memberNames,
            memberRoles: data.memberRoles ?? current.memberRoles,
            isHost: Boolean(data.isHost),
            error: "",
          }));
          if (online.isHost && data.joinedPlayers > online.joinedPlayers) {
            const nextHumans = Math.min(4, data.joinedPlayers) as 1 | 2 | 3 | 4;
            setOnlinePlayerCount(nextHumans);
            setOnlineAiCount((current) =>
              Math.min(current, 4 - nextHumans) as 0 | 1 | 2 | 3,
            );
            setNeedsNewGame(true);
          }
        }
      } catch (error) {
        setOnline((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "同期できませんでした",
        }));
      }
    }, 1200);
    return () => window.clearInterval(poll);
  }, [mode, online.code, online.version, online.pending, isAnimating]);

  useEffect(() => {
    if (mode !== "online" || !online.code) return;
    const code = online.code;
    const leaveOnClose = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      navigator.sendBeacon(
        "/api/rooms",
        new Blob([JSON.stringify({ action: "leave", code })], {
          type: "application/json",
        }),
      );
    };
    window.addEventListener("pagehide", leaveOnClose);
    return () => window.removeEventListener("pagehide", leaveOnClose);
  }, [mode, online.code]);

  useEffect(() => {
    if (game.phase !== "over" || !game.winner) return;
    const key = `${game.turnCount}-${game.log.length}-${game.winner}`;
    if (recordedOutcome.current === key) return;
    recordedOutcome.current = key;
    setStats((s) => ({
      games: s.games + 1,
      red: s.red + (game.winner === "red" ? 1 : 0),
      blue: s.blue + (game.winner === "blue" ? 1 : 0),
      green: s.green + (game.winner === "green" ? 1 : 0),
      yellow: s.yellow + (game.winner === "yellow" ? 1 : 0),
      draw: s.draw + (game.winner === "draw" ? 1 : 0),
      turns: s.turns + game.turnCount,
    }));
  }, [game.phase, game.winner, game.turnCount, game.log.length]);

  useEffect(() => {
    if (mode !== "lab" || !aiRunning || game.phase !== "over") return;
    const timer = window.setTimeout(() => {
      const players = activePlayers(game);
      const nextFirst = players[stats.games % players.length];
      setActiveFirst(nextFirst);
      setHistory([]);
      recordedOutcome.current = "";
      const nextOffset = players.length === 3 ? ((game.layoutOffset ?? 0) + 1) % 4 : 0;
      setGame(
        initialState(
          game.size,
          nextFirst,
          players.length,
          Boolean(game.obstaclesEnabled),
          nextOffset,
          game.botPlayers ?? players,
        ),
      );
    }, Math.max(120, aiSpeed));
    return () => window.clearTimeout(timer);
  }, [mode, aiRunning, game, aiSpeed, stats.games]);

  useEffect(() => {
    if (
      !isAiTurn ||
      !aiRunning ||
      !canControl ||
      (needsNewGame && mode !== "online") ||
      isAnimating ||
      game.phase === "over"
    ) return;
    const timer = window.setTimeout(() => {
      if (game.phase === "move") {
        if (!moves.length) {
          skipBlockedMove();
          return;
        }
        const center = { r: mid, c: mid };
        const scored = moves
          .map((p) => ({
            p,
            score:
              -2.8 * (Math.abs(p.r - center.r) + Math.abs(p.c - center.c)) +
              Math.random() * 2.4,
          }))
          .sort((a, b) => b.score - a.score);
        moveProbe(scored[0].p);
        return;
      }

      let bestObstacle: { p: Pos; score: number } | null = null;
      if (canPlaceObstacle(game)) {
        const obstacleTargets: Pos[] = [];
        for (let r = 0; r < game.size; r += 1) {
          for (let c = 0; c < game.size; c += 1) {
            if (validObstaclePlacement(r, c)) obstacleTargets.push({ r, c });
          }
        }
        const ownProbe = game.probes[game.turn];
        const scoreObstacle = (target: Pos) => {
          const coreDistance = Math.abs(target.r - mid) + Math.abs(target.c - mid);
          let score = 1.5 - coreDistance * 0.35 + Math.random() * 1.5;
          if (distance(target, ownProbe) === 1) score += 3;
          game.meteors.forEach((meteor) => {
            if (meteor.owner === game.turn || distance(meteor, ownProbe) > 2) return;
            const dr = Math.sign(ownProbe.r - meteor.r);
            const dc = Math.sign(ownProbe.c - meteor.c);
            if (samePos(target, { r: ownProbe.r + dr, c: ownProbe.c + dc })) score += 34;
            if (samePos(target, { r: ownProbe.r + dr * 2, c: ownProbe.c + dc * 2 })) score += 20;
          });
          activePlayers(game)
            .filter((player) => player !== game.turn)
            .forEach((player) => {
              const probe = game.probes[player];
              if (distance(target, probe) === 1) score += 3;
              if (
                Math.abs(probe.r - mid) > Math.abs(probe.c - mid)
                  ? target.c === mid
                  : target.r === mid
              ) score += 1.5;
            });
          return score;
        };
        bestObstacle = obstacleTargets
          .map((p) => ({ p, score: scoreObstacle(p) }))
          .sort((a, b) => b.score - a.score)[0] ?? null;
      }

      const options: { p: Pos; size: MeteorSize; score: number }[] = [];
      const center = { r: mid, c: mid };
      const me = game.turn;
      const opponents = activePlayers(game).filter((player) => player !== me);
      const coreDistance = (p: Pos) =>
        Math.abs(p.r - center.r) + Math.abs(p.c - center.c);
      (["small", "large"] as MeteorSize[]).forEach((meteorSize) => {
        if (!game.inventory[me][meteorSize]) return;
        for (let r = 0; r < game.size; r += 1) {
          for (let c = 0; c < game.size; c += 1) {
            if (!validPlacement(r, c)) continue;
            const p = { r, c };
            const radius = meteorSize === "small" ? 1 : 2;
            let score = Math.random() * 3;
            game.meteors.forEach((m) => {
              if (distance(m, p) <= radius) score += m.owner === me ? 6 : -4;
            });
            const projectedByPlayer: Partial<Record<Player, Pos>> = {};
            ([
              [me, 1],
              ...opponents.map((player) => [player, -1] as [Player, number]),
            ] as [Player, number][]).forEach(([player, polarity]) => {
              const start = game.probes[player];
              const d = distance(start, p);
              const steps =
                meteorSize === "small" ? (d === 1 ? 1 : 0) : d === 1 ? 2 : d === 2 ? 1 : 0;
              if (!steps) return;
              const projected = {
                r: Math.max(0, Math.min(game.size - 1, start.r + Math.sign(start.r - p.r) * steps)),
                c: Math.max(0, Math.min(game.size - 1, start.c + Math.sign(start.c - p.c) * steps)),
              };
              projectedByPlayer[player] = projected;
              const gain = coreDistance(start) - coreDistance(projected);
              score += polarity * gain * 9;
              if (samePos(projected, center)) score += polarity * 1000;
            });
            const ownProjected = projectedByPlayer[me] ?? game.probes[me];
            const opponentsAtCore = opponents.filter((player) =>
              samePos(projectedByPlayer[player] ?? game.probes[player], center),
            ).length;
            if (samePos(ownProjected, center) && opponentsAtCore) {
              score += opponentsAtCore * 1000;
            }

            const futureMeteors = [
              ...game.meteors.filter((meteor) => distance(meteor, p) > radius),
              { ...p, owner: me, size: meteorSize, id: game.nextMeteorId },
            ];
            opponents.forEach((player) => {
              const start = projectedByPlayer[player] ?? game.probes[player];
              const futureMoves = [
                { r: start.r - 1, c: start.c },
                { r: start.r + 1, c: start.c },
                { r: start.r, c: start.c - 1 },
                { r: start.r, c: start.c + 1 },
              ].filter(
                (candidate) =>
                  candidate.r >= 0 &&
                  candidate.c >= 0 &&
                  candidate.r < game.size &&
                  candidate.c < game.size &&
                  !futureMeteors.some((meteor) => samePos(meteor, candidate)) &&
                  !activeObstacles(game).some((obstacle) => samePos(obstacle, candidate)) &&
                  !activePlayers(game).some(
                    (other) =>
                      other !== player &&
                      samePos(
                        projectedByPlayer[other] ?? game.probes[other],
                        candidate,
                      ),
                  ),
              );
              if (!futureMoves.length) return;
              const bestFutureDistance = Math.min(...futureMoves.map(coreDistance));
              const futureGain = coreDistance(start) - bestFutureDistance;
              score -= futureGain * 2.5;
              if (bestFutureDistance === 0) score -= 120;
            });
            options.push({ p, size: meteorSize, score });
          }
        }
      });
      options.sort((a, b) => b.score - a.score);
      if (
        bestObstacle &&
        bestObstacle.score >= 6 &&
        (!options[0] || bestObstacle.score > options[0].score)
      ) {
        placeObstacle(bestObstacle.p);
      } else if (
        (game.passAvailable?.[game.turn] ?? true) &&
        (!options[0] || options[0].score < 2.5)
      ) {
        passPlacement();
      } else if (options[0]) {
        placeMeteor(options[0].p, options[0].size);
      } else {
        commit(finishTurn(game, "配置可能なマスがないため手番終了"));
      }
    }, aiSpeed);
    return () => window.clearTimeout(timer);
  }, [
    game,
    mode,
    aiRunning,
    aiSpeed,
    isAiTurn,
    canControl,
    needsNewGame,
    isAnimating,
    moves,
    mid,
  ]);

  const winRates = Object.fromEntries(
    PLAYER_ORDER.map((player) => [
      player,
      stats.games ? Math.round((stats[player] / stats.games) * 100) : 0,
    ]),
  ) as Record<Player, number>;
  const averageTurns = stats.games ? (stats.turns / stats.games).toFixed(1) : "—";
  const labLeaders = activePlayers(game)
    .map((player) => ({ player, rate: winRates[player] }))
    .sort((a, b) => b.rate - a.rate);
  const strategicRead =
    stats.games < 10
      ? "10戦以上で傾向を判定します"
      : labLeaders.length < 2 || labLeaders[0].rate - labLeaders[1].rate <= 10
        ? "現時点では大きな陣営差なし"
        : `${playerName(labLeaders[0].player)}側優勢。先攻・初期方向の影響を要観察`;
  const perspectiveSlot =
    mode === "online" && online.role
      ? (PLAYER_ORDER.indexOf(online.role) + (game.layoutOffset ?? 0)) % 4
      : 0;
  const turnMemberIndex =
    mode === "online" ? online.memberRoles.indexOf(game.turn) : -1;
  const turnDisplayName =
    turnMemberIndex >= 0
      ? online.memberNames[turnMemberIndex]
      : (game.botPlayers ?? []).includes(game.turn)
        ? `${playerName(game.turn)} AI`
        : playerName(game.turn);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <div>
            <h1>METEOR RACE</h1>
            <p>BLAST YOUR WAY TO THE CORE</p>
          </div>
        </div>
        <div className="round">ROUND {Math.floor(game.turnCount / 2) + 1}</div>
      </header>

      <section className="game-layout">
        <aside className={`player-card red-card ${game.turn === "red" && game.phase !== "over" ? "active" : ""}`}>
          <span className="eyebrow">PLAYER 01</span>
          <h2>RED</h2>
          <ProbeIcon color="red" />
          <InventoryPanel inventory={game.inventory.red} color="red" />
        </aside>

        <section className="arena">
          <div className={`turn-callout ${game.turn}`} aria-live="polite">
            <span>CURRENT TURN</span>
            <b>{turnDisplayName}</b>
            <i>{playerName(game.turn)}</i>
          </div>
          <div className="status" aria-live="polite">
            <span className={`status-dot ${game.turn}`} />
            {game.message}
          </div>
          <div
            className={`board turn-${game.turn}`}
            data-perspective={perspectiveSlot}
            style={{
              gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${game.size}, minmax(0, 1fr))`,
            }}
            aria-label={`${game.size}×${game.size} ゲーム盤`}
          >
            {Array.from({ length: game.size * game.size }, (_, index) => {
              const viewR = Math.floor(index / game.size);
              const viewC = index % game.size;
              const { r, c } = viewToBoardPos(
                { r: viewR, c: viewC },
                game.size,
                perspectiveSlot,
              );
              const pos = { r, c };
              const probe =
                activePlayers(game).find((player) => samePos(pos, game.probes[player])) ?? null;
              const meteor = game.meteors.find((m) => samePos(m, pos));
              const obstacle = activeObstacles(game).find((item) => samePos(item, pos));
              const legal =
                canControl &&
                game.phase === "move" &&
                moves.some((m) => samePos(m, pos));
              const placeable = validPlacement(r, c);
              return (
                <button
                  key={`${r}-${c}`}
                  className={[
                    "cell",
                    r === mid && c === mid ? "core" : "",
                    legal ? "legal" : "",
                    placeable ? "placeable" : "",
                  ].join(" ")}
                  onClick={() => handleCell(r, c)}
                  disabled={game.phase === "over" || (!legal && !placeable)}
                  aria-label={`座標 ${r},${c}${probe ? ` ${playerName(probe)}探査機` : ""}${meteor ? ` ${meteorName(meteor.size)}` : ""}${obstacle ? " お邪魔メテオ" : ""}`}
                >
                  {r === mid && c === mid && <span className="core-ring"><b>CORE</b></span>}
                  {blastFx && samePos(pos, blastFx.target) && (
                    <>
                      {blastFx.stage === "probe" && (
                        <>
                          <span className={`impact-flash ${blastFx.owner}`} />
                          <span className={`shockwave ${blastFx.size}`} />
                        </>
                      )}
                      <MeteorIcon
                        meteor={{ ...blastFx.target, owner: blastFx.owner, size: blastFx.size, id: -1 }}
                        falling={blastFx.stage === "probe"}
                      />
                    </>
                  )}
                  {meteor && (
                    <MeteorIcon
                      meteor={meteor}
                      destroyed={
                        blastFx?.stage === "recover" &&
                        blastFx.destroyedIds.includes(meteor.id)
                      }
                    />
                  )}
                  {obstacle && <ObstacleIcon obstacle={obstacle} />}
                  {probe && (
                    <ProbeToken
                      player={probe}
                      rotation={
                        viewR === mid && viewC === mid
                          ? 0
                          : Math.atan2(mid - viewC, viewR - mid) * (180 / Math.PI)
                      }
                      push={
                        blastFx?.pushed[probe] &&
                        samePos(pos, blastFx.pushed[probe].from)
                          ? pushForPerspective(
                              blastFx.pushed[probe],
                              perspectiveSlot,
                            )
                          : undefined
                      }
                    />
                  )}
                  {legal && <span className="move-pip" />}
                </button>
              );
            })}
          </div>

          <div className="action-panel">
            {game.phase === "place" && (
              <>
                <span className="action-label">配置するメテオ</span>
                <button
                  className={`meteor-choice ${game.selected === "small" ? "selected" : ""}`}
                  disabled={game.inventory[game.turn].small === 0}
                  onClick={() => setGame((g) => ({ ...g, selected: "small" }))}
                >
                  ● 小 <b>{game.inventory[game.turn].small}</b>
                </button>
                <button
                  className={`meteor-choice large ${game.selected === "large" ? "selected" : ""}`}
                  disabled={game.inventory[game.turn].large === 0}
                  onClick={() => setGame((g) => ({ ...g, selected: "large" }))}
                >
                  ✦ 大 <b>{game.inventory[game.turn].large}</b>
                </button>
                {game.obstaclesEnabled && (
                  <button
                    className={`meteor-choice obstacle-choice ${game.selected === "obstacle" ? "selected" : ""}`}
                    disabled={!canPlaceObstacle(game)}
                    onClick={() => setGame((g) => ({ ...g, selected: "obstacle" }))}
                  >
                    ◆ お邪魔 <b>{obstacleCount(game)}</b>
                  </button>
                )}
                <button
                  className="meteor-choice pass-choice"
                  disabled={!(game.passAvailable?.[game.turn] ?? true)}
                  onClick={passPlacement}
                >
                  配置しない <b>{game.passAvailable?.[game.turn] ?? true ? 1 : 0}</b>
                </button>
              </>
            )}
            {game.phase === "move" && moves.length === 0 && (
              <button className="primary-action" onClick={skipBlockedMove}>
                移動不能 — メテオ配置へ
              </button>
            )}
            {game.phase === "over" && (
              <button
                className="primary-action"
                onClick={mode === "online" ? rematchOnlineRoom : restartCurrentGame}
                disabled={mode === "online" && online.pending}
              >
                同じメンバーでもう一度
              </button>
            )}
          </div>
        </section>

        <aside className={`player-card blue-card ${game.turn === "blue" && game.phase !== "over" ? "active" : ""}`}>
          <span className="eyebrow">PLAYER 02</span>
          <h2>BLUE</h2>
          <ProbeIcon color="blue" />
          <InventoryPanel inventory={game.inventory.blue} color="blue" />
        </aside>
      </section>
      {activePlayers(game).length > 2 && (
        <section className="extra-players" aria-label="追加プレイヤー">
          {activePlayers(game).slice(2).map((player, index) => (
            <aside
              key={player}
              className={`player-card compact ${player}-card ${
                game.turn === player && game.phase !== "over" ? "active" : ""
              }`}
            >
              <span className="eyebrow">PLAYER {String(index + 3).padStart(2, "0")}</span>
              <h2>{playerName(player)}</h2>
              <ProbeIcon color={player} />
              <InventoryPanel inventory={game.inventory[player]} color={player} />
            </aside>
          ))}
        </section>
      )}

      <section className="control-strip">
        <div className="settings">
          <label>
            MODE
            <select
              value={setupMode}
              onChange={(e) => {
                const nextMode = e.target.value as Mode;
                const nextCount =
                  nextMode === "cpu" || nextMode === "lab"
                    ? aiPlayerCount
                    : nextMode === "online"
                      ? onlinePlayerCount + onlineAiCount
                      : 2 + localAiCount;
                setSetupMode(nextMode);
                if (!PLAYER_ORDER.slice(0, nextCount).includes(first)) setFirst("red");
                if (nextCount > 2 && size === 9) setSize(11);
                setNeedsNewGame(true);
              }}
            >
              <option value="human">2 PLAYERS</option>
              <option value="cpu">VS AI</option>
              <option value="lab">AI vs AI LAB</option>
              <option value="online">ONLINE ROOM</option>
            </select>
          </label>
          {(setupMode === "cpu" || setupMode === "lab") && (
            <div className="vs-ai-count" aria-label="AI対戦の人数">
              <span>{setupMode === "lab" ? "AI LAB人数" : "VS AI人数"}</span>
              {([2, 3, 4] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  className={aiPlayerCount === count ? "selected" : ""}
                  aria-pressed={aiPlayerCount === count}
                  onClick={() => {
                    setAiPlayerCount(count);
                    if (count > 2 && size === 9) setSize(11);
                    if (!PLAYER_ORDER.slice(0, count).includes(first)) setFirst("red");
                    setNeedsNewGame(true);
                  }}
                >
                  {count}人
                </button>
              ))}
            </div>
          )}
          {setupMode === "human" && (
            <div className="vs-ai-count" aria-label="追加AI人数">
              <span>追加AI</span>
              {([0, 1, 2] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  className={localAiCount === count ? "selected" : ""}
                  onClick={() => {
                    setLocalAiCount(count);
                    if (count > 0 && size === 9) setSize(11);
                    setNeedsNewGame(true);
                  }}
                >
                  {count}体
                </button>
              ))}
            </div>
          )}
          <label>
            BOARD
            <select
              value={size}
              disabled={roomSettingsLocked}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setNeedsNewGame(true);
              }}
            >
              <option value={9} disabled={setupPlayerCount > 2}>9 × 9</option>
              <option value={11}>11 × 11</option>
            </select>
          </label>
          <label>
            FIRST
            <select
              value={first}
              disabled={roomSettingsLocked}
              onChange={(e) => {
                setFirst(e.target.value as Player);
                setNeedsNewGame(true);
              }}
            >
              {settingPlayers.map((player) => (
                <option key={player} value={player}>{playerName(player)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={roomSettingsLocked || competitiveNine}
            className={
              !competitiveNine && obstaclesEnabled
                ? "setting-toggle selected"
                : "setting-toggle"
            }
            aria-pressed={!competitiveNine && obstaclesEnabled}
            onClick={() => {
              setObstaclesEnabled((value) => !value);
              setNeedsNewGame(true);
            }}
          >
            お邪魔 {obstaclesEnabled ? "あり" : "なし"}
          </button>
          <button
            type="button"
            className={soundEnabled ? "setting-toggle selected" : "setting-toggle"}
            aria-pressed={soundEnabled}
            onClick={() => setSoundEnabled((value) => !value)}
          >
            効果音 {soundEnabled ? "ON" : "OFF"}
          </button>
          <button
            className={`new-game-button ${needsNewGame ? "attention" : ""}`}
            onClick={applyNewGameSettings}
            disabled={roomSettingsLocked || online.pending}
          >
            NEW GAME
            <small>
              {roomSettingsLocked
                ? "ROOM LEADER ONLY"
                : needsNewGame
                  ? "設定を適用して開始"
                  : "現在の設定で再開始"}
            </small>
          </button>
          <button onClick={undo} disabled={!history.length || mode === "online" || needsNewGame}>UNDO</button>
          {mode === "lab" && (
            <>
              <button onClick={() => setAiRunning((v) => !v)}>{aiRunning ? "PAUSE AI" : "RUN AI"}</button>
              <label>
                SPEED
                <select value={aiSpeed} onChange={(e) => setAiSpeed(Number(e.target.value))}>
                  <option value={700}>WATCH</option>
                  <option value={240}>FAST</option>
                  <option value={60}>TURBO</option>
                </select>
              </label>
            </>
          )}
        </div>
        {needsNewGame && (
          <div className="settings-pending" role="status">
            設定はまだ対局に反映されていません。「NEW GAME」を押すと新しい設定で開始します。
          </div>
        )}
        {mode === "online" && (
          <section className="online-panel" aria-label="オンライン対戦">
            <div className="online-copy">
              <span>ONLINE MATCH</span>
              <strong>
                {online.code
                  ? online.status === "waiting"
                    ? `参加待ち ${online.joinedPlayers}/${online.maxPlayers}`
                    : `${online.role ? playerName(online.role) : "観戦"}として参加中`
                  : "ルームを作るか、6文字のコードで参加"}
              </strong>
            </div>
            {online.code && online.isHost && (
              <div className="online-count" aria-label="オンライン対戦の人数">
                <span>次のゲームに参加する人間</span>
                <div className="player-count-buttons">
                  {([1, 2, 3, 4] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={onlinePlayerCount === count ? "selected" : ""}
                      aria-pressed={onlinePlayerCount === count}
                      disabled={count > online.joinedPlayers || count + onlineAiCount > 4}
                      onClick={() => {
                        setOnlinePlayerCount(count);
                        if (count + onlineAiCount > 2 && size === 9) setSize(11);
                        setNeedsNewGame(true);
                      }}
                    >
                      <b>{count}人</b>
                      <small>{count <= online.joinedPlayers ? "参加" : "未入室"}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {online.code && online.isHost && (
              <div className="online-count" aria-label="オンライン追加AI人数">
                <span>次のゲームに追加するAI</span>
                <div className="player-count-buttons">
                  {([0, 1, 2, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      disabled={
                        onlinePlayerCount + count > 4 ||
                        (onlinePlayerCount === 1 && count === 0)
                      }
                      className={onlineAiCount === count ? "selected" : ""}
                      onClick={() => {
                        setOnlineAiCount(count);
                        if (onlinePlayerCount + count > 2 && size === 9) setSize(11);
                        setNeedsNewGame(true);
                      }}
                    >
                      <b>{count}体</b>
                      <small>AI</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value.slice(0, 16))}
              placeholder="NICKNAME"
              aria-label="ニックネーム"
              maxLength={16}
            />
            {online.code && (
              <button
                type="button"
                onClick={() => void updateNickname()}
                disabled={online.pending || !nickname.trim()}
              >
                名前を変更
              </button>
            )}
            <input
              value={roomCodeInput}
              onChange={(event) =>
                setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))
              }
              placeholder="ROOM CODE"
              aria-label="ルームコード"
              maxLength={6}
            />
            <button onClick={createOnlineRoom} disabled={online.pending}>CREATE ROOM</button>
            <button onClick={joinOnlineRoom} disabled={online.pending || !roomCodeInput}>JOIN ROOM</button>
            {online.code && !online.role && (
              <span className="spectator-badge">SPECTATING</span>
            )}
            {online.status === "finished" && online.role && (
              <button onClick={rematchOnlineRoom} disabled={online.pending}>
                SAME ROOM REMATCH
              </button>
            )}
            {online.code && <code>{online.code}</code>}
            {online.code && (
              <div className="room-members" aria-label="ルームメンバー">
                <span>MEMBERS</span>
                {online.memberNames.map((name, index) => (
                  <b
                    key={`${name}-${index}`}
                    className={online.memberRoles[index] ?? "spectator"}
                  >
                    {name}
                    {online.memberRoles[index]
                      ? ` / ${playerName(online.memberRoles[index]!)}`
                      : " / WATCH"}
                    {index === 0 ? " / LEADER" : ""}
                  </b>
                ))}
              </div>
            )}
            {online.code && online.isHost && (
              <span className="room-leader-badge">ROOM LEADER</span>
            )}
            {online.code && (
              <button
                type="button"
                className="leave-room-button"
                onClick={() => void leaveOnlineRoom()}
                disabled={online.pending}
              >
                ルーム退出
              </button>
            )}
            <a href="/signin-with-chatgpt?return_to=%2F">SIGN IN WITH CHATGPT</a>
            {online.error && <small>{online.error}</small>}
          </section>
        )}
        <section className="ai-lab">
          <div className="lab-title">
            <span>AI STRATEGY LAB</span>
            <strong>{strategicRead}</strong>
          </div>
          <div className="lab-stat"><b>{stats.games}</b><span>対戦数</span></div>
          {activePlayers(game).map((player) => (
            <div key={player} className={`lab-stat ${player}`}>
              <b>{winRates[player]}%</b>
              <span>{playerName(player)}勝率</span>
            </div>
          ))}
          <div className="lab-stat"><b>{averageTurns}</b><span>平均手数</span></div>
          <div className="strategy-note">
            <b>AIの基本戦略</b>
            中央へ近づく移動を優先し、自機を中央へ押す配置、相手を遠ざける配置、相手メテオの破壊を評価します。
            勝率が一方へ60%以上偏り続ける場合、必勝に近い定石や先後差の候補です。
          </div>
          <button
            className="reset-stats"
            onClick={() =>
              setStats({
                games: 0,
                red: 0,
                blue: 0,
                green: 0,
                yellow: 0,
                draw: 0,
                turns: 0,
              })
            }
          >
            RESET DATA
          </button>
        </section>
        <details className="rules">
          <summary>HOW TO PLAY</summary>
          <div className="rule-grid">
            <p><b>MOVE</b> 縦横へ必ず1マス。移動不能時だけ省略できます。</p>
            <p><b>PLACE</b> 先攻初手を除き、移動後にメテオを1個配置します。</p>
            <p><b>BLAST</b> 小は周囲を1マス、大は近距離2・遠距離1マス吹き飛ばします。</p>
            <p><b>WIN</b> 移動または爆風で中央のCOREへ入れば勝利です。</p>
          </div>
        </details>
        <details className="history-panel">
          <summary>MISSION LOG</summary>
          <ol>{game.log.slice().reverse().map((line, i) => <li key={`${line}-${i}`}>{line}</li>)}</ol>
        </details>
      </section>
    </main>
  );
}

function ProbeIcon({ color }: { color: Player }) {
  return <div className={`probe-portrait ${color}`}><span>▲</span><i /><b /></div>;
}

function ProbeToken({
  player,
  rotation,
  push,
}: {
  player: Player;
  rotation: number;
  push?: { from: Pos; dr: number; dc: number };
}) {
  return (
    <span
      className={`probe-motion${push ? " blast-lift" : ""}`}
      style={
        push
          ? ({
              "--push-x": `${push.dc * 147}%`,
              "--push-y": `${push.dr * 147}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <span
        className={`probe-token ${player}`}
        style={{ "--probe-rotation": `${rotation}deg` } as React.CSSProperties}
      >
        <i>▲</i>
      </span>
    </span>
  );
}

function MeteorIcon({
  meteor,
  falling = false,
  destroyed = false,
}: {
  meteor: Meteor;
  falling?: boolean;
  destroyed?: boolean;
}) {
  return (
    <span
      className={[
        "meteor-token",
        meteor.owner,
        meteor.size,
        falling ? "meteor-fall" : "",
        destroyed ? `meteor-shatter return-${meteor.owner}` : "",
      ].join(" ")}
    >
      {meteor.size === "large" ? "✦" : "●"}
      {destroyed && <i className="shard shard-a" />}
      {destroyed && <i className="shard shard-b" />}
      {destroyed && <i className="shard shard-c" />}
    </span>
  );
}

function ObstacleIcon({ obstacle }: { obstacle: ObstacleMeteor }) {
  return (
    <span className={`obstacle-token ${obstacle.owner}`} title="破壊不能のお邪魔メテオ">
      <i />
      <b>◆</b>
    </span>
  );
}

function InventoryPanel({
  inventory,
  color,
}: {
  inventory: Record<MeteorSize, number>;
  color: Player;
}) {
  return (
    <div className="inventory">
      <span>ARSENAL</span>
      <div>
        <i className={`mini-meteor ${color}`}>●</i>
        <small>SMALL</small>
        <b>×{inventory.small}</b>
      </div>
      <div>
        <i className={`mini-meteor large ${color}`}>✦</i>
        <small>LARGE</small>
        <b>×{inventory.large}</b>
      </div>
    </div>
  );
}

export default function Home() {
  return <Game />;
}
