"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PLAYER_ORDER,
  activeObstacles,
  activePlayers,
  applySetupItem,
  applyMeteor,
  applyHoloSwitch,
  applyOrbitSwitch,
  applyPulseSwitch,
  applyRecallItem,
  applyUseItem,
  applyMove,
  applyObstacle,
  applyPass,
  boardToViewDelta,
  canPlaceObstacle,
  canUseItem,
  cancelPendingItem,
  confirmSetupItems,
  finishTurn,
  initialGameState as initialState,
  legalMoves,
  isItemVariant,
  isTeamVariant,
  meteorName,
  orthogonallyAdjacent,
  playerName,
  resetSetupItems,
  samePos,
  teamOf,
  viewToBoardPos,
  type GameState,
  type GameVariant,
  type ItemKind,
  type Meteor,
  type MeteorSize,
  type ObstacleMeteor,
  type Player,
  type Pos,
} from "./game-rules";
import { chooseAiDecision, type AiDifficulty } from "./ai-engine";
import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";

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
type SwitchFx = { kind: ItemKind; player: Player; nonce: number };
type OrbitFx = { ring: number; clockwise: boolean; nonce: number };
type OnlineItemEffect = {
  version: number;
  kind: ItemKind;
  player: Player;
  ring?: number;
  clockwise?: boolean;
};

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
  const [variant, setVariant] = useState<GameVariant>("classic");
  const [game, setGame] = useState<GameState>(() => initialState(9, "red"));
  const [activeBalance, setActiveBalance] = useState<BalanceConfig>(DEFAULT_BALANCE);
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
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [blastFx, setBlastFx] = useState<BlastFx | null>(null);
  const [switchFx, setSwitchFx] = useState<SwitchFx | null>(null);
  const [orbitFx, setOrbitFx] = useState<OrbitFx | null>(null);
  const [hoveredOrbitRing, setHoveredOrbitRing] = useState<number | null>(null);
  const [selectedOrbitRing, setSelectedOrbitRing] = useState<number | null>(null);
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
  useEffect(() => {
    const draft = new URLSearchParams(window.location.search).get("balance") === "draft";
    fetch(`/api/balance${draft ? "?draft=1" : ""}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        const loaded = normalizeBalance(data.balance);
        setActiveBalance(loaded);
        setGame((current) => ({ ...current, balance: loaded }));
      })
      .catch(() => undefined);
  }, []);
  const recordedOutcome = useRef("");
  const playedOnlineEffect = useRef(0);
  const playedOnlineItemEffect = useRef(0);
  const mid = Math.floor(game.size / 2);
  const moves = useMemo(() => legalMoves(game), [game]);
  const balance = normalizeBalance(game.balance);
  const setupPlayer =
    mode === "online" && game.phase === "setup" && online.role
      ? online.role
      : game.turn;
  const canControl =
    (mode === "online" || !needsNewGame) &&
    (mode !== "online" ||
      (online.status === "playing" &&
        ((game.phase === "setup" && online.role && !game.setupConfirmed?.[online.role]) ||
          online.role === game.turn ||
          (online.isHost && (game.botPlayers ?? []).includes(game.turn))) &&
      !online.pending));
  const showTurnActionControls =
    mode === "online"
      ? game.phase === "setup"
        ? Boolean(online.role && !game.setupConfirmed?.[online.role])
        : online.role === game.turn
      : mode === "lab"
        ? false
        : !(game.botPlayers ?? []).includes(game.turn);

  useEffect(() => {
    setStats({
      games: 0,
      red: 0,
      blue: 0,
      green: 0,
      yellow: 0,
      draw: 0,
      turns: 0,
    });
    recordedOutcome.current = "";
  }, [variant, size, aiPlayerCount, aiDifficulty]);
  const setupPlayerCount =
    isTeamVariant(variant)
      ? 4
      : setupMode === "cpu" || setupMode === "lab"
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

  useEffect(() => {
    if (variant === "team" && size !== 13 && size !== 15) setSize(13);
    if (variant === "team-item" && size !== 13 && size !== 15) setSize(13);
    if (variant === "item" && ![11, 13, 15].includes(size)) setSize(11);
  }, [variant, size]);

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
      setVariant(data.state.variant ?? "classic");
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
      setVariant(data.state.variant ?? "classic");
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
    action: "setup_item" | "setup_confirm" | "setup_cancel" | "use_item" | "cancel_item" | "move" | "meteor" | "obstacle" | "pass" | "skip_move" | "switch_holo" | "switch_pulse" | "switch_orbit" | "switch_recall",
    target?: Pos,
    meteorSize?: MeteorSize,
    useCapsule = false,
    ring?: number,
    clockwise?: boolean,
    itemKind?: ItemKind,
    meteorId?: number,
    setupActorOverride?: Player,
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
        useCapsule,
        ring,
        clockwise,
        itemKind,
        meteorId,
        setupActor: setupActorOverride ?? setupPlayer,
      });
      if ((action === "setup_item" || action === "setup_confirm" || action === "setup_cancel" || action === "use_item" || action === "cancel_item" || action === "move" || action === "skip_move") && data.state) {
        setGame(data.state);
        setVariant(data.state.variant ?? "classic");
      }
      if (action.startsWith("switch_") && data.state) setGame(data.state);
      const confirmedItemEffect = data.state?.onlineItemEffect as OnlineItemEffect | undefined;
      if (confirmedItemEffect) playedOnlineItemEffect.current = confirmedItemEffect.version;
      if (action === "meteor" && data.state) {
        const confirmedEffect = data.state.onlineEffect as OnlineEffect | undefined;
        if (confirmedEffect) playedOnlineEffect.current = confirmedEffect.version;
        window.setTimeout(() => {
          setGame(data.state);
          setBlastFx((effect) =>
            effect ? { ...effect, stage: "recover" } : effect,
          );
        }, 520);
        window.setTimeout(() => {
          setGame(data.state);
          setBlastFx(null);
          setIsAnimating(false);
        }, 980);
      }
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
      if (action === "meteor") {
        setBlastFx(null);
        setIsAnimating(false);
      }
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
      setVariant(data.state.variant ?? "classic");
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

  const showSwitchFx = (kind: ItemKind, player: Player) => {
    setSwitchFx({ kind, player, nonce: Date.now() });
    window.setTimeout(() => setSwitchFx((current) => current?.kind === kind && current.player === player ? null : current), 1050);
  };

  const moveProbe = (target: Pos) => {
    if (!canControl || game.phase !== "move" || !moves.some((p) => samePos(p, target))) return;
    const start = game.probes[game.turn];
    const steps = Math.max(Math.abs(target.r - start.r), Math.abs(target.c - start.c));
    const dr = Math.sign(target.r - start.r), dc = Math.sign(target.c - start.c);
    const picked = Array.from({ length: steps }, (_, i) => ({ r: start.r + dr * (i + 1), c: start.c + dc * (i + 1) }))
      .map((cell) => game.fieldItems.find((item) => samePos(item, cell)))
      .filter((item): item is GameState["fieldItems"][number] => Boolean(item)).at(-1);
    if (picked) showSwitchFx(picked.kind, game.turn);
    if (mode === "online") {
      // Reflect movement and item pickup immediately while the server confirms the action.
      setGame(applyMove(game, target));
      void submitOnlineAction("move", target);
      return;
    }
    commit(applyMove(game, target));
  };

  const skipBlockedMove = () => {
    if (game.phase !== "move" || moves.length > 0) return;
    if (game.turnCount === 0) {
      commit(finishTurn(game, "先攻の初手終了"));
      return;
    }
    if (game.bonusMove) {
      if (mode === "online") void submitOnlineAction("skip_move");
      commit(finishTurn({ ...game, bonusMove: false }, "ボーナス移動先なし・手番終了"));
      return;
    }
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

  const placeMeteor = (target: Pos, sizeOverride?: MeteorSize, useCapsule = false) => {
    const chosenSize: MeteorSize =
      sizeOverride ??
      (game.selected === "obstacle" || game.selected === "capsule"
        ? "small"
        : game.selected);
    if (
      !canControl ||
      isAnimating ||
      game.phase !== "place"
    ) return;
    try {
      const capsule = useCapsule || game.selected === "capsule";
      const resolution = applyMeteor(game, target, chosenSize, capsule);
      const blastPickup = activePlayers(game)
        .map((player) => ({ player, item: game.fieldItems.find((item) => samePos(item, resolution.state.probes[player])) }))
        .find(({ player, item }) => Boolean(item) && !samePos(game.probes[player], resolution.state.probes[player]));
      if (blastPickup?.item) showSwitchFx(blastPickup.item.kind, blastPickup.player);
      if (mode === "online") {
        setIsAnimating(true);
        setBlastFx({
          stage: "probe",
          target,
          owner: game.turn,
          size: chosenSize,
          destroyedIds: resolution.destroyedIds,
          pushed: resolution.pushed,
        });
        playBoom();
        void submitOnlineAction("meteor", target, chosenSize, capsule);
        return;
      }
      const before = game.probes;
      const probes = resolution.state.probes;
      setIsAnimating(true);
      setBlastFx({
        stage: "probe",
        target,
        owner: game.turn,
        size: chosenSize,
        destroyedIds: resolution.destroyedIds,
        pushed: resolution.pushed,
      });
      playBoom();
      const effectScale =
        mode !== "lab" ? 1 : aiSpeed <= 60 ? 0.08 : aiSpeed <= 240 ? 0.18 : 0.48;
      window.setTimeout(() => {
        setGame((current) => ({ ...current, probes }));
        setBlastFx((effect) => (effect ? { ...effect, stage: "recover" } : effect));
      }, Math.max(70, Math.round(1100 * effectScale)));
      window.setTimeout(() => {
        commit(resolution.state);
        setBlastFx(null);
        setIsAnimating(false);
      }, Math.max(140, Math.round(2020 * effectScale)));
      void before;
      return;
    } catch {
      return;
    }
    /*
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
    */
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

  const resolveHolo = (target: Pos) => {
    const player = game.pendingSwitches?.[0]?.player ?? game.turn;
    const next = applyHoloSwitch(game, target);
    showSwitchFx("holo", player);
    if (mode === "online") void submitOnlineAction("switch_holo", target);
    commit(next);
  };
  const resolvePulse = (target: Pos) => {
    const player = game.pendingSwitches?.[0]?.player ?? game.turn;
    const next = applyPulseSwitch(game, target);
    showSwitchFx("pulse", player);
    if (mode === "online") void submitOnlineAction("switch_pulse", target);
    commit(next);
  };
  const resolveOrbit = (ring: number, clockwise: boolean) => {
    const player = game.pendingSwitches?.[0]?.player ?? game.turn;
    const next = applyOrbitSwitch(game, ring, clockwise);
    showSwitchFx("orbit", player);
    if (mode === "online") void submitOnlineAction("switch_orbit", undefined, undefined, false, ring, clockwise);
    setSelectedOrbitRing(null);
    setHoveredOrbitRing(null);
    setOrbitFx({ ring, clockwise, nonce: Date.now() });
    setIsAnimating(true);
    commit(next);
    window.setTimeout(() => {
      setOrbitFx(null);
      setIsAnimating(false);
    }, 760);
  };
  const resolveRecall = (meteorId: number) => {
    const player = game.pendingSwitches?.[0]?.player ?? game.turn;
    const next = applyRecallItem(game, meteorId);
    showSwitchFx("recall", player);
    if (mode === "online") void submitOnlineAction("switch_recall", undefined, undefined, false, undefined, undefined, undefined, meteorId);
    commit(next);
  };
  const useItem = (kind: ItemKind) => {
    if (!canControl || !canUseItem(game, kind)) return;
    try {
      if (kind === "shield" || kind === "booster") showSwitchFx(kind, game.turn);
      if (mode === "online") void submitOnlineAction("use_item", undefined, undefined, false, undefined, undefined, kind);
      commit(applyUseItem(game, kind));
    } catch { return; }
  };

  const cancelItemTarget = () => {
    if (!canControl || game.phase !== "switch" || !game.pendingSwitches?.length) return;
    setSelectedOrbitRing(null);
    setHoveredOrbitRing(null);
    if (mode === "online") void submitOnlineAction("cancel_item");
    commit(cancelPendingItem(game));
  };

  const confirmItemLoadout = () => {
    if (!canControl || game.phase !== "setup" || (game.itemHands?.[setupPlayer]?.length ?? 0) !== balance.itemHandTotal) return;
    if (mode === "online") void submitOnlineAction("setup_confirm");
    commit(confirmSetupItems(game, setupPlayer));
  };

  const cancelItemLoadout = () => {
    if (!canControl || game.phase !== "setup" || !(game.itemHands?.[setupPlayer]?.length ?? 0)) return;
    if (mode === "online") void submitOnlineAction("setup_cancel");
    commit(resetSetupItems(game, setupPlayer));
  };

  const handleCell = (r: number, c: number) => {
    if (isAnimating) return;
    if (game.phase === "setup") return;
    if (game.phase === "move") moveProbe({ r, c });
    if (game.phase === "place") {
      if (game.selected === "obstacle") placeObstacle({ r, c });
      else placeMeteor({ r, c });
    }
    if (game.phase === "switch") {
      const kind = game.pendingSwitches?.[0]?.kind;
      try {
        if (kind === "orbit") {
          const ring = Math.max(Math.abs(r - mid), Math.abs(c - mid));
          if (ring > 0) setSelectedOrbitRing(ring);
        }
        if (kind === "holo") resolveHolo({ r, c });
        if (kind === "pulse") resolvePulse({ r, c });
        if (kind === "recall") {
          const meteor = game.meteors.find((entry) => entry.r === r && entry.c === c);
          if (meteor) resolveRecall(meteor.id);
        }
      } catch { return; }
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
          variant,
        });
        setGame(data.state);
        setVariant(data.state.variant ?? "classic");
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
    const configuredPlayerCount =
      setupMode === "cpu" || setupMode === "lab"
        ? aiPlayerCount
        : setupMode === "human"
          ? 2 + localAiCount
          : onlinePlayerCount + onlineAiCount;
    const playerCount = isTeamVariant(variant) ? 4 : configuredPlayerCount;
    const nextSize =
      isTeamVariant(variant) && (size === 9 || size === 11)
          ? 13
        : playerCount > 2 && size === 9
          ? 11
          : size;
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
          variant,
          activeBalance,
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
        game.variant ?? "classic",
        game.balance ?? activeBalance,
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

  const orbitSelecting =
    showTurnActionControls &&
    game.phase === "switch" &&
    game.pendingSwitches?.[0]?.kind === "orbit";
  const orbitRingAt = (r: number, c: number) => Math.max(Math.abs(r - mid), Math.abs(c - mid));
  const activeOrbitRing = selectedOrbitRing ?? hoveredOrbitRing;

  const validPlacement = (r: number, c: number) =>
    game.phase === "setup"
      ? false
      : game.phase === "switch" && !showTurnActionControls
      ? false
      : orbitSelecting
      ? orbitRingAt(r, c) > 0
      : game.phase === "switch" && (game.pendingSwitches?.[0]?.kind === "holo" || game.pendingSwitches?.[0]?.kind === "pulse")
      ? !activePlayers(game).some((player) => samePos({ r, c }, game.probes[player]))
      : game.phase === "switch" && game.pendingSwitches?.[0]?.kind === "recall"
      ? game.meteors.some((meteor) => meteor.r === r && meteor.c === c && meteor.owner === game.turn && !meteor.consumable)
      : game.selected === "obstacle"
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
          const remoteItemEffect = data.state.onlineItemEffect as OnlineItemEffect | undefined;
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
            }, 520);
            window.setTimeout(() => {
              setGame(data.state);
              setBlastFx(null);
              setIsAnimating(false);
            }, 980);
          } else {
            setGame(data.state);
          }
          if (remoteItemEffect && remoteItemEffect.version > playedOnlineItemEffect.current) {
            playedOnlineItemEffect.current = remoteItemEffect.version;
            setSwitchFx({
              kind: remoteItemEffect.kind,
              player: remoteItemEffect.player,
              nonce: Date.now(),
            });
            window.setTimeout(() => setSwitchFx(null), 900);
            if (
              remoteItemEffect.kind === "orbit" &&
              remoteItemEffect.ring !== undefined &&
              remoteItemEffect.clockwise !== undefined
            ) {
              setOrbitFx({
                ring: remoteItemEffect.ring,
                clockwise: remoteItemEffect.clockwise,
                nonce: Date.now(),
              });
              setIsAnimating(true);
              window.setTimeout(() => {
                setOrbitFx(null);
                setIsAnimating(false);
              }, 760);
            }
          }
          setSize(data.state.size);
          setVariant(data.state.variant ?? "classic");
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
    }, 500);
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
          game.variant ?? "classic",
          game.balance ?? activeBalance,
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
      if (game.phase === "setup") {
        const setupDecision = chooseAiDecision(game, aiDifficulty);
        if (setupDecision.type === "setup") {
          const next = applySetupItem(game, setupDecision.kind);
          if (mode === "online") void submitOnlineAction("setup_item", undefined, undefined, false, undefined, undefined, setupDecision.kind, undefined, game.turn);
          commit(next);
        } else if (setupDecision.type === "confirm_setup") {
          if (mode === "online") void submitOnlineAction("setup_confirm", undefined, undefined, false, undefined, undefined, undefined, undefined, game.turn);
          commit(confirmSetupItems(game));
        }
        return;
      }
      const decision = chooseAiDecision(game, aiDifficulty);
      if (decision.type === "move") {
        moveProbe(decision.target);
      } else if (decision.type === "meteor") {
        placeMeteor(decision.target, decision.size, decision.useCapsule);
      } else if (decision.type === "item") {
        useItem(decision.kind);
      } else if (decision.type === "pass") {
        passPlacement();
      } else if (decision.type === "holo") {
        resolveHolo(decision.target);
      } else if (decision.type === "pulse") {
        resolvePulse(decision.target);
      } else if (decision.type === "orbit") {
        resolveOrbit(decision.ring, decision.clockwise);
      } else if (decision.type === "recall") {
        resolveRecall(decision.meteorId);
      } else if (game.phase === "move") {
        skipBlockedMove();
      }
      return;
    }, game.phase === "setup" ? 30 : game.bonusMove ? Math.max(420, aiSpeed) : aiSpeed);
    return () => window.clearTimeout(timer);
  }, [
    game,
    mode,
    aiRunning,
    aiSpeed,
    aiDifficulty,
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
  const teamWinRates = {
    sun: stats.games ? Math.round(((stats.red + stats.yellow) / stats.games) * 100) : 0,
    moon: stats.games ? Math.round(((stats.blue + stats.green) / stats.games) * 100) : 0,
  };
  const labLeaders = activePlayers(game)
    .map((player) => ({ player, rate: winRates[player] }))
    .sort((a, b) => b.rate - a.rate);
  const strategicRead =
    stats.games < 10
      ? "10戦以上で傾向を判定します"
      : isTeamVariant(game.variant)
        ? Math.abs(teamWinRates.sun - teamWinRates.moon) <= 10
          ? "現時点では大きなチーム差なし"
          : `${teamWinRates.sun > teamWinRates.moon ? "SUN" : "MOON"} TEAM優勢。先攻・初期方向の影響を要観察`
      : labLeaders.length < 2 || labLeaders[0].rate - labLeaders[1].rate <= 10
        ? "現時点では大きな陣営差なし"
        : `${playerName(labLeaders[0].player)}側優勢。先攻・初期方向の影響を要観察`;
  const perspectiveSlot =
    mode === "online" && online.role
      ? (PLAYER_ORDER.indexOf(online.role) + (game.layoutOffset ?? 0)) % 4
      : 0;
  const selfPlayer: Player | null =
    mode === "cpu"
      ? "red"
      : mode === "online"
        ? online.role
        : mode === "local"
          ? game.turn
          : null;
  const turnMemberIndex =
    mode === "online" ? online.memberRoles.indexOf(game.turn) : -1;
  const turnDisplayName =
    turnMemberIndex >= 0
      ? online.memberNames[turnMemberIndex]
      : (game.botPlayers ?? []).includes(game.turn)
        ? `${playerName(game.turn)} AI`
        : playerName(game.turn);
  const ownMemberIndex =
    online.role ? online.memberRoles.indexOf(online.role) : -1;
  const ownDisplayName =
    ownMemberIndex >= 0 ? online.memberNames[ownMemberIndex] : nickname.trim();
  const resultPlayer =
    game.phase === "over" && game.winner && game.winner !== "draw"
      ? game.winner
      : null;
  const displayAccent = resultPlayer ?? game.turn;
  const displayNameForPlayer = (player: Player, fallbackNumber: number) => {
    if (mode !== "online") return `PLAYER ${String(fallbackNumber).padStart(2, "0")}`;
    const memberIndex = online.memberRoles.indexOf(player);
    if (memberIndex >= 0) return online.memberNames[memberIndex] || playerName(player);
    if ((game.botPlayers ?? []).includes(player)) return `${playerName(player)} AI`;
    return playerName(player);
  };

  return (
    <main className={`shell variant-${game.variant}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <div>
            <h1>METEOR RACE</h1>
            <p>BLAST YOUR WAY TO THE CORE</p>
          </div>
        </div>
        <div className="round">
          ROUND {Math.floor(game.turnCount / activePlayers(game).length) + 1}
        </div>
      </header>

      <section className="game-layout">
        <aside className={`player-card red-card ${(game.phase === "over" ? game.winner === "red" : game.turn === "red") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("red", 1)}</span>
          <h2>RED</h2>
          <ProbeIcon color="red" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.red} color="red" items={game.itemHands?.red ?? []} />
        </aside>

        <section className="arena">
          {switchFx && (
            <div key={switchFx.nonce} className={`switch-activation ${switchFx.kind} ${switchFx.player}`} role="status">
              <span className="switch-burst" />
              <b>{switchFx.kind.toUpperCase()}</b>
              <small>ITEM ACTIVATED</small>
            </div>
          )}
          <div className={`turn-callout ${displayAccent}`} aria-live="polite">
            <span>{resultPlayer ? "WINNER" : "CURRENT TURN"}</span>
            <b>{resultPlayer ? playerName(resultPlayer) : turnDisplayName}</b>
            <i>{playerName(displayAccent)}</i>
          </div>
          <div className="status" aria-live="polite">
            <span className={`status-dot ${displayAccent}`} />
            {game.message}
          </div>
          <div
            className={`board turn-${displayAccent}`}
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
              const orbitShift = orbitFx && orbitRingAt(r, c) === orbitFx.ring
                ? (() => {
                    const from = orbitFx.clockwise
                      ? { r: game.size - 1 - c, c: r }
                      : { r: c, c: game.size - 1 - r };
                    return boardToViewDelta({ r: from.r - r, c: from.c - c }, perspectiveSlot);
                  })()
                : null;
              const setupSlot = false;
              const setupRejected = setupSlot &&
                (game.setupRejected?.[game.turn] ?? []).some((cell) => samePos(cell, pos));
              const setupZone = setupSlot
                ? ((r === 5 || r === 9) && (c === 5 || c === 9)
                    ? "inner"
                    : (r === 2 || r === 12) && (c === 2 || c === 12)
                      ? "outer"
                      : "middle")
                : null;
              const probe =
                activePlayers(game).find((player) => samePos(pos, game.probes[player])) ?? null;
              const meteor = game.meteors.find((m) => samePos(m, pos));
              const visibleItems = game.phase === "setup"
                ? (game.setupPlacements?.[game.turn] ?? [])
                : game.fieldItems;
              const fieldItem = visibleItems.find((item) => samePos(item, pos));
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
                    orbitSelecting && activeOrbitRing === orbitRingAt(r, c) ? "orbit-preview" : "",
                    orbitShift ? `orbit-shift ${orbitFx?.clockwise ? "clockwise" : "counterclockwise"}` : "",
                    setupSlot ? `setup-slot setup-${setupZone}` : "",
                    setupRejected ? "setup-rejected" : "",
                  ].join(" ")}
                  onClick={() => handleCell(r, c)}
                  style={orbitShift ? ({
                    "--orbit-from-x": `${orbitShift.c * 100}%`,
                    "--orbit-from-y": `${orbitShift.r * 100}%`,
                  } as React.CSSProperties) : undefined}
                  onMouseEnter={() => {
                    if (orbitSelecting && !selectedOrbitRing) setHoveredOrbitRing(orbitRingAt(r, c) || null);
                  }}
                  onMouseLeave={() => {
                    if (orbitSelecting && !selectedOrbitRing) setHoveredOrbitRing(null);
                  }}
                  disabled={game.phase === "over" || (!legal && !placeable)}
                  aria-label={`座標 ${r},${c}${probe ? ` ${playerName(probe)}探査機` : ""}${meteor ? ` ${meteorName(meteor.size)}` : ""}${obstacle ? " お邪魔メテオ" : ""}`}
                >
                  {r === mid && c === mid && <span className="core-ring"><b>CORE</b></span>}
                  {setupSlot && (
                    <span className="setup-slot-label" aria-hidden="true">
                      <b>{r + 1},{c + 1}</b>
                      <i>{setupRejected ? "×" : setupZone === "inner" ? "内" : setupZone === "middle" ? "中" : "外"}</i>
                    </span>
                  )}
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
                  {obstacle && (
                    <ObstacleIcon
                      obstacle={obstacle}
                      roundsLeft={Math.max(1, Math.ceil((obstacle.turns ?? 1) / activePlayers(game).length))}
                    />
                  )}
                  {fieldItem && (
                    <span className={`field-item ${fieldItem.kind}`} title={fieldItem.kind}>
                      {fieldItem.kind === "shield"
                        ? "⬡"
                        : fieldItem.kind === "booster"
                          ? "»"
                          : "●+"}
                    </span>
                  )}
                  {probe && (
                    <ProbeToken
                      player={probe}
                      teamMode={isTeamVariant(game.variant)}
                      isSelf={probe === selfPlayer}
                      shield={Boolean(game.shield?.[probe])}
                      boost={game.boosterMoves?.[probe] ?? 0}
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
            {game.phase === "setup" && showTurnActionControls && (
              <div className="switch-setup-controls">
                <span className="action-label">持ち込むアイテムを{balance.itemHandTotal}個選択（同じ種類は{balance.itemSameMax}個まで）</span>
                {(["shield", "booster", "holo", "orbit", "pulse", "recall"] as ItemKind[]).map((kind) => (
                  <button
                    key={kind}
                    className={`meteor-choice item-choice ${kind} ${(game.itemHands?.[setupPlayer] ?? []).includes(kind) ? "selected" : ""}`}
                    disabled={!canControl || (game.itemHands?.[setupPlayer] ?? []).filter((entry) => entry === kind).length >= balance.itemSameMax}
                    onClick={() => {
                      try {
                        const next = applySetupItem(game, kind, setupPlayer);
                        if (mode === "online") void submitOnlineAction("setup_item", undefined, undefined, false, undefined, undefined, kind);
                        commit(next);
                      } catch { return; }
                    }}
                  >
                    <ItemIcon kind={kind} />
                    <span>{kind.toUpperCase()}</span>
                    <b>{(game.itemHands?.[setupPlayer] ?? []).filter((entry) => entry === kind).length}</b>
                  </button>
                ))}
                <b>
                  {`${game.itemHands?.[setupPlayer]?.length ?? 0} / ${balance.itemHandTotal} 選択済み`}
                </b>
                <span className="setup-confirm-actions">
                  <button
                    className="primary-action compact-action"
                    disabled={(game.itemHands?.[setupPlayer]?.length ?? 0) !== balance.itemHandTotal}
                    onClick={confirmItemLoadout}
                  >
                    決定
                  </button>
                  <button
                    className="secondary-action compact-action"
                    disabled={(game.itemHands?.[setupPlayer]?.length ?? 0) === 0}
                    onClick={cancelItemLoadout}
                  >
                    選択をキャンセル
                  </button>
                </span>
              </div>
            )}
            {game.phase === "place" && showTurnActionControls && (
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
                <button
                  className="meteor-choice pass-choice"
                  disabled={!(game.passAvailable?.[game.turn] ?? true)}
                  onClick={passPlacement}
                >
                  配置しない <b>{game.passAvailable?.[game.turn] ?? true ? 1 : 0}</b>
                </button>
                {isItemVariant(game.variant) && (game.itemHands?.[game.turn] ?? []).map((kind, index) => (
                  <button
                    key={`${kind}-${index}`}
                    className={`meteor-choice item-choice ${kind}`}
                    disabled={!canUseItem(game, kind)}
                    onClick={() => useItem(kind)}
                    title="使用すると、この手番はメテオを配置できません"
                  >
                    <ItemIcon kind={kind} />
                    <span>{kind.toUpperCase()}</span>
                  </button>
                ))}
              </>
            )}
            {game.phase === "switch" && showTurnActionControls && game.pendingSwitches?.[0]?.kind === "orbit" && (
              <div className="orbit-controls">
                <span className="action-label">
                  {selectedOrbitRing
                    ? `R${selectedOrbitRing}：回転方向を選択`
                    : "ORBIT：盤上の回転させたいリングを選択"}
                </span>
                {selectedOrbitRing && (
                  <span className="orbit-direction-actions">
                    <button onClick={() => resolveOrbit(selectedOrbitRing, true)}>時計回り ↻</button>
                    <button onClick={() => resolveOrbit(selectedOrbitRing, false)}>反時計回り ↺</button>
                    <button className="secondary" onClick={() => setSelectedOrbitRing(null)}>リングを選び直す</button>
                  </span>
                )}
                <button className="secondary" onClick={cancelItemTarget}>戻る</button>
              </div>
            )}
            {game.phase === "switch" && showTurnActionControls && game.pendingSwitches?.[0]?.kind !== "orbit" && (
              <div className="switch-target-controls">
                <span className="action-label">
                  {`${game.pendingSwitches?.[0]?.kind.toUpperCase()}：盤上から対象を選択`}
                </span>
                <button className="secondary" onClick={cancelItemTarget}>戻る</button>
              </div>
            )}
            {game.phase === "move" && showTurnActionControls && moves.length === 0 && (
              <button className="primary-action" onClick={skipBlockedMove}>
                移動不能 — メテオ配置へ
              </button>
            )}
            {game.phase === "move" && showTurnActionControls && game.bonusMove && moves.length > 0 && (
              <div className={`bonus-move-callout ${game.turn}`} role="status">
                BONUS MOVE <b>2 / 2</b>
              </div>
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

        <aside className={`player-card blue-card ${(game.phase === "over" ? game.winner === "blue" : game.turn === "blue") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("blue", 2)}</span>
          <h2>BLUE</h2>
          <ProbeIcon color="blue" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.blue} color="blue" items={game.itemHands?.blue ?? []} />
        </aside>
      </section>
      {activePlayers(game).length > 2 && (
        <section className="extra-players" aria-label="追加プレイヤー">
          {PLAYER_ORDER.filter(
            (player) =>
              player !== "red" &&
              player !== "blue" &&
              activePlayers(game).includes(player),
          ).map((player, index) => (
            <aside
              key={player}
              className={`player-card compact ${player}-card ${
                (game.phase === "over" ? game.winner === player : game.turn === player) ? "active" : ""
              }`}
            >
              <span className="eyebrow">{displayNameForPlayer(player, index + 3)}</span>
              <h2>{playerName(player)}</h2>
              <ProbeIcon color={player} teamMode={isTeamVariant(game.variant)} />
              <InventoryPanel inventory={game.inventory[player]} color={player} items={game.itemHands?.[player] ?? []} />
            </aside>
          ))}
        </section>
      )}

      <section className="control-strip">
        <div className="settings">
          <label>
            GAME
            <select
              value={variant}
              disabled={roomSettingsLocked}
              onChange={(event) => {
                const nextVariant = event.target.value as GameVariant;
                setVariant(nextVariant);
                if (nextVariant === "team") {
                  setSize(13);
                  setAiPlayerCount(4);
                  setLocalAiCount(2);
                } else if (nextVariant === "item" || nextVariant === "team-item") {
                  if (nextVariant === "team-item") {
                    if (size !== 13 && size !== 15) setSize(13);
                    setAiPlayerCount(4);
                    setLocalAiCount(2);
                  } else if (![11, 13, 15].includes(size)) {
                    setSize(11);
                  }
                } else if (size === 15) {
                  setSize(11);
                }
                setNeedsNewGame(true);
              }}
            >
              <option value="classic">CLASSIC</option>
              <option value="team">2 VS 2 TEAM</option>
              <option value="item">アイテム戦</option>
              <option value="team-item">2 VS 2 チームアイテム戦</option>
            </select>
          </label>
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
              <option value={9} disabled={setupPlayerCount > 2 || variant !== "classic"}>9 × 9</option>
              <option value={11} disabled={isTeamVariant(variant)}>11 × 11</option>
              <option value={13} disabled={variant !== "team" && !isItemVariant(variant)}>13 × 13</option>
              <option value={15} disabled={!isItemVariant(variant) && !isTeamVariant(variant)}>15 × 15</option>
            </select>
          </label>
          <label>
            FIRST
            {setupMode === "online" ? (
              <select value="random" disabled aria-label="先攻はランダム">
                <option value="random">RANDOM</option>
              </select>
            ) : (
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
            )}
          </label>
          {(setupMode === "cpu" ||
            setupMode === "lab" ||
            (setupMode === "human" && localAiCount > 0) ||
            (setupMode === "online" && onlineAiCount > 0)) && (
            <label>
              AI LEVEL
              <select
                value={aiDifficulty}
                onChange={(event) => setAiDifficulty(event.target.value as AiDifficulty)}
              >
                <option value="easy">EASY</option>
                <option value="normal">NORMAL</option>
                <option value="hard">HARD</option>
              </select>
            </label>
          )}
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
            {online.code && (
              <div className={`own-room-identity ${online.role ?? "spectator"}`}>
                <span>YOU</span>
                <b>{ownDisplayName || "PLAYER"}</b>
                <i>{online.role ? playerName(online.role) : "WATCH"}</i>
              </div>
            )}
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
          {isTeamVariant(game.variant) ? (
            <>
              <div className="lab-stat red">
                <b>{teamWinRates.sun}%</b>
                <span>SUN TEAM勝率</span>
              </div>
              <div className="lab-stat blue">
                <b>{teamWinRates.moon}%</b>
                <span>MOON TEAM勝率</span>
              </div>
            </>
          ) : activePlayers(game).map((player) => (
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
            <p><b>PLACE</b> 先攻初手を除き、移動後にメテオを1個配置。配置パスは各色1回です。</p>
            <p><b>BLAST</b> 小は周囲を1マス、大は近距離2・遠距離1マス吹き飛ばします。</p>
            <p><b>WIN</b> 移動または爆風で中央のCOREへ入れば勝利です。</p>
            <p><b>TEAM</b> 13×13または15×15。RED＋YELLOW対BLUE＋GREENです。</p>
            <p><b>ITEM</b> 対戦前に{balance.itemHandTotal}個を選択。同じ種類は{balance.itemSameMax}個まで持ち込めます。</p>
            <p>BOOSTER / SHIELD / HOLO / ORBIT / PULSE / RECALL。移動後、メテオ配置の代わりに1個使用します。</p>
            <p><b>SHIELD</b> 次に受ける爆風を1回防ぎます。</p>
            <p><b>BOOSTER</b> 取得後2回、縦横へ最大2マス移動できます。</p>
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

const ITEM_ICONS: Record<ItemKind, string> = {
  shield: "⬡",
  booster: "▲",
  holo: "▣",
  orbit: "↻",
  pulse: "✦",
  recall: "↩",
};

function ItemIcon({ kind }: { kind: ItemKind }) {
  return <i className={`item-icon ${kind}`} aria-hidden="true">{ITEM_ICONS[kind]}</i>;
}

function ProbeIcon({ color, teamMode = false }: { color: Player; teamMode?: boolean }) {
  const teamClass = teamMode ? ` team-${teamOf(color)}` : "";
  return <div className={`probe-portrait ${color}${teamClass}`}><span>▲</span><i /><b /></div>;
}

function ProbeToken({
  player,
  rotation,
  push,
  teamMode = false,
  isSelf = false,
  shield = false,
  boost = 0,
}: {
  player: Player;
  rotation: number;
  push?: { from: Pos; dr: number; dc: number };
  teamMode?: boolean;
  isSelf?: boolean;
  shield?: boolean;
  boost?: number;
}) {
  return (
    <span
      className={`probe-motion${teamMode ? ` team-${teamOf(player)}` : ""}${isSelf ? " is-self" : ""}${push ? " blast-lift" : ""}`}
      style={
        push
          ? ({
              "--push-x": `${push.dc * 147}%`,
              "--push-y": `${push.dr * 147}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {(shield || boost > 0) && (
        <span className="probe-effects" aria-label={`${shield ? "シールド1 " : ""}${boost > 0 ? `ブースト${boost}` : ""}`}>
          {shield && <span className="shield-effect"><b>1</b></span>}
          {boost > 0 && <span className="boost-effect"><i /><i /><b>{boost}</b></span>}
        </span>
      )}
      <span
        className={`probe-token ${player}${teamMode ? ` team-${teamOf(player)}` : ""}`}
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

function ObstacleIcon({ obstacle, roundsLeft }: { obstacle: ObstacleMeteor; roundsLeft: number }) {
  return (
    <span className={`obstacle-token ${obstacle.owner}`} title={`破壊不能のお邪魔メテオ・残り${roundsLeft}巡`}>
      <i />
      <b>{roundsLeft}</b>
      <small>巡</small>
    </span>
  );
}

function InventoryPanel({
  inventory,
  color,
  items,
}: {
  inventory: Record<MeteorSize, number>;
  color: Player;
  items: ItemKind[];
}) {
  const itemCounts = (["shield", "booster", "holo", "orbit", "pulse", "recall"] as ItemKind[])
    .map((kind) => ({ kind, count: items.filter((item) => item === kind).length }))
    .filter(({ count }) => count > 0);
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
      {itemCounts.map(({ kind, count }) => (
        <div key={kind} className={`inventory-item ${kind}`}>
          <ItemIcon kind={kind} />
          <small>{kind.toUpperCase()}</small>
          <b>×{count}</b>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return <Game />;
}
