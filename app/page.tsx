"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdSlot } from "./components/ad-slot";
import { getMusicManager, type BattleTrackChoice, BATTLE_TRACK_LABELS } from "./music-engine";
import { rankTier } from "./duel-rating";
import { playBoom as playBoomSfx, playItemSound as playItemSoundSfx } from "./sfx";
import { useLocalSettings } from "./hooks/use-local-settings";
import { useProfile } from "./hooks/use-profile";
import { useMusicSync } from "./hooks/use-music-sync";
import {
  PLAYER_ORDER,
  activeObstacles,
  activePlayers,
  activePulseDevices,
  applyBlastSwitch,
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
  distance,
  finishTurn,
  initialGameState as initialState,
  legalMoves,
  isItemVariant,
  isPulseLocked,
  isTeamVariant,
  meteorName,
  orthogonallyAdjacent,
  playerName,
  resetSetupItems,
  resolveCoreArrivals,
  samePos,
  teamOf,
  viewToBoardPos,
  type GameState,
  type GameVariant,
  type ItemKind,
  type Meteor,
  type MeteorSize,
  type ObstacleMeteor,
  type PulseDevice,
  type Player,
  type Pos,
} from "./game-rules";
import { chooseAiDecision, type AiDifficulty } from "./ai-engine";
import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";
import { isRankedOpen, RANKED_SCHEDULE_LABEL } from "./ranked-schedule";

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
type PulseFx = { kind: "blast" | "pulse"; target: Pos; radius: number; nonce: number };
type OnlineItemEffect = {
  version: number;
  kind: ItemKind;
  player: Player;
  ring?: number;
  clockwise?: boolean;
  target?: Pos;
  radius?: number;
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
  const [entryStage, setEntryStage] = useState<"title" | "rule" | "play" | "match" | "setup" | null>("title");
  const [size, setSize] = useState(9);
  const [first, setFirst] = useState<Player>("red");
  const [variant, setVariant] = useState<GameVariant>("classic");
  const [rankedMode, setRankedMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    nickname, setNickname,
    masterVolume, setMasterVolume,
    bgmVolume, setBgmVolume,
    sfxVolume, setSfxVolume,
    reducedMotion, setReducedMotion,
    battleTrack, setBattleTrack,
  } = useLocalSettings();
  const [contactType, setContactType] = useState("不具合報告");
  const [contactMessage, setContactMessage] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [obstaclesEnabled, setObstaclesEnabled] = useState(false);
  const [aiSpeed, setAiSpeed] = useState(420);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>("normal");
  const [blastFx, setBlastFx] = useState<BlastFx | null>(null);
  const [switchFx, setSwitchFx] = useState<SwitchFx | null>(null);
  const [orbitFx, setOrbitFx] = useState<OrbitFx | null>(null);
  const [pulseFx, setPulseFx] = useState<PulseFx | null>(null);
  const [hoveredOrbitRing, setHoveredOrbitRing] = useState<number | null>(null);
  const [selectedOrbitRing, setSelectedOrbitRing] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
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
  useMusicSync({ game, soundEnabled, masterVolume, bgmVolume, reducedMotion, battleTrack });

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const rankedOpen = isRankedOpen(new Date(currentTime));
  useEffect(() => { if (!rankedOpen) setRankedMode(false); }, [rankedOpen]);
  const {
    profileEmail, publicPlayerId,
    profileStatus, setProfileStatus,
    classicRankRating, itemRankRating, refreshProfile,
  } = useProfile(setNickname);
  const rankRating = isItemVariant(variant) ? itemRankRating : classicRankRating;
  useEffect(() => {
    const draft = new URLSearchParams(window.location.search).get("balance") === "draft";
    fetch(`/api/balance${draft ? "?draft=1" : ""}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => {
        const loaded = normalizeBalance(data.balance);
        setActiveBalance(loaded);
        setGame((current) => {
          const hasStarted = current.turnCount > 0 || current.meteors.length > 0 || current.phase === "over";
          if (hasStarted) return current;
          return {
            ...current,
            balance: loaded,
            inventory: {
              red: { small: loaded.meteorSmallStart, large: loaded.meteorLargeStart },
              blue: { small: loaded.meteorSmallStart, large: loaded.meteorLargeStart },
              green: { small: loaded.meteorSmallStart, large: loaded.meteorLargeStart },
              yellow: { small: loaded.meteorSmallStart, large: loaded.meteorLargeStart },
            },
          };
        });
      })
      .catch(() => undefined);
  }, []);
  const recordedOutcome = useRef("");
  const recordedRankOutcome = useRef("");
  const playedRankedGravity = useRef(0);
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
    recordedRankOutcome.current = "";
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
    let playerId = window.localStorage.getItem("meteor-race-player-id");
    if (!playerId) {
      playerId = `player:${crypto.randomUUID()}`;
      window.localStorage.setItem("meteor-race-player-id", playerId);
    }
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
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
        variant,
        ranked: rankedMode,
      });
      setGame(data.state);
      setVariant(data.state.variant ?? "classic");
      setRankedMode(Boolean(data.state.ranked));
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
      setRankedMode(Boolean(data.state.ranked));
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
    action: "setup_item" | "setup_confirm" | "setup_cancel" | "use_item" | "cancel_item" | "move" | "meteor" | "obstacle" | "pass" | "skip_move" | "switch_holo" | "switch_blast" | "switch_pulse" | "switch_orbit" | "switch_recall",
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
        setRankedMode(Boolean(data.state.ranked));
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
      getMusicManager().dispatch({ type: "NEW_GAME" });
      setGame(data.state);
      setVariant(data.state.variant ?? "classic");
      setRankedMode(Boolean(data.state.ranked));
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

  const playBoom = () => playBoomSfx(soundEnabled, masterVolume, sfxVolume);

  const playItemSound = (kind: ItemKind) => {
    if (soundEnabled) getMusicManager().dispatch({ type: "ITEM_GET", kind });
    playItemSoundSfx(kind, soundEnabled, masterVolume, sfxVolume);
  };

  const showSwitchFx = (kind: ItemKind, player: Player) => {
    playItemSound(kind);
    setSwitchFx({ kind, player, nonce: Date.now() });
    window.setTimeout(() => setSwitchFx((current) => current?.kind === kind && current.player === player ? null : current), kind === "gravity" ? 1550 : 1050);
  };

  useEffect(() => {
    const pulse = game.rankedGravityPulse ?? 0;
    if (!pulse || pulse <= playedRankedGravity.current) return;
    playedRankedGravity.current = pulse;
    showSwitchFx("gravity", game.turn);
  }, [game.rankedGravityPulse]);

  const moveProbe = (target: Pos) => {
    if (!canControl || game.phase !== "move" || !moves.some((p) => samePos(p, target))) return;
    if (mode === "online") {
      // Reflect movement immediately while the server confirms the action.
      setGame(applyMove(game, target));
      void submitOnlineAction("move", target);
      return;
    }
    commit(applyMove(game, target));
  };

  const skipBlockedMove = () => {
    if (game.phase !== "move" || moves.length > 0) return;
    if ((game.immobilizedMoves?.[game.turn] ?? 0) > 0 || isPulseLocked(game, game.turn)) {
      if (mode === "online") void submitOnlineAction("skip_move");
      commit({
        ...game,
        immobilizedMoves: {
          ...(game.immobilizedMoves ?? { red: 0, blue: 0, green: 0, yellow: 0 }),
          [game.turn]: Math.max(0, (game.immobilizedMoves?.[game.turn] ?? 0) - 1),
        },
        phase: "place",
        message: `${playerName(game.turn)}：電磁拘束中・メテオまたはアイテムを使用`,
        log: [...game.log, `${playerName(game.turn)}はPULSE範囲内のため移動不能`],
      });
      return;
    }
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
        setGame((current) => ({
          ...current,
          probes,
          obstacles: resolution.state.obstacles,
        }));
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
      activePulseDevices(game).some((device) => samePos(device, target)) ||
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
      resolved = resolveCoreArrivals(game, {
        ...draft,
        phase: "over",
        winner,
        message: winner === "draw" ? "同時到達 — DRAW" : `${playerName(winner)} WIN!`,
        log: [...log, winner === "draw" ? "両機が中央へ到達" : `${playerName(winner)}が爆風で中央へ到達`],
      }, reached);
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
    setPulseFx({ kind: "pulse", target, radius: game.balance?.pulseRadius ?? activeBalance.pulseRadius, nonce: Date.now() });
    window.setTimeout(() => setPulseFx(null), 950);
    if (mode === "online") void submitOnlineAction("switch_pulse", target);
    commit(next);
  };
  const resolveBlast = (target: Pos) => {
    const player = game.pendingSwitches?.[0]?.player ?? game.turn;
    const next = applyBlastSwitch(game, target);
    showSwitchFx("blast", player);
    setPulseFx({ kind: "blast", target, radius: game.balance?.blastRadius ?? activeBalance.blastRadius, nonce: Date.now() });
    window.setTimeout(() => setPulseFx(null), 950);
    if (mode === "online") void submitOnlineAction("switch_blast", target);
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
      if (kind === "shield" || kind === "booster" || kind === "recall" || kind === "gravity") showSwitchFx(kind, game.turn);
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
        if (kind === "blast") resolveBlast({ r, c });
        if (kind === "pulse") resolvePulse({ r, c });
        if (kind === "recall") {
          const meteor = game.meteors.find((entry) => entry.r === r && entry.c === c);
          const holo = activeObstacles(game).find((entry) => entry.r === r && entry.c === c);
          if (meteor ?? holo) resolveRecall((meteor ?? holo)!.id);
        }
      } catch { return; }
    }
  };

  const applyNewGameSettings = async () => {
    getMusicManager().dispatch({ type: "GAME_START" });
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
          ranked: rankedMode,
        });
        setGame(data.state);
        setVariant(data.state.variant ?? "classic");
        setRankedMode(Boolean(data.state.ranked));
        setSize(data.state.size);
        setFirst(data.state.startingPlayer);
        setActiveFirst(data.state.startingPlayer);
        setBlastFx(null);
        setIsAnimating(false);
        setHistory([]);
        setMode("online");
        setNeedsNewGame(false);
        recordedOutcome.current = "";
        recordedRankOutcome.current = "";
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
    recordedRankOutcome.current = "";
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
          rankedMode,
        ),
      );
    }
  };

  const restartCurrentGame = () => {
    getMusicManager().dispatch({ type: "NEW_GAME" });
    setBlastFx(null);
    setIsAnimating(false);
    setHistory([]);
    recordedOutcome.current = "";
    recordedRankOutcome.current = "";
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
        Boolean(game.ranked),
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
    !activeObstacles(game).some((obstacle) => obstacle.r === r && obstacle.c === c) &&
    !activePulseDevices(game).some((device) => device.r === r && device.c === c);

  const validObstaclePlacement = (r: number, c: number) =>
    validBasePlacement(r, c) &&
    !activeObstacles(game).some((obstacle) =>
      orthogonallyAdjacent(obstacle, { r, c }),
    );
  const validPulsePlacement = (r: number, c: number) =>
    !(r === mid && c === mid) &&
    !activePlayers(game).some((player) => samePos({ r, c }, game.probes[player])) &&
    !game.meteors.some((meteor) => meteor.r === r && meteor.c === c) &&
    !activeObstacles(game).some((obstacle) => obstacle.r === r && obstacle.c === c) &&
    !activePulseDevices(game).some((device) => device.r === r && device.c === c);

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
      : game.phase === "switch" && game.pendingSwitches?.[0]?.kind === "pulse"
      ? validPulsePlacement(r, c)
      : game.phase === "switch" && (game.pendingSwitches?.[0]?.kind === "holo" || game.pendingSwitches?.[0]?.kind === "blast")
      ? !activePlayers(game).some((player) => samePos({ r, c }, game.probes[player]))
      : game.phase === "switch" && game.pendingSwitches?.[0]?.kind === "recall"
      ? (() => {
          const owner = game.pendingSwitches?.[0]?.player ?? game.turn;
          return game.meteors.some((meteor) => meteor.r === r && meteor.c === c && meteor.owner === owner && !meteor.consumable) ||
            activeObstacles(game).some((holo) => holo.r === r && holo.c === c && holo.owner === owner);
        })()
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
        let playerId = window.localStorage.getItem("meteor-race-player-id");
        if (!playerId) {
          playerId = `player:${crypto.randomUUID()}`;
          window.localStorage.setItem("meteor-race-player-id", playerId);
        }
        const response = await fetch(`/api/rooms?code=${encodeURIComponent(online.code)}`, {
          headers: { "x-meteor-player-id": playerId },
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
            playItemSound(remoteItemEffect.kind);
            setSwitchFx({
              kind: remoteItemEffect.kind,
              player: remoteItemEffect.player,
              nonce: Date.now(),
            });
            window.setTimeout(() => setSwitchFx(null), remoteItemEffect.kind === "gravity" ? 1550 : 900);
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
            if ((remoteItemEffect.kind === "blast" || remoteItemEffect.kind === "pulse") && remoteItemEffect.target) {
              setPulseFx({
                kind: remoteItemEffect.kind,
                target: remoteItemEffect.target,
                radius: remoteItemEffect.radius ?? (remoteItemEffect.kind === "blast" ? data.state.balance?.blastRadius : data.state.balance?.pulseRadius) ?? 1,
                nonce: Date.now(),
              });
              window.setTimeout(() => setPulseFx(null), 950);
            }
          }
          setSize(data.state.size);
          setVariant(data.state.variant ?? "classic");
          setRankedMode(Boolean(data.state.ranked));
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
    // 真剣タイマンのレートはサーバー（app/api/rooms/route.ts）が対局終了時に権威的に確定・保存する。
    // ここではその結果を取りに行くだけで、クライアント側では計算しない（devtoolsでの改ざん防止）。
    if (!game.ranked || game.phase !== "over" || !game.winner || mode !== "online") return;
    const key = `${game.turnCount}-${game.log.length}-${game.winner}-${game.finishOrder?.join("-") ?? ""}`;
    if (recordedRankOutcome.current === key) return;
    recordedRankOutcome.current = key;
    void refreshProfile();
  }, [game.ranked, game.phase, game.winner, game.turnCount, game.log.length, game.finishOrder, mode]);

  useEffect(() => {
    if (mode !== "lab" || !aiRunning || game.phase !== "over") return;
    const timer = window.setTimeout(() => {
      const players = activePlayers(game);
      const nextFirst = players[stats.games % players.length];
      setActiveFirst(nextFirst);
      setHistory([]);
      recordedOutcome.current = "";
      recordedRankOutcome.current = "";
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
          Boolean(game.ranked),
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
      } else if (decision.type === "blast") {
        resolveBlast(decision.target);
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
  const canSeeLoadout = (player: Player) => {
    if (game.phase !== "setup") return true;
    if (mode === "online") return online.role === player;
    if (mode === "cpu") return player === "red";
    if (mode === "human") {
      return player === game.turn && !(game.botPlayers ?? []).includes(player);
    }
    return false;
  };
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

  const saveProfile = async () => {
    const playerId = window.localStorage.getItem("meteor-race-player-id") ?? "";
    setProfileStatus("保存中…");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) throw new Error();
      setProfileStatus(profileEmail === "端末内プロフィール" ? "この端末に保存しました" : "アカウントに保存しました");
    } catch {
      setProfileStatus("保存できませんでした");
    }
  };

  const sendContact = async () => {
    if (contactMessage.trim().length < 10) {
      setContactStatus("内容を10文字以上で入力してください");
      return;
    }
    setContactStatus("送信中…");
    const playerId = window.localStorage.getItem("meteor-race-player-id") ?? "";
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
        body: JSON.stringify({
          type: contactType,
          message: contactMessage,
          nickname,
          version: "110",
          roomCode: online.code || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "送信できませんでした");
      setContactMessage("");
      setContactStatus(`送信しました（受付番号 ${data.reference}）`);
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : "送信できませんでした");
    }
  };

  return (
    <main className={`shell variant-${game.variant}${entryStage ? " entry-active" : ""}${switchFx?.kind === "gravity" ? " gravity-active" : ""}${game.ranked ? " ranked-match" : ""}${game.ranked && game.rankedGravityRoundsRemaining === 1 ? " ranked-gravity-warning" : ""}${reducedMotion ? " reduced-motion" : ""}`}>
      {entryStage === "title" && (
        <section className="title-screen" aria-label="METEOR RACE タイトル画面">
          <button className="title-settings" type="button" aria-label="設定を開く" onClick={() => setSettingsOpen(true)}>⚙</button>
          <div className="title-orbit" aria-hidden="true"><i /><i /><b>✦</b></div>
          <div className="title-copy">
            <small>INTERPLANETARY TACTICAL RACE</small>
            <h1>METEOR<br/><span>RACE</span></h1>
            <p>BLAST YOUR WAY TO THE CORE</p>
          </div>
          <nav>
            <button className="title-start" type="button" onClick={() => setEntryStage("rule")}>GAME START <span>▶</span></button>
            <button type="button" onClick={() => setEntryStage("play")}>HOW TO PLAY</button>
            <button type="button" onClick={() => setSettingsOpen(true)}>SETTINGS</button>
          </nav>
          <footer><span>Version 112</span><span>{nickname.trim() || "GUEST PLAYER"} · {rankTier(rankRating)} {rankRating}</span></footer>
          <AdSlot position="title" />
        </section>
      )}
      {entryStage && entryStage !== "title" && (
        <section className={`entry-flow ${rankedOpen ? "rank-open" : "rank-closed"}`} aria-label="対戦準備">
          <button className="title-settings" type="button" aria-label="設定を開く" onClick={() => setSettingsOpen(true)}>⚙</button>
          <header><button type="button" onClick={() => setEntryStage(entryStage === "rule" || entryStage === "play" ? "title" : "rule")}>← BACK</button><div><small>{entryStage === "play" ? "RULE GUIDE" : "GAME START"}</small><b>{entryStage === "play" ? "HOW TO PLAY" : entryStage === "rule" ? "01 / BASIC" : "02 / MATCH SETUP"}</b></div></header>
          {entryStage === "play" && <div className="entry-panel play-guide"><div><small>MISSION</small><h2>COREへ先に到達せよ</h2><p>毎手番、探査機を縦横へ1マス動かし、メテオを置きます。爆風は障害ではなく、探査機を一気に進める推進力です。</p></div><div className="play-guide-grid"><article><b>01</b><strong>MOVE</strong><p>探査機を縦横へ1マス移動。後退よりCOREへ近づく進路を作ります。</p></article><article><b>02</b><strong>PLACE</strong><p>小2個・大1個のメテオを配置。先攻の最初の手番だけ配置できません。</p></article><article><b>03</b><strong>BLAST</strong><p>小は周囲1マス、大は中心ほど強い爆風。自分も相手も押し動かします。</p></article><article><b>GOAL</b><strong>CORE</strong><p>移動・BOOSTER・爆風・GRAVITYのどれで入っても到達です。</p></article></div><button className="entry-confirm" type="button" onClick={() => setEntryStage("rule")}>GAME START</button></div>}
          {entryStage === "rule" && <div className="entry-panel compact-flow"><h2>プレイ方法を選択</h2><p>誰と遊ぶかを選んでください。</p><h3>PLAY STYLE</h3><div className="choice-row three"><button className={setupMode === "cpu" ? "selected" : ""} onClick={() => setSetupMode("cpu")}><strong>SINGLE</strong><span>CPUと対戦</span></button><button className={setupMode === "human" ? "selected" : ""} onClick={() => setSetupMode("human")}><strong>LOCAL</strong><span>同じ端末で対戦</span></button><button className={setupMode === "online" ? "selected" : ""} onClick={() => setSetupMode("online")}><strong>ONLINE</strong><span>通信対戦</span></button></div><button className="entry-confirm" onClick={() => setEntryStage("match")}>次へ</button></div>}
          {entryStage === "match" && <div className="entry-panel compact-flow"><h2>{setupMode === "online" ? "オンライン対戦" : "対戦設定"}</h2><p>{setupMode === "cpu" ? "SINGLE" : setupMode === "human" ? "LOCAL" : "ONLINE"}</p>{setupMode === "online" ? <><h3>ONLINE TYPE</h3><div className="rank-choice"><button className={!rankedMode ? "selected" : ""} onClick={() => setRankedMode(false)}><strong>CASUAL ROOM</strong><span>ホストがルールを自由に設定</span></button><button className={rankedMode ? "selected" : "locked"} disabled={!rankedOpen} onClick={() => { setRankedMode(true); setVariant(isItemVariant(variant) ? "item" : "classic"); setOnlinePlayerCount(2); setOnlineAiCount(0); }}><strong>{rankedOpen ? "真剣タイマン" : "🔒 真剣タイマン受付終了"}</strong><span>{rankedOpen ? "1対1・開催中" : RANKED_SCHEDULE_LABEL}</span></button></div>{rankedMode && <><h3>真剣タイマン ルール</h3><div className="choice-row"><button className={!isItemVariant(variant) ? "selected" : ""} onClick={() => { setVariant("classic"); setSize(9); }}><strong>CLASSIC 真剣タイマン</strong><span>{rankTier(classicRankRating)} {classicRankRating}</span></button><button className={isItemVariant(variant) ? "selected" : ""} onClick={() => { setVariant("item"); setSize(11); }}><strong>ITEM 真剣タイマン</strong><span>{rankTier(itemRankRating)} {itemRankRating}</span></button></div></>}<p className={rankedOpen ? "rank-window open" : "rank-window"}>{rankedMode ? "1対1固定。CLASSICとITEMは別々のレートです。" : "ルーム作成後、ホストがゲーム・盤面・人数・AI数を設定できます。"}</p></> : <><h3>RULE</h3><div className="choice-row"><button className={variant === "classic" || variant === "team" ? "selected" : ""} onClick={() => { setVariant("classic"); setSize(9); }}><strong>CLASSIC</strong><span>メテオ中心の基本ルール</span></button><button className={variant === "item" || variant === "team-item" ? "selected" : ""} onClick={() => { setVariant("item"); setSize(11); }}><strong>ITEM</strong><span>アイテム持ち込み戦</span></button></div><h3>MATCH TYPE</h3><div className="choice-row"><button className={!isTeamVariant(variant) ? "selected" : ""} onClick={() => { setVariant(isItemVariant(variant) ? "item" : "classic"); setSize(isItemVariant(variant) ? 11 : 9); }}><strong>FREE FOR ALL</strong><span>個人戦</span></button><button className={isTeamVariant(variant) ? "selected" : ""} onClick={() => { setVariant(isItemVariant(variant) ? "team-item" : "team"); setSize(13); setAiPlayerCount(4); setLocalAiCount(2); }}><strong>2 VS 2</strong><span>チーム戦</span></button></div><div className="entry-settings"><label>BOARD SIZE<select value={size} onChange={(event) => setSize(Number(event.target.value))}>{(isTeamVariant(variant) ? [13,15] : variant === "classic" ? [9,11] : [11,13,15]).map((boardSize) => <option key={boardSize} value={boardSize}>{boardSize} × {boardSize}</option>)}</select></label><div className="cpu-stepper"><span>{setupMode === "cpu" ? "PLAYERS" : "CPU ADD"}</span><button disabled={isTeamVariant(variant)} onClick={() => setupMode === "cpu" ? setAiPlayerCount((Math.max(2, aiPlayerCount - 1) as 2|3|4)) : setLocalAiCount((Math.max(0, localAiCount - 1) as 0|1|2))}>−</button><b>{isTeamVariant(variant) && setupMode === "cpu" ? 4 : setupMode === "cpu" ? aiPlayerCount : localAiCount}</b><button disabled={isTeamVariant(variant)} onClick={() => setupMode === "cpu" ? setAiPlayerCount((Math.min(4, aiPlayerCount + 1) as 2|3|4)) : setLocalAiCount((Math.min(2, localAiCount + 1) as 0|1|2))}>＋</button></div>{(setupMode !== "human" || localAiCount > 0) && <label>AI LEVEL<select value={aiDifficulty} onChange={(event) => setAiDifficulty(event.target.value as AiDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>}</div></>}<button className="entry-confirm" onClick={() => { applyNewGameSettings(); setEntryStage(null); window.setTimeout(() => (setupMode === "online" ? document.getElementById("match-setup") : document.querySelector(".topbar"))?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }), 30); }}>{setupMode === "online" ? "ONLINE LOBBYへ" : "BATTLE START"}</button></div>}
          <footer><span>RULE + PLAY STYLE</span><i /><span>MATCH SETUP</span></footer>
        </section>
      )}
      <header className="topbar">
        <button className="game-back" type="button" onClick={() => setEntryStage("rule")}>← 戻る</button>
        <div className="brand">
          <span className="brand-mark">✦</span>
          <div>
            <h1>METEOR RACE</h1>
            <p>BLAST YOUR WAY TO THE CORE</p>
          </div>
        </div>
        <div className="round">
          ROUND {Math.floor(game.turnCount / activePlayers(game).length) + 1}
          {game.ranked && <><b>真剣タイマン · {rankTier(rankRating)} {rankRating}</b><em>GRAVITY IN {game.rankedGravityRoundsRemaining ?? balance.rankedGravityRounds} ROUNDS</em></>}
        </div>
        <button className="settings-gear" type="button" aria-label="設定を開く" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>⚙</button>
      </header>

      {settingsOpen && (
        <div className="settings-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label="設定">
            <header><div><small>METEOR RACE</small><h2>SETTINGS</h2></div><button type="button" aria-label="設定を閉じる" onClick={() => setSettingsOpen(false)}>×</button></header>
            <section>
              <h3>ACCOUNT</h3>
              <label>ニックネーム<input maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="PLAYER" /></label>
              <button className="profile-save" type="button" onClick={() => void saveProfile()}>プロフィールを保存</button>
              <p role="status">{profileStatus}</p>
              <dl><div><dt>メールアドレス</dt><dd>{profileEmail}</dd></div><div><dt>PLAYER ID</dt><dd>{publicPlayerId}<button type="button" onClick={() => void navigator.clipboard?.writeText(publicPlayerId)}>COPY</button></dd></div></dl>
              <p>メールアドレスと内部IDは他のプレイヤーへ表示されません。対戦中のニックネーム変更は次の試合から反映されます。</p>
            </section>
            <section>
              <h3>SOUND</h3>
              <label>全体音量 <b>{masterVolume}</b><input type="range" min="0" max="100" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /></label>
              <label>BGM <b>{bgmVolume}</b><input type="range" min="0" max="100" value={bgmVolume} onChange={(event) => setBgmVolume(Number(event.target.value))} /></label>
              <label>効果音 <b>{sfxVolume}</b><input type="range" min="0" max="100" value={sfxVolume} onChange={(event) => setSfxVolume(Number(event.target.value))} /></label>
              <button type="button" className={soundEnabled ? "drawer-toggle active" : "drawer-toggle"} onClick={() => setSoundEnabled((value) => !value)}>一括ミュート {soundEnabled ? "OFF" : "ON"}</button>
              <label>BATTLE MUSIC
                <select value={battleTrack} onChange={(event) => setBattleTrack(event.target.value as BattleTrackChoice)}>
                  {Object.entries(BATTLE_TRACK_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  <option value="random">RANDOM</option>
                </select>
              </label>
            </section>
            <section>
              <h3>DISPLAY</h3>
              <button type="button" className={reducedMotion ? "drawer-toggle active" : "drawer-toggle"} onClick={() => setReducedMotion((value) => !value)}>演出短縮 {reducedMotion ? "ON" : "OFF"}</button>
            </section>
            <AdSlot position="settings" />
            <section>
              <h3>CONTACT</h3>
              <select value={contactType} onChange={(event) => setContactType(event.target.value)}><option>不具合報告</option><option>ご意見・要望</option><option>アカウントについて</option><option>その他</option></select>
              <textarea maxLength={1200} value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} placeholder="内容を入力してください" />
              <button type="button" className="contact-send" onClick={() => void sendContact()}>送信する</button>
              {contactStatus && <p role="status">{contactStatus}</p>}
              <nav><button type="button" onClick={() => { setSettingsOpen(false); setEntryStage("play"); }}>ルールガイド</button><button type="button" onClick={() => { setSettingsOpen(false); setEntryStage("rule"); }}>対戦設定</button><span>Version 112</span></nav>
            </section>
          </aside>
        </div>
      )}

      <section className="game-layout">
        <aside className={`player-card red-card ${(game.phase === "over" ? game.winner === "red" : game.turn === "red") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("red", 1)}</span>
          <h2>RED</h2>
          <ProbeIcon color="red" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.red} color="red" items={canSeeLoadout("red") ? game.itemHands?.red ?? [] : []} loadoutHidden={!canSeeLoadout("red")} />
        </aside>

        <section className="arena">
          {switchFx && (
            <div key={switchFx.nonce} className={`switch-activation ${switchFx.kind} ${switchFx.player}`} role="status">
              <span className="switch-burst" />
              {switchFx.kind === "gravity" && <span className="gravity-well"><i /><i /><i /></span>}
              <b>{switchFx.kind.toUpperCase()}</b>
              <small>{switchFx.kind === "gravity" ? "GRAVITATIONAL PULL" : "ITEM ACTIVATED"}</small>
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
          {game.phase === "setup" && isItemVariant(game.variant) && (
            <div className="item-selection-overlay" aria-live="polite">
              <header><small>LOADOUT PREVIEW</small><strong>選択したアイテム</strong></header>
              <div className={`item-preview-flags count-${Math.min(3, game.itemHands?.[setupPlayer]?.length ?? 0)}`}>
                {(game.itemHands?.[setupPlayer] ?? []).length === 0 && <p>下のアイテムを選ぶと、ここに使用イメージと説明が追加されます。</p>}
                {(game.itemHands?.[setupPlayer] ?? []).map((kind, index) => {
                  const facts = itemEffectFacts(kind, game.balance ?? activeBalance);
                  return (
                    <article className={`item-preview-flag ${kind}`} key={`${kind}-${index}`}>
                      <header><ItemIcon kind={kind} /><b>{kind.toUpperCase()}</b></header>
                      <div className="item-preview-spec" aria-label={`${kind}の効果情報`}>
                        <strong>{ITEM_DEMO_LABELS[kind]}</strong>
                        <span>{facts[0]}</span>
                        <small>{facts[1]}</small>
                      </div>
                      <p>{itemDetail(kind, game.balance ?? activeBalance)}</p>
                      <em>{index + 1}</em>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
          <div
            className={`board turn-${displayAccent}${game.phase === "setup" && isItemVariant(game.variant) ? " item-selection-dim" : ""}`}
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
              const probe =
                activePlayers(game).find((player) => samePos(pos, game.probes[player])) ?? null;
              const meteor = game.meteors.find((m) => samePos(m, pos));
              const obstacle = activeObstacles(game).find((item) => samePos(item, pos));
              const pulseDevice = (game.pulseDevices ?? []).find((item) => samePos(item, pos));
              const pulseField = activePulseDevices(game).find((device) => distance(device, pos) <= (game.balance?.pulseRadius ?? activeBalance.pulseRadius));
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
                  aria-label={`座標 ${r},${c}${probe ? ` ${playerName(probe)}探査機` : ""}${meteor ? ` ${meteorName(meteor.size)}` : ""}${obstacle ? " お邪魔メテオ" : ""}${pulseDevice ? " 電磁パルス発生装置" : ""}`}
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
                  {pulseFx && distance(pos, pulseFx.target) <= pulseFx.radius && (
                    <span
                      key={`${pulseFx.nonce}-${r}-${c}`}
                      className={`${pulseFx.kind === "blast" ? "blast-effect-cell" : "pulse-blast-cell"}${samePos(pos, pulseFx.target) ? " origin" : ""}`}
                      style={{ "--pulse-ring": distance(pos, pulseFx.target) } as React.CSSProperties}
                    >
                      <i /><i /><i />
                    </span>
                  )}
                  {pulseField && (
                    <span className="pulse-field-cell" style={{ "--pulse-ring": distance(pos, pulseField) } as React.CSSProperties} />
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
                      roundsLeft={obstacle.turns === -1 ? -1 : Math.max(1, Math.ceil((obstacle.turns ?? 1) / activePlayers(game).length))}
                    />
                  )}
                  {pulseDevice && <PulseDeviceIcon device={pulseDevice} roundsLeft={Math.max(1, Math.ceil(pulseDevice.turns / activePlayers(game).length))} />}
                  {probe && (
                    <ProbeToken
                      player={probe}
                      teamMode={isTeamVariant(game.variant)}
                      isSelf={probe === selfPlayer}
                      shieldTurns={game.shieldTurns?.[probe] ?? 0}
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
                <span className="action-label">アイテムを{balance.itemHandTotal}個選択（同じ種類は{balance.itemSameMax}個まで）</span>
                {(["shield", "booster", "holo", "orbit", "blast", "pulse", "recall"] as ItemKind[]).map((kind) => (
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
              <>
                {(game.finishOrder?.length ?? 0) > 0 && (
                  <ol className="finish-ranking" aria-label="最終順位">
                    {game.finishOrder?.map((player, index) => (
                      <li key={player} className={player}>
                        <b>{index + 1}位</b><span>{playerName(player)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                <button
                  className="primary-action"
                  onClick={mode === "online" ? rematchOnlineRoom : restartCurrentGame}
                  disabled={mode === "online" && online.pending}
                >
                  同じメンバーでもう一度
                </button>
                <AdSlot position="result" />
              </>
            )}
          </div>
        </section>

        <aside className={`player-card blue-card ${(game.phase === "over" ? game.winner === "blue" : game.turn === "blue") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("blue", 2)}</span>
          <h2>BLUE</h2>
          <ProbeIcon color="blue" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.blue} color="blue" items={canSeeLoadout("blue") ? game.itemHands?.blue ?? [] : []} loadoutHidden={!canSeeLoadout("blue")} />
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
              <InventoryPanel inventory={game.inventory[player]} color={player} items={canSeeLoadout(player) ? game.itemHands?.[player] ?? [] : []} loadoutHidden={!canSeeLoadout(player)} />
            </aside>
          ))}
        </section>
      )}

      <section className="control-strip" id="match-setup">
        <div className={`settings in-game-settings ${mode === "online" && !rankedMode ? "casual-host-settings" : ""}`}>
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
          <label className="ranked-setting">
            真剣タイマン
            <button
              type="button"
              className={rankedMode ? "selected" : ""}
              aria-pressed={rankedMode}
              disabled={roomSettingsLocked}
              onClick={() => {
                setRankedMode((current) => !current);
                setNeedsNewGame(true);
              }}
            >
              {rankedMode ? "ON" : "OFF"}
            </button>
          </label>
          <label className="mode-setting">
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
            変更内容は次の対戦開始時に反映されます。
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
            {online.code && online.isHost && !rankedMode && (
              <button type="button" className="apply-room-settings" onClick={applyNewGameSettings} disabled={online.pending}>
                ルーム設定を適用して対戦開始
              </button>
            )}
            {online.code && online.isHost && rankedMode && (
              <button type="button" className="apply-room-settings ranked" onClick={applyNewGameSettings} disabled={online.pending || online.joinedPlayers < 2}>
                {online.joinedPlayers < 2 ? "対戦相手を待っています" : `${isItemVariant(variant) ? "ITEM" : "CLASSIC"} 真剣タイマンを開始`}
              </button>
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
        <details className="ai-lab-panel">
          <summary><span>AI STRATEGY LAB</span><strong>{strategicRead}</strong><small>OPEN DEBUG DATA</small></summary>
          <section className="ai-lab">
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
        </details>
        <details className="rules" id="rules">
          <summary>HOW TO PLAY</summary>
          <div className="rule-grid">
            <p><b>MOVE</b> 縦横へ必ず1マス。移動不能時だけ省略できます。</p>
            <p><b>PLACE</b> 先攻初手を除き、移動後にメテオを1個配置。配置パスは各色1回です。</p>
            <p><b>BLAST</b> 小は周囲を1マス、大は近距離2・遠距離1マス吹き飛ばします。</p>
            <p><b>WIN</b> 移動または爆風で中央のCOREへ入れば勝利です。</p>
            <p><b>TEAM</b> 13×13または15×15。RED＋YELLOW対BLUE＋GREENです。</p>
            <p><b>ITEM</b> 対戦前に{balance.itemHandTotal}個を選択。同じ種類は{balance.itemSameMax}個まで持ち込めます。</p>
            <p>BOOSTER / SHIELD / HOLO / ORBIT / BLAST / PULSE / RECALL。移動後、メテオ配置の代わりに1個使用します。</p>
            <p><b>真剣タイマン</b> 1対1専用のガチ対戦。毎日8:00–9:00と20:00–21:00（日本時間）のみ参加できます。5巡ごとにORBITAL GRAVITYが発動します。レートはサーバー側で管理され、途中退出すると減点されます。</p>
            <p><b>RANK</b> IRON → BRONZE → SILVER → GOLD → PLATINUM → DIAMOND → ORBIT。順位とTEAM勝敗でレートが増減します。</p>
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
  blast: "✹",
  pulse: "ϟ",
  recall: "↩",
  gravity: "◎",
};

const ITEM_DETAILS: Record<ItemKind, string> = {
  shield: "次に受ける爆風を防ぐ防御フィールド。自分の爆風も無効になります。",
  booster: "縦横へ最大2マス前進。途中のメテオを飛び越えてCOREへ到達できます。",
  holo: "2巡残るホロメテオを配置し、相手の進路を封鎖します。",
  orbit: "選んだリングを90度回転させ、盤上の配置をまとめて動かします。",
  blast: "指定地点に回収効果のないメテオ爆風を発生させます。",
  pulse: "装置を置き、2巡のあいだ周囲の自力移動を封じます。",
  recall: "自分の通常メテオをすべて回収し、ホロメテオを消去します。",
  gravity: "全探査機をCORE方向へ1マス引き寄せます。",
};

function itemDetail(kind: ItemKind, balance: BalanceConfig): string {
  switch (kind) {
    case "shield": return `${balance.shieldRounds}巡の間、次に受ける爆風を防ぎます。自分の爆風も無効になります。`;
    case "booster": return `縦横へ最大2マス進める効果を${balance.boosterUses}回使えます。途中のメテオやお邪魔メテオを飛び越えてCOREへ到達できます（PULSEデバイスは飛び越えられません）。2マス移動で実際に使うまで効果は持続します。`;
    case "holo": return balance.holoUnlimited
      ? "消滅しないホロメテオを配置し、相手の進路を妨害します。"
      : `${balance.holoRounds}巡残るホロメテオを配置し、相手の進路を妨害します。`;
    case "blast": return `指定地点と外周${balance.blastRadius}マスに、回収効果のないメテオ爆風を発生させます。`;
    case "pulse": return `装置を置き、外周${balance.pulseRadius}マス以内の自力移動を2巡封じます。`;
    case "gravity": return `${balance.rankedGravityRounds}巡ごとに、全探査機をCORE方向へ1マス引き寄せます。`;
    default: return ITEM_DETAILS[kind];
  }
}

const ITEM_DEMO_LABELS: Record<ItemKind, string> = {
  shield: "BLAST BLOCKED",
  booster: "2-MASS SELECT",
  holo: "BLOCK 2 ROUNDS",
  orbit: "RING ROTATE 90°",
  blast: "AREA BLAST",
  pulse: "MOVE LOCK 2 ROUNDS",
  recall: "ALL METEORS RETURN",
  gravity: "PULL TO CORE",
};

function itemEffectFacts(kind: ItemKind, balance: BalanceConfig): [string, string] {
  switch (kind) {
    case "shield": return [`有効：${balance.shieldRounds}巡`, "敵と自分の爆風を無効化"];
    case "booster": return [`使用：${balance.boosterUses}回`, "縦横2マス進みメテオを飛び越える"];
    case "holo": return [balance.holoUnlimited ? "残存：無制限" : `残存：${balance.holoRounds}巡`, "破壊不能の障害物として設置"];
    case "orbit": return ["回転：90度", "選択したリング上の配置を移動"];
    case "blast": return [`範囲：中心＋外周${balance.blastRadius}マス`, "爆風だけを指定地点に発生"];
    case "pulse": return [`範囲：中心＋外周${balance.pulseRadius}マス`, "2巡の間、自力移動を封じる"];
    case "recall": return ["対象：自分の全メテオ", "通常は回収、ホロは消滅"];
    case "gravity": return [`周期：${balance.rankedGravityRounds}巡`, "盤上の全探査機をCORE方向へ1マス移動"];
  }
}

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
  shieldTurns = 0,
  boost = 0,
}: {
  player: Player;
  rotation: number;
  push?: { from: Pos; dr: number; dc: number };
  teamMode?: boolean;
  isSelf?: boolean;
  shieldTurns?: number;
  boost?: number;
}) {
  return (
    <span
      className={`probe-motion ${player}${teamMode ? ` team-${teamOf(player)}` : ""}${isSelf ? " is-self" : ""}${push ? " blast-lift" : ""}`}
      style={
        push
          ? ({
              "--push-x": `${push.dc * 147}%`,
              "--push-y": `${push.dr * 147}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      {(shieldTurns > 0 || boost > 0) && (
        <span className="probe-effects" aria-label={`${shieldTurns > 0 ? `シールド${shieldTurns} ` : ""}${boost > 0 ? `ブースト${boost}` : ""}`}>
          {shieldTurns > 0 && <span className="shield-effect"><b>{shieldTurns}</b></span>}
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
  const roundsLabel = roundsLeft === -1 ? "∞" : String(roundsLeft);
  return (
    <span className={`obstacle-token ${obstacle.owner}`} title={roundsLeft === -1 ? "破壊不能のホロメテオ・無制限" : `ホロメテオ・残り${roundsLeft}巡（爆風で短縮）`}>
      <i />
      <b>{roundsLabel}</b>
      <small>巡</small>
    </span>
  );
}

function PulseDeviceIcon({ device, roundsLeft }: { device: PulseDevice; roundsLeft: number }) {
  return (
    <span className={`pulse-device ${device.owner}`} title={`PULSE発生装置・残り${roundsLeft}巡`}>
      <i /><b>PULSE</b><small>{roundsLeft}</small>
    </span>
  );
}

function InventoryPanel({
  inventory,
  color,
  items,
  loadoutHidden = false,
}: {
  inventory: Record<MeteorSize, number>;
  color: Player;
  items: ItemKind[];
  loadoutHidden?: boolean;
}) {
  const itemCounts = (["shield", "booster", "holo", "orbit", "blast", "pulse", "recall"] as ItemKind[])
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
      {loadoutHidden && (
        <div className="loadout-hidden" aria-label="アイテム構成は戦闘開始まで非公開">
          <i>◆</i>
          <small>LOADOUT</small>
          <b>SECRET</b>
        </div>
      )}
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
