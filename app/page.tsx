"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AdSlot } from "./components/ad-slot";
import { getMusicManager, type BattleTrackChoice, BATTLE_TRACK_LABELS } from "./music-engine";
import { rankTier } from "./duel-rating";
import { playBoom as playBoomSfx, playItemSound as playItemSoundSfx } from "./sfx";
import { useLocalSettings } from "./hooks/use-local-settings";
import { useProfile } from "./hooks/use-profile";
import { useMusicSync } from "./hooks/use-music-sync";
import { useSiteTheme } from "./hooks/use-site-theme";
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
  rematchPlayerCount,
  resetSetupItems,
  samePos,
  teamOf,
  viewToBoardPos,
  type GameState,
  type GameVariant,
  type ItemKind,
  type MeteorSize,
  type Player,
  type Pos,
} from "./game-rules";
import { chooseAiDecision, type AiDifficulty } from "./ai-engine";
import { DEFAULT_BALANCE, normalizeBalance, type BalanceConfig } from "./balance-config";
import { ITEM_ICONS, SELECTABLE_ITEMS, itemDetail, itemEffectFacts } from "./item-content";
import { isRankedOpen, RANKED_SCHEDULE_LABEL } from "./ranked-schedule";
import { APP_VERSION, APP_VERSION_LABEL } from "./version";
import { uiFormat, uiText } from "./i18n";
import { UI_BEHAVIOR } from "../config/ui-behavior";
import { gameStatusText } from "./game-status";
import { getOrCreatePlayerId, playerRequestHeaders } from "./client-identity";
import {
  STRONG_PLAY_MAX_PER_MATCH,
  detectStrongPlay,
  type StrongPlayCandidate,
} from "./strong-play";
import { COMMUNITY_SAFETY } from "../config/community-safety";
import { ITEM_LORE } from "../config/item-lore";
import {
  ITEM_DEMO_LABELS,
  InventoryPanel,
  ItemIcon,
  MeteorIcon,
  ObstacleIcon,
  ProbeIcon,
  ProbeToken,
  PulseDeviceIcon,
} from "./components/game-pieces";

type Mode = "human" | "cpu" | "lab" | "online";
type BlastFx = {
  stage: "probe" | "recover" | "settle";
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
  pushed?: BlastFx["pushed"];
};

function pushForPerspective(
  push: { from: Pos; dr: number; dc: number },
  perspectiveSlot: number,
) {
  const delta = boardToViewDelta({ r: push.dr, c: push.dc }, perspectiveSlot);
  return { ...push, dr: delta.r, dc: delta.c };
}

function pushedProbesBetween(before: GameState, after: GameState): BlastFx["pushed"] {
  return Object.fromEntries(
    activePlayers(before)
      .filter((player) => !samePos(before.probes[player], after.probes[player]))
      .map((player) => [player, {
        from: before.probes[player],
        dr: after.probes[player].r - before.probes[player].r,
        dc: after.probes[player].c - before.probes[player].c,
      }]),
  );
}

type OnlineRoom = {
  code: string;
  role: Player | null;
  status: "idle" | "waiting" | "playing" | "finished";
  version: number;
  maxPlayers: number;
  joinedPlayers: number;
  roomCount?: number;
  spectatorCount?: number;
  memberNames: string[];
  memberRoles: Array<Player | null>;
  error: string;
  pending: boolean;
  isHost: boolean;
  joinLocked?: boolean;
};

type ChatMessage = { id: string; nickname: string; message: string; createdAt: number };
const QUICK_CHAT_MESSAGES = COMMUNITY_SAFETY.quickChatMessages;


function Game() {
  useSiteTheme();
  const [entryStage, setEntryStage] = useState<"title" | "rule" | "play" | "match" | "setup" | null>("title");
  const [size, setSize] = useState(9);
  const [first, setFirst] = useState<Player>("red");
  const [variant, setVariant] = useState<GameVariant>("classic");
  const [rankedMode, setRankedMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [game, setGame] = useState<GameState>(() => initialState(9, "red"));
  const [activeBalance, setActiveBalance] = useState<BalanceConfig>(DEFAULT_BALANCE);
  const [mode, setMode] = useState<Mode>("human");
  const [setupMode, setSetupMode] = useState<Mode>("human");
  const [needsNewGame, setNeedsNewGame] = useState(false);
  const [activeFirst, setActiveFirst] = useState<Player>("red");
  const [aiPlayerCount, setAiPlayerCount] = useState<2 | 3 | 4>(2);
  const [localAiCount, setLocalAiCount] = useState<0 | 1 | 2>(0);
  const [aiRunning, setAiRunning] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPage, setManualPage] = useState<"rules" | "world">("rules");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMuted, setChatMuted] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);
  const {
    nickname, setNickname,
    masterVolume, setMasterVolume,
    bgmVolume, setBgmVolume,
    sfxVolume, setSfxVolume,
    reducedMotion,
    battleTrack, setBattleTrack,
    language, setLanguage,
    strongPlaySharing, setStrongPlaySharing,
  } = useLocalSettings();
  const t = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
  const tf = (key: Parameters<typeof uiText>[1], values: Record<string, string | number>) =>
    uiFormat(language, key, values);
  const displayGameMessage = gameStatusText(game, language);
  const [contactType, setContactType] = useState("不具合報告");
  const [contactMessage, setContactMessage] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [proposalName, setProposalName] = useState("");
  const [proposalEffect, setProposalEffect] = useState("");
  const [proposalReason, setProposalReason] = useState("");
  const [proposalLimit, setProposalLimit] = useState("");
  const [proposalCredit, setProposalCredit] = useState("");
  const [proposalCreditAllowed, setProposalCreditAllowed] = useState(false);
  const [proposalStatus, setProposalStatus] = useState("");
  const [obstaclesEnabled, setObstaclesEnabled] = useState(false);
  const [aiSpeed, setAiSpeed] = useState<number>(UI_BEHAVIOR.aiDefaultDelayMs);
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
  useEffect(() => {
    if (!settingsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    settingsTriggerRef.current = previousFocus;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const overlay = document.querySelector<HTMLElement>(".settings-overlay");
    const background = overlay
      ? Array.from(overlay.parentElement?.children ?? []).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay)
      : [];
    background.forEach((node) => {
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });
    window.setTimeout(() => settingsCloseRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      background.forEach((node) => {
        node.removeAttribute("inert");
        node.removeAttribute("aria-hidden");
      });
      (settingsTriggerRef.current ?? previousFocus)?.focus();
    };
  }, [settingsOpen]);
  const rankedOpen = isRankedOpen(new Date(currentTime));
  useEffect(() => { if (!rankedOpen) setRankedMode(false); }, [rankedOpen]);
  const {
    publicPlayerId,
    profileStatus, setProfileStatus,
    classicRankRating, itemRankRating, refreshProfile,
  } = useProfile(setNickname);
  const rankRating = isItemVariant(variant) ? itemRankRating : classicRankRating;
  const regulaCore = { r: Math.floor(game.size / 2), c: Math.floor(game.size / 2) };
  const regulaClosestDistance = Math.min(...activePlayers(game).map((player) => distance(game.probes[player], regulaCore)));
  const regulaProgress = game.phase === "over" ? 100 : Math.max(0, Math.min(99, Math.round((1 - regulaClosestDistance / Math.max(1, game.size - 1)) * 100)));
  useEffect(() => {
    fetch("/api/balance", { cache: "no-store" })
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
  const previousStrongPlayState = useRef<GameState | null>(null);
  const strongPlayCandidates = useRef<StrongPlayCandidate[]>([]);
  const strongPlaySignatures = useRef(new Set<string>());
  const recordedStrongPlayOutcome = useRef("");
  const playedRankedGravity = useRef(0);
  const playedOnlineEffect = useRef(0);
  const playedOnlineItemEffect = useRef(0);
  const mid = Math.floor(game.size / 2);
  const moves = useMemo(() => legalMoves(game), [game]);
  const balance = normalizeBalance(game.balance);
  const onlineLobbyOnly = mode === "online" && (online.status === "idle" || online.status === "waiting");
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
  useEffect(() => {
    const before = previousStrongPlayState.current;
    previousStrongPlayState.current = game;
    if (!before) return;
    if (game.turnCount < before.turnCount || (before.phase === "over" && game.phase !== "over")) {
      strongPlayCandidates.current = [];
      strongPlaySignatures.current.clear();
      recordedStrongPlayOutcome.current = "";
      return;
    }
    const bots = game.botPlayers ?? [];
    const eligible = strongPlaySharing && mode !== "lab" && bots.length > 0 &&
      (mode !== "online" || online.isHost);
    if (!eligible) return;
    const candidate = detectStrongPlay(before, game);
    if (candidate && !bots.includes(candidate.actor)) {
      const signature = [
        candidate.actor, candidate.category, candidate.after.turnCount,
        candidate.after.phase, candidate.after.meteors.length,
        candidate.after.probes[candidate.actor].r, candidate.after.probes[candidate.actor].c,
      ].join(":");
      if (!strongPlaySignatures.current.has(signature)) {
        strongPlaySignatures.current.add(signature);
        strongPlayCandidates.current = [...strongPlayCandidates.current, candidate]
          .sort((left, right) => right.score - left.score)
          .slice(0, 24);
      }
    }
    if (game.phase !== "over" || !game.winner || game.winner === "draw") return;
    const outcomeKey = `${game.startingPlayer}-${game.turnCount}-${game.winner}-${game.log.length}`;
    if (recordedStrongPlayOutcome.current === outcomeKey) return;
    recordedStrongPlayOutcome.current = outcomeKey;
    const winner = game.winner as Player;
    const winningPlays = strongPlayCandidates.current
      .filter((play) => play.actor === winner ||
        (isTeamVariant(game.variant) && teamOf(play.actor) === teamOf(winner)))
      .slice(0, STRONG_PLAY_MAX_PER_MATCH);
    if (!winningPlays.length) return;
    void fetch("/api/strong-plays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        schemaVersion: 1,
        appVersion: APP_VERSION,
        difficulty: aiDifficulty,
        variant: game.variant,
        boardSize: game.size,
        playerCount: activePlayers(game).length,
        winner,
        turnCount: game.turnCount,
        plays: winningPlays,
      }),
    }).catch(() => undefined);
  }, [game, mode, aiDifficulty, strongPlaySharing, online.isHost]);
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
      headers: playerRequestHeaders(true),
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
      setOnline({
        code: data.code,
        role: data.role,
        status: data.status,
        version: data.version,
        maxPlayers: data.maxPlayers,
        joinedPlayers: data.joinedPlayers,
        roomCount: data.roomCount,
        spectatorCount: data.spectatorCount,
        memberNames: data.memberNames ?? [],
        memberRoles: data.memberRoles ?? [],
        error: "",
        pending: false,
        isHost: Boolean(data.isHost),
        joinLocked: Boolean(data.joinLocked),
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
      setOnline({
        code: data.code,
        role: data.role,
        status: data.status,
        version: data.version,
        maxPlayers: data.maxPlayers,
        joinedPlayers: data.joinedPlayers,
        roomCount: data.roomCount,
        spectatorCount: data.spectatorCount,
        memberNames: data.memberNames ?? [],
        memberRoles: data.memberRoles ?? [],
        error: "",
        pending: false,
        isHost: Boolean(data.isHost),
        joinLocked: Boolean(data.joinLocked),
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
    } catch {
      // Local navigation must still succeed when the room server is unavailable.
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
        joinLocked: false,
      });
      setRoomCodeInput("");
      setNeedsNewGame(true);
      setSetupMode("online");
      setEntryStage("rule");
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
      setBlastFx(null);
      setSwitchFx(null);
      setOrbitFx(null);
      setPulseFx(null);
      setSelectedOrbitRing(null);
      setHoveredOrbitRing(null);
      setIsAnimating(false);
      setNeedsNewGame(false);
      recordedOutcome.current = "";
      recordedRankOutcome.current = "";
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
    setGame(next);
  };

  const returnOnlineLobby = async () => {
    if (!online.code || !online.isHost) return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({ action: "return_lobby", code: online.code });
      setOnline((current) => ({ ...current, ...data, pending: false, error: "" }));
      setNeedsNewGame(true);
    } catch (error) {
      setOnline((current) => ({ ...current, pending: false, error: error instanceof Error ? error.message : "待機ルームへ戻れませんでした" }));
    }
  };

  const manageRoomMember = async (targetIndex: number, memberAction: "seat" | "spectate" | "kick", targetRole?: Player) => {
    if (!online.code || !online.isHost) return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({ action: "manage_member", code: online.code, targetIndex, memberAction, targetRole });
      setOnline((current) => ({ ...current, ...data, pending: false, error: "" }));
      setOnlinePlayerCount(Math.max(1, data.joinedPlayers) as 1 | 2 | 3 | 4);
      setNeedsNewGame(true);
    } catch (error) {
      setOnline((current) => ({ ...current, pending: false, error: error instanceof Error ? error.message : "メンバーを変更できませんでした" }));
    }
  };

  const setRoomTeamMode = async (enabled: boolean) => {
    const nextVariant: GameVariant = enabled ? (isItemVariant(variant) ? "team-item" : "team") : (isItemVariant(variant) ? "item" : "classic");
    setVariant(nextVariant);
    if (enabled) setSize((current) => current === 15 ? 15 : 13);
    else if (size === 13 || size === 15) setSize(isItemVariant(nextVariant) ? 11 : 9);
    setNeedsNewGame(true);
    if (!online.code || !online.isHost) return;
    try {
      const data = await roomRequest({ action: "assign_teams", code: online.code, teamEnabled: enabled });
      setOnline((current) => ({ ...current, ...data, pending: false, error: "" }));
      setOnlinePlayerCount(Math.max(1, data.joinedPlayers) as 1 | 2 | 3 | 4);
    } catch (error) {
      setOnline((current) => ({ ...current, error: error instanceof Error ? error.message : "チームを変更できませんでした" }));
    }
  };

  const toggleRoomItemMode = () => {
    const enabled = !isItemVariant(variant);
    setVariant(isTeamVariant(variant) ? (enabled ? "team-item" : "team") : (enabled ? "item" : "classic"));
    if (enabled && size === 9) setSize(11);
    if (!enabled && !isTeamVariant(variant) && size > 11) setSize(9);
    setNeedsNewGame(true);
  };

  const swapOwnRole = async (targetRole: Player) => {
    if (!online.code || !online.role || targetRole === online.role) return;
    try {
      const data = await roomRequest({ action: "swap_role", code: online.code, targetRole });
      setOnline((current) => ({ ...current, ...data, pending: false, error: "" }));
    } catch (error) {
      setOnline((current) => ({ ...current, error: error instanceof Error ? error.message : "座席を入れ替えできませんでした" }));
    }
  };

  const toggleRoomLock = async () => {
    if (!online.code || !online.isHost || online.status !== "waiting") return;
    setOnline((current) => ({ ...current, pending: true, error: "" }));
    try {
      const data = await roomRequest({ action: "toggle_lock", code: online.code, locked: !online.joinLocked });
      setGame(data.state);
      setOnline((current) => ({ ...current, version: data.version, joinLocked: Boolean(data.joinLocked), pending: false }));
    } catch (error) {
      setOnline((current) => ({ ...current, pending: false, error: error instanceof Error ? error.message : "参加受付を変更できませんでした" }));
    }
  };

  const sendChat = async (message: string) => {
    if (!online.code || chatPending || chatMuted) return;
    const normalizedMessage = message.replace(/\s+/g, " ").trim();
    if (!normalizedMessage || normalizedMessage.length > 80) return;
    setChatPending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: playerRequestHeaders(true),
        body: JSON.stringify({ code: online.code, nickname: ownDisplayName || nickname || "PLAYER", message: normalizedMessage }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "送信できませんでした");
      setChatMessages((current) => [...current.filter((item) => item.id !== data.message.id), data.message].slice(-40));
      setChatDraft("");
    } catch (error) {
      setOnline((current) => ({ ...current, error: error instanceof Error ? error.message : "チャットを送信できませんでした" }));
    } finally {
      setChatPending(false);
    }
  };

  const sendQuickChat = (message: typeof QUICK_CHAT_MESSAGES[number]) => sendChat(message);

  const playBoom = useCallback(
    () => playBoomSfx(soundEnabled, masterVolume, sfxVolume),
    [soundEnabled, masterVolume, sfxVolume],
  );

  const playItemSound = useCallback((kind: ItemKind) => {
    if (soundEnabled) getMusicManager().dispatch({ type: "ITEM_GET", kind });
    playItemSoundSfx(kind, soundEnabled, masterVolume, sfxVolume);
  }, [soundEnabled, masterVolume, sfxVolume]);

  const showSwitchFx = useCallback((kind: ItemKind, player: Player) => {
    playItemSound(kind);
    setSwitchFx({ kind, player, nonce: Date.now() });
    window.setTimeout(() => setSwitchFx((current) => current?.kind === kind && current.player === player ? null : current), kind === "gravity" ? 1550 : 1050);
  }, [playItemSound]);

  useEffect(() => {
    const pulse = game.rankedGravityPulse ?? 0;
    if (!pulse || pulse <= playedRankedGravity.current) return;
    playedRankedGravity.current = pulse;
    showSwitchFx("gravity", game.turn);
  }, [game.rankedGravityPulse, game.turn, showSwitchFx]);

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
        mode !== "lab"
          ? 1
          : aiSpeed <= UI_BEHAVIOR.labFastThresholdMs
            ? UI_BEHAVIOR.labEffectScaleFast
            : aiSpeed <= UI_BEHAVIOR.labMediumThresholdMs
              ? UI_BEHAVIOR.labEffectScaleMedium
              : UI_BEHAVIOR.labEffectScaleNormal;
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
    const placed = {
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
      mode !== "lab"
        ? 1
        : aiSpeed <= UI_BEHAVIOR.labFastThresholdMs
          ? UI_BEHAVIOR.labEffectScaleFast
          : aiSpeed <= UI_BEHAVIOR.labMediumThresholdMs
            ? UI_BEHAVIOR.labEffectScaleMedium
            : UI_BEHAVIOR.labEffectScaleNormal;
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
    const pushed = pushedProbesBetween(game, next);
    showSwitchFx("blast", player);
    setPulseFx({ kind: "blast", target, radius: game.balance?.blastRadius ?? activeBalance.blastRadius, nonce: Date.now() });
    window.setTimeout(() => setPulseFx(null), 950);
    setBlastFx({ stage: "settle", target, owner: player, size: "large", destroyedIds: [], pushed });
    setIsAnimating(true);
    window.setTimeout(() => {
      setBlastFx(null);
      setIsAnimating(false);
    }, 950);
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
  const activateItem = (kind: ItemKind) => {
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
    setSwitchFx(null);
    setOrbitFx(null);
    setPulseFx(null);
    setSelectedOrbitRing(null);
    setHoveredOrbitRing(null);
    setIsAnimating(false);
    setNeedsNewGame(false);
    recordedOutcome.current = "";
    recordedRankOutcome.current = "";
    const playerCount = rematchPlayerCount(game);
    const players = PLAYER_ORDER.slice(0, playerCount);
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
        playerCount,
        Boolean(game.obstaclesEnabled),
        nextOffset,
        game.botPlayers ?? [],
        game.variant ?? "classic",
        game.balance ?? activeBalance,
        Boolean(game.ranked),
      ),
    );
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
  const humanSetupComplete = game.phase !== "setup" || activePlayers(game)
    .filter((player) => !(game.botPlayers ?? []).includes(player))
    .every((player) => Boolean(game.setupConfirmed?.[player]));

  useEffect(() => {
    if (mode !== "online" || !online.code) return;
    const pollInterval = document.hidden ? 5000 : online.status === "playing" ? 900 : 2000;
    const poll = window.setInterval(async () => {
      if (isAnimating || online.pending) return;
      try {
        const response = await fetch(`/api/rooms?code=${encodeURIComponent(online.code)}`, {
          headers: playerRequestHeaders(),
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
            if (remoteItemEffect.kind === "blast" && remoteItemEffect.target && remoteItemEffect.pushed) {
              setBlastFx({
                stage: "settle",
                target: remoteItemEffect.target,
                owner: remoteItemEffect.player,
                size: "large",
                destroyedIds: [],
                pushed: remoteItemEffect.pushed,
              });
              setIsAnimating(true);
              window.setTimeout(() => {
                setBlastFx(null);
                setIsAnimating(false);
              }, 950);
            }
          }
          setSize(data.state.size);
          setVariant(data.state.variant ?? "classic");
          setRankedMode(Boolean(data.state.ranked));
          setFirst(data.state.startingPlayer);
          setObstaclesEnabled(Boolean(data.state.obstaclesEnabled));
          setOnline((current) => ({
            ...current,
            status: data.status,
            version: data.version,
            role: data.role,
            maxPlayers: data.maxPlayers,
            joinedPlayers: data.joinedPlayers,
            roomCount: data.roomCount,
            spectatorCount: data.spectatorCount,
            memberNames: data.memberNames ?? current.memberNames,
            memberRoles: data.memberRoles ?? current.memberRoles,
            isHost: Boolean(data.isHost),
            joinLocked: Boolean(data.joinLocked),
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
    }, pollInterval);
    return () => window.clearInterval(poll);
  }, [mode, online.code, online.version, online.pending, online.status, online.isHost, online.joinedPlayers, isAnimating, playBoom, playItemSound]);

  useEffect(() => {
    if (mode !== "online" || !online.code || chatMuted) {
      setChatMessages([]);
      return;
    }
    let active = true;
    const loadChat = async () => {
      try {
        const response = await fetch(`/api/chat?code=${encodeURIComponent(online.code)}`, {
          headers: playerRequestHeaders(),
          cache: "no-store",
        });
        const data = await response.json();
        if (active && response.ok) setChatMessages(data.messages ?? []);
      } catch {
        // Chat is optional; a temporary failure must never interrupt the match.
      }
    };
    void loadChat();
    const timer = window.setInterval(loadChat, document.hidden ? 6000 : 2200);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, online.code, chatMuted]);

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
  }, [game.ranked, game.phase, game.winner, game.turnCount, game.log.length, game.finishOrder, mode, refreshProfile]);

  useEffect(() => {
    if (mode !== "lab" || !aiRunning || game.phase !== "over") return;
    const timer = window.setTimeout(() => {
      const players = activePlayers(game);
      const nextFirst = players[stats.games % players.length];
      setActiveFirst(nextFirst);
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
    }, Math.max(UI_BEHAVIOR.aiMinimumDelayMs, aiSpeed));
    return () => window.clearTimeout(timer);
  }, [mode, aiRunning, game, aiSpeed, stats.games, activeBalance]);

  useEffect(() => {
    if (
      !isAiTurn ||
      !aiRunning ||
      !canControl ||
      (game.phase === "setup" && !humanSetupComplete) ||
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
        activateItem(decision.kind);
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
    }, game.phase === "setup"
      ? UI_BEHAVIOR.aiSetupDelayMs
      : game.bonusMove
        ? Math.max(UI_BEHAVIOR.aiBonusMoveMinimumDelayMs, aiSpeed)
        : aiSpeed);
    return () => window.clearTimeout(timer);
  // Action helpers intentionally use the current game snapshot from this effect.
  // Adding every inline dispatcher would recreate the timer without changing its decision input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    humanSetupComplete,
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
  const lobbyAiRoles = PLAYER_ORDER.filter((player) => !online.memberRoles.includes(player)).slice(0, onlineAiCount);
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
    const playerId = getOrCreatePlayerId();
    setProfileStatus("保存中…");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) throw new Error();
      setProfileStatus("REGULA企業登録を更新しました");
    } catch {
      setProfileStatus("保存できませんでした");
    }
  };

  useEffect(() => {
    if (!nickname.trim()) return;
    const timer = window.setTimeout(() => {
      void saveProfile();
      if (online.code) void updateNickname();
    }, 450);
    return () => window.clearTimeout(timer);
  // Nickname edits are intentionally the only trigger; room/version polling must not resubmit it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nickname]);

  const sendContact = async () => {
    if (contactMessage.trim().length < 10) {
      setContactStatus("内容を10文字以上で入力してください");
      return;
    }
    setContactStatus("送信中…");
    const playerId = getOrCreatePlayerId();
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
        body: JSON.stringify({
          type: contactType,
          message: contactMessage,
          nickname,
          version: APP_VERSION,
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

  const sendItemProposal = async () => {
    if (proposalName.trim().length < 2 || proposalEffect.trim().length < 10 || proposalReason.trim().length < 10 || proposalLimit.trim().length < 5) {
      setProposalStatus(language === "ja" ? "アイテム名と各説明をもう少し詳しく入力してください" : "Please add a name and more detail to each required field.");
      return;
    }
    setProposalStatus(language === "ja" ? "送信中…" : "Sending…");
    const message = [
      `ITEM NAME: ${proposalName.trim()}`,
      `EFFECT: ${proposalEffect.trim()}`,
      `WHY IT IS FUN: ${proposalReason.trim()}`,
      `BALANCE LIMIT: ${proposalLimit.trim()}`,
      `CREDIT: ${proposalCreditAllowed ? proposalCredit.trim() || nickname.trim() || "匿名" : "掲載不可"}`,
    ].join("\n\n");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": getOrCreatePlayerId() },
        body: JSON.stringify({ type: "アイテム提案", message, nickname, version: APP_VERSION, roomCode: online.code || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? (language === "ja" ? "送信できませんでした" : "Could not send proposal"));
      setProposalName(""); setProposalEffect(""); setProposalReason(""); setProposalLimit(""); setProposalCredit(""); setProposalCreditAllowed(false);
      setProposalStatus(language === "ja" ? `提案を受け付けました（受付番号 ${data.reference}）` : `Proposal received (reference ${data.reference})`);
    } catch (error) {
      setProposalStatus(error instanceof Error ? error.message : (language === "ja" ? "送信できませんでした" : "Could not send proposal"));
    }
  };

  return (
    <main className={`shell variant-${game.variant}${entryStage ? " entry-active" : ""}${onlineLobbyOnly ? " online-lobby-only" : ""}${!entryStage && !onlineLobbyOnly ? " hud-mode" : ""}${mode === "online" && !online.code ? " room-uncreated" : ""}${switchFx?.kind === "gravity" ? " gravity-active" : ""}${game.ranked ? " ranked-match" : ""}${game.ranked && game.rankedGravityRoundsRemaining === 1 ? " ranked-gravity-warning" : ""}${reducedMotion ? " reduced-motion" : ""}`}>
      <div className="phone-portrait-lock" role="status" aria-live="polite">
        <i aria-hidden="true">↻</i>
        <strong>端末を縦向きにしてください</strong>
        <span>METEOR RACEはスマートフォンの縦画面に最適化されています。</span>
        <small>PLEASE ROTATE YOUR DEVICE</small>
      </div>
      {entryStage === "title" && (
        <section className="title-screen" aria-label={t("titleAria")}>
          <button className="title-settings title-manual" type="button" aria-label={t("openManual")} onClick={() => setManualOpen(true)}>📕 <span>{t("manualLabel")}</span></button>
          <div className="title-orbit" aria-hidden="true"><i /><i /><b>✦</b></div>
          <div className="title-copy">
            <small>INTERPLANETARY TACTICAL RACE</small>
            <h1>METEOR<br/><span>RACE</span></h1>
            {language === "ja" && <b className="title-reading">メテオレース</b>}
            <p>{t("titleTagline")}</p>
            <p className="title-description">{t("titleDescription")}</p>
          </div>
          <nav>
            <button className="title-start" type="button" onClick={() => setEntryStage("rule")}>{t("gameStart")} <span>▶</span></button>
            <button type="button" onClick={() => setSettingsOpen(true)}>{t("settingsLabel")}</button>
            <a className="title-privacy" href="/privacy">{t("privacyLabel")}</a>
          </nav>
          <footer><span>{t("onlineReady")}</span><span>{nickname.trim() || t("guestPlayer")} · {rankTier(rankRating)} {rankRating}</span></footer>
          <AdSlot position="title" />
        </section>
      )}
      {entryStage && entryStage !== "title" && (
        <section className={`entry-flow ${rankedOpen ? "rank-open" : "rank-closed"}`} aria-label="対戦準備">
          <button className="title-settings title-manual" type="button" aria-label={t("openManual")} onClick={() => setManualOpen(true)}>📕 <span>{t("manualLabel")}</span></button>
          <header><button type="button" onClick={() => setEntryStage(entryStage === "rule" || entryStage === "play" ? "title" : "rule")}>{t("back")}</button><div><small>{entryStage === "play" ? t("ruleGuide") : t("gameStart")}</small><b>{entryStage === "play" ? t("howToPlay") : entryStage === "rule" ? "01 / BASIC" : "02 / MATCH SETUP"}</b></div></header>
          {entryStage === "play" && <div className="entry-panel play-guide"><div><small>MISSION</small><h2>COREへ先に到達せよ</h2><p>毎手番、探査機を縦横へ1マス動かし、メテオを置きます。爆風は障害ではなく、探査機を一気に進める推進力です。</p></div><div className="play-guide-grid"><article><b>01</b><strong>MOVE</strong><p>探査機を縦横へ1マス移動。後退よりCOREへ近づく進路を作ります。</p></article><article><b>02</b><strong>PLACE</strong><p>小2個・大1個のメテオを配置。先攻の最初の手番だけ配置できません。</p></article><article><b>03</b><strong>METEOR</strong><p>小は周囲1マス、大は中心ほど強い爆風。自分も相手も押し動かします。</p></article><article><b>GOAL</b><strong>CORE</strong><p>移動・BOOSTER・爆風・GRAVITYのどれで入っても到達です。</p></article></div>
<nav className="play-guide-links"><a href="/guide">遊び方をもっと詳しく</a><a href="/items">アイテム一覧</a></nav><button className="entry-confirm" type="button" onClick={() => setEntryStage("rule")}>{t("gameStart")}</button></div>}
          {entryStage === "rule" && <div className="entry-panel compact-flow"><h2>{t("choosePlayStyle")}</h2><p>{t("chooseOpponent")}</p><h3>PLAY STYLE</h3><div className="choice-row three"><button className={setupMode === "cpu" ? "selected" : ""} onClick={() => setSetupMode("cpu")}><strong>SINGLE</strong><span>{t("cpuBattle")}</span></button><button className={setupMode === "human" ? "selected" : ""} onClick={() => setSetupMode("human")}><strong>LOCAL</strong><span>{t("localBattle")}</span></button><button className={setupMode === "online" ? "selected" : ""} onClick={() => setSetupMode("online")}><strong>ONLINE</strong><span>{t("onlineBattle")}</span></button></div><button className="entry-confirm" onClick={() => setEntryStage("match")}>{t("next")}</button></div>}
          {entryStage === "match" && (
            <div className="entry-panel compact-flow">
              <h2>{setupMode === "online" ? t("onlineMatch") : t("matchSetup")}</h2>
              <p>{setupMode === "cpu" ? "SINGLE" : setupMode === "human" ? "LOCAL" : "ONLINE"}</p>
              {setupMode === "online" ? <>
                <h3>ONLINE TYPE</h3>
                <div className="rank-choice">
                  <button className={!rankedMode ? "selected" : ""} onClick={() => setRankedMode(false)}><strong>CASUAL ROOM</strong><span>{t("casualRoomNote")}</span></button>
                  <button className={rankedMode ? "selected" : "locked"} disabled={!rankedOpen} onClick={() => { setRankedMode(true); setVariant(isItemVariant(variant) ? "item" : "classic"); setOnlinePlayerCount(2); setOnlineAiCount(0); }}><strong>{rankedOpen ? t("rankedDuel") : t("rankedClosed")}</strong><span>{rankedOpen ? t("rankedOpen") : language === "en" ? "Daily 12:00–13:00 / 20:00–21:00 JST" : RANKED_SCHEDULE_LABEL}</span></button>
                </div>
                {rankedMode && <><h3>{t("rankedRules")}</h3><div className="choice-row"><button className={!isItemVariant(variant) ? "selected" : ""} onClick={() => { setVariant("classic"); setSize(9); }}><strong>{t("rankedClassic")}</strong><span>{rankTier(classicRankRating)} {classicRankRating}</span></button><button className={isItemVariant(variant) ? "selected" : ""} onClick={() => { setVariant("item"); setSize(11); }}><strong>{t("rankedItem")}</strong><span>{rankTier(itemRankRating)} {itemRankRating}</span></button></div></>}
                <p className={rankedOpen ? "rank-window open" : "rank-window"}>{rankedMode ? t("rankedRateNote") : t("casualLobbyNote")}</p>
              </> : <>
                <h3>RULE</h3>
                <div className="choice-row"><button className={variant === "classic" || variant === "team" ? "selected" : ""} onClick={() => { setVariant("classic"); setSize(9); }}><strong>CLASSIC</strong><span>{t("classicRuleNote")}</span></button><button className={variant === "item" || variant === "team-item" ? "selected" : ""} onClick={() => { setVariant("item"); setSize(11); }}><strong>ITEM</strong><span>{t("itemRuleNote")}</span></button></div>
                <h3>MATCH TYPE</h3>
                <div className="choice-row"><button className={!isTeamVariant(variant) ? "selected" : ""} onClick={() => { setVariant(isItemVariant(variant) ? "item" : "classic"); setSize(isItemVariant(variant) ? 11 : 9); }}><strong>FREE FOR ALL</strong><span>{t("freeForAll")}</span></button><button className={isTeamVariant(variant) ? "selected" : ""} onClick={() => { setVariant(isItemVariant(variant) ? "team-item" : "team"); setSize(13); setAiPlayerCount(4); setLocalAiCount(2); }}><strong>2 VS 2</strong><span>{t("teamBattle")}</span></button></div>
                <div className="entry-settings"><label>BOARD SIZE<select value={size} onChange={(event) => setSize(Number(event.target.value))}>{(isTeamVariant(variant) ? [13,15] : variant === "classic" ? [9,11] : [11,13,15]).map((boardSize) => <option key={boardSize} value={boardSize}>{boardSize} × {boardSize}</option>)}</select></label><div className="cpu-stepper"><span>{setupMode === "cpu" ? "PLAYERS" : "CPU ADD"}</span><button disabled={isTeamVariant(variant)} onClick={() => setupMode === "cpu" ? setAiPlayerCount((Math.max(2, aiPlayerCount - 1) as 2|3|4)) : setLocalAiCount((Math.max(0, localAiCount - 1) as 0|1|2))}>−</button><b>{isTeamVariant(variant) && setupMode === "cpu" ? 4 : setupMode === "cpu" ? aiPlayerCount : localAiCount}</b><button disabled={isTeamVariant(variant)} onClick={() => setupMode === "cpu" ? setAiPlayerCount((Math.min(4, aiPlayerCount + 1) as 2|3|4)) : setLocalAiCount((Math.min(2, localAiCount + 1) as 0|1|2))}>＋</button></div>{(setupMode !== "human" || localAiCount > 0) && <label>AI LEVEL<select value={aiDifficulty} onChange={(event) => setAiDifficulty(event.target.value as AiDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label>}</div>
              </>}
              <button className="entry-confirm" onClick={() => { applyNewGameSettings(); setEntryStage(null); window.setTimeout(() => (setupMode === "online" ? document.getElementById("match-setup") : document.querySelector(".topbar"))?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }), 30); }}>{setupMode === "online" ? t("onlineLobby") : "BATTLE START"}</button>
            </div>
          )}
          <footer><span>MODE SELECT</span><i /><span>MATCH SETUP</span></footer>
        </section>
      )}
      <header className="topbar">
        <button className="game-back" type="button" onClick={() => mode === "online" && online.code ? void (online.status === "waiting" ? leaveOnlineRoom() : online.isHost ? returnOnlineLobby() : leaveOnlineRoom()) : setEntryStage("rule")}>{mode === "online" && online.code ? online.status === "waiting" ? t("leaveRoom") : online.isHost ? t("lobby") : t("leaveMatch") : t("back")}</button>
        <div className="brand">
          <div>
            <h1>METEOR RACE</h1>
            <p>{t("titleTagline")}</p>
          </div>
        </div>
        <div className="regula-console" style={{ "--regula-progress": `${regulaProgress}%` } as CSSProperties} aria-label={`REGULA match progress ${regulaProgress}%`}><span><small>REGULA // MATCH CONTROL</small><i><b /></i><em>CORE APPROACH {regulaProgress}%</em></span></div>
        <div className="round">
          {t("round")} {Math.floor(game.turnCount / activePlayers(game).length) + 1}
          {game.ranked && <><b>真剣タイマン · {rankTier(rankRating)} {rankRating}</b><em>GRAVITY IN {game.rankedGravityRoundsRemaining ?? balance.rankedGravityRounds} ROUNDS</em></>}
        </div>
        <button className="manual-trigger" type="button" aria-label={manualOpen ? t("closeManual") : t("openManual")} aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}>{manualOpen ? "📖" : "📕"} <span>{t("manualLabel")}</span></button>
      </header>

      {settingsOpen && (
        <div className="settings-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label={t("settings")}>
            <header><div><small>METEOR RACE</small><h2>{t("settingsLabel")}</h2></div><button ref={settingsCloseRef} type="button" aria-label={t("closeSettings")} onClick={() => setSettingsOpen(false)}>×</button></header>
            <section>
              <h3>{t("languageHeading")}</h3>
              <div className="language-switch" role="group" aria-label={t("displayLanguage")}>
                <button type="button" className={language === "ja" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={language === "ja"} onClick={() => setLanguage("ja")}>{t("japaneseLanguage")}</button>
                <button type="button" className={language === "en" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>{t("englishLanguage")}</button>
              </div>
              <p>{t("languageSaved")}</p>
            </section>
            <section>
              <h3>{t("accountHeading")}</h3>
              <label>{t("nickname")}<input maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="PLAYER" /></label>
              <p role="status">{profileStatus || t("autoSave")}</p>
              <dl><div><dt>{t("registryNumber")}</dt><dd>{publicPlayerId}<button type="button" onClick={() => void navigator.clipboard?.writeText(publicPlayerId)}>COPY</button></dd></div></dl>
              <p>{t("accountNote")}</p>
            </section>
            <section>
              <h3>{t("soundHeading")}</h3>
              <label>{t("masterVolume")} <b>{masterVolume}</b><input type="range" min="0" max="100" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /></label>
              <label>BGM <b>{bgmVolume}</b><input type="range" min="0" max="100" value={bgmVolume} onChange={(event) => setBgmVolume(Number(event.target.value))} /></label>
              <label>{t("soundEffects")} <b>{sfxVolume}</b><input type="range" min="0" max="100" value={sfxVolume} onChange={(event) => setSfxVolume(Number(event.target.value))} /></label>
              <button type="button" className={soundEnabled ? "drawer-toggle active" : "drawer-toggle"} onClick={() => setSoundEnabled((value) => !value)}>{t("muteAll")} {soundEnabled ? "OFF" : "ON"}</button>
              <label>BATTLE MUSIC
                <select value={battleTrack} onChange={(event) => setBattleTrack(event.target.value as BattleTrackChoice)}>
                  {Object.entries(BATTLE_TRACK_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                  <option value="random">RANDOM</option>
                </select>
              </label>
            </section>
            <section>
              <h3>{t("playResearchHeading")}</h3>
              <button type="button" className={strongPlaySharing ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={strongPlaySharing} onClick={() => setStrongPlaySharing((value) => !value)}>{t("strongPlaySharing")} {strongPlaySharing ? "ON" : "OFF"}</button>
              <p>{t("strongPlaySharingNote")}</p>
            </section>
            <AdSlot position="settings" />
            <section>
              <h3>{t("contactHeading")}</h3>
              <select value={contactType} onChange={(event) => setContactType(event.target.value)}><option>不具合報告</option><option>ご意見・要望</option><option>アカウントについて</option><option>その他</option></select>
              <textarea maxLength={COMMUNITY_SAFETY.contactMaxLength} value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} placeholder="内容を入力してください" />
              <button type="button" className="contact-send" onClick={() => void sendContact()}>送信する</button>
              {contactStatus && <p role="status">{contactStatus}</p>}
              <nav><button type="button" onClick={() => { setSettingsOpen(false); setEntryStage("play"); }}>ルールガイド</button><button type="button" onClick={() => { setSettingsOpen(false); setEntryStage("rule"); }}>対戦設定</button><a href="/privacy">プライバシー</a><a href="/terms">利用規約</a><span>{APP_VERSION_LABEL}</span></nav>
            </section>
          </aside>
        </div>
      )}

      {manualOpen && (
        <div className="manual-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setManualOpen(false)}>
          <aside className="manual-drawer" role="dialog" aria-modal="true" aria-label="マニュアル">
            <header><div><small>METEOR RACE / MANUAL</small><h2>{manualPage === "world" ? t("worldHeading") : t("rulesAndItems")}</h2></div><nav className="manual-tabs" aria-label="Manual pages"><button type="button" className={manualPage === "rules" ? "active" : ""} onClick={() => setManualPage("rules")}>{t("manualRulesTab")}</button><button type="button" className={manualPage === "world" ? "active" : ""} onClick={() => setManualPage("world")}>{t("manualWorldTab")}</button></nav><div className="manual-now"><small>NOW</small><strong>{displayGameMessage}</strong></div><button type="button" aria-label={t("close")} onClick={() => setManualOpen(false)}>×</button></header>
            {manualPage === "world" ? <div className="manual-world" aria-label={t("worldHeading")}>
              <section className="manual-world-hero"><div className="manual-world-orbit" style={{ "--regula-progress": `${regulaProgress}%` } as CSSProperties} aria-hidden="true"><i /><i /><i /><strong>REGULA</strong><span>ASTRA NETWORK</span><b>CORE APPROACH {regulaProgress}%</b></div>
              <div className="manual-world-copy"><small>ARCHIVE / ASTRA ACCORD</small><p>{t("worldEra")}</p><p>{t("worldAccord")}</p><p>{t("worldRegula")}</p><p>{t("worldBroadcast")}</p><strong>{t("worldFinale")}</strong><b>METEOR RACE</b></div></section>
              <section className="authorized-equipment"><header><small>AUTHORIZED EQUIPMENT</small><h3>{language === "ja" ? "REGULA認可装備" : "REGULA-AUTHORIZED EQUIPMENT"}</h3><p>{language === "ja" ? "競技用アイテムは、REGULAの安全審査を通過した協賛企業から提供されています。" : "Competition items are supplied by partners that have passed REGULA safety review."}</p></header><div>{ITEM_LORE.map((item) => <article key={item.kind} className={item.kind}><i aria-hidden="true">{ITEM_ICONS[item.kind]}</i><span><small>{item.company}</small><b>{item.kind.toUpperCase()}</b><p>{language === "ja" ? item.ja : item.en}</p></span></article>)}</div></section>
              <section className="supplier-proposal"><header><small>NEW SUPPLIER PROGRAM</small><h3>{language === "ja" ? "新規装備提案" : "PROPOSE NEW EQUIPMENT"}</h3><p>{language === "ja" ? "REGULA認可競技装備のアイデアを募集しています。" : "Submit an idea for new REGULA-authorized competition equipment."}</p></header><form onSubmit={(event) => { event.preventDefault(); void sendItemProposal(); }}><label>{language === "ja" ? "アイテム名" : "ITEM NAME"}<input maxLength={40} value={proposalName} onChange={(event) => setProposalName(event.target.value)} required /></label><label>{language === "ja" ? "効果案" : "EFFECT"}<textarea maxLength={300} value={proposalEffect} onChange={(event) => setProposalEffect(event.target.value)} required /></label><label>{language === "ja" ? "面白いと思う理由" : "WHY IT IS FUN"}<textarea maxLength={300} value={proposalReason} onChange={(event) => setProposalReason(event.target.value)} required /></label><label>{language === "ja" ? "強すぎないための制約" : "BALANCE LIMIT"}<textarea maxLength={240} value={proposalLimit} onChange={(event) => setProposalLimit(event.target.value)} required /></label><label>{language === "ja" ? "掲載名（任意）" : "CREDIT NAME (OPTIONAL)"}<input maxLength={24} value={proposalCredit} onChange={(event) => setProposalCredit(event.target.value)} disabled={!proposalCreditAllowed} /></label><label className="proposal-check"><input type="checkbox" checked={proposalCreditAllowed} onChange={(event) => setProposalCreditAllowed(event.target.checked)} />{language === "ja" ? "採用時の名前掲載を許可する" : "Allow this name to be credited if adopted"}</label><p>{language === "ja" ? "提案は調整・改変して採用する場合があります。個人情報や第三者の作品は送らないでください。" : "Ideas may be adjusted before adoption. Do not submit personal information or third-party work."} <a href="/terms">{language === "ja" ? "投稿規約" : "Terms"}</a></p><button type="submit">{language === "ja" ? "REGULAへ提案を送る" : "SEND TO REGULA"}</button>{proposalStatus && <strong role="status">{proposalStatus}</strong>}</form></section>
            </div> : <div className="manual-onepage">
              <section className="manual-rules"><header><small>01</small><h3>{t("turnLoopHeading")}</h3></header><div className="manual-rule-content"><div className="manual-turn-loop">
                <article><span>01</span><i>✥</i><div><b>MOVE</b><p>{t("manualMove")}</p></div></article><em>↓</em>
                <article><span>02</span><i>◆</i><div><b>METEOR</b><p>{t("manualMeteor")}</p></div></article><em>↓</em>
                <article><span>03</span><i>{ITEM_ICONS.shield}</i><div><b>ITEM</b><p>{t("manualItem")}</p></div></article>
                <strong>{t("manualNext")}</strong>
              </div><div className="manual-notes"><p>{t("noDiagonal")}</p><p>{t("blastPropulsion")}</p><p>{t("anyCoreArrival")}</p><p>{t("firstTurnRule")}</p></div></div></section>
              <section className="manual-items"><header><small>02</small><h3>{t("itemArchiveHeading")}</h3></header><div className="manual-item-grid">{SELECTABLE_ITEMS.map((kind) => <article key={kind} className={kind}><i aria-hidden="true">{ITEM_ICONS[kind]}</i><div><b>{kind.toUpperCase()}</b><p>{itemDetail(kind, balance, language)}</p></div></article>)}</div></section>
            </div>}
          </aside>
        </div>
      )}

      <section className="game-layout">
        <div className="player-stack left-stack">
          <aside className={`player-card red-card ${(game.phase === "over" ? game.winner === "red" : game.turn === "red") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("red", 1)}</span>
          <h2>RED</h2>
          <ProbeIcon color="red" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.red} color="red" items={canSeeLoadout("red") ? game.itemHands?.red ?? [] : []} loadoutHidden={!canSeeLoadout("red")} />
          </aside>
          {activePlayers(game).includes("green") && <aside className={`player-card green-card ${(game.phase === "over" ? game.winner === "green" : game.turn === "green") ? "active" : ""}`}><span className="eyebrow">{displayNameForPlayer("green", 3)}</span><h2>GREEN</h2><ProbeIcon color="green" teamMode={isTeamVariant(game.variant)} /><InventoryPanel inventory={game.inventory.green} color="green" items={canSeeLoadout("green") ? game.itemHands?.green ?? [] : []} loadoutHidden={!canSeeLoadout("green")} /></aside>}
        </div>

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
            <span>{resultPlayer ? "WINNER / 勝者" : "CURRENT TURN / 現在の手番"}</span>
            <b>{resultPlayer ? playerName(resultPlayer) : turnDisplayName}</b>
            <i>{playerName(displayAccent)}</i>
          </div>
          <div className="status" aria-live="polite">
            <span className={`status-dot ${displayAccent}`} />
            {displayGameMessage}
          </div>
          {game.phase === "setup" && isItemVariant(game.variant) && (
            <div className="item-selection-overlay" aria-live="polite">
              <header><small>LOADOUT PREVIEW</small><strong>{t("selectedItems")}</strong></header>
              <div className={`item-preview-flags count-${Math.min(3, game.itemHands?.[setupPlayer]?.length ?? 0)}`}>
                {(game.itemHands?.[setupPlayer] ?? []).length === 0 && <p>{t("emptyLoadout")}</p>}
                {(game.itemHands?.[setupPlayer] ?? []).map((kind, index) => {
                  const facts = itemEffectFacts(kind, game.balance ?? activeBalance, language);
                  return (
                    <article className={`item-preview-flag ${kind}`} key={`${kind}-${index}`}>
                      <header><ItemIcon kind={kind} /><b>{kind.toUpperCase()}</b></header>
                      <div className="item-preview-spec" aria-label={tf("itemEffectAria", { kind: kind.toUpperCase() })}>
                        <strong>{ITEM_DEMO_LABELS[kind]}</strong>
                        <span>{facts[0]}</span>
                        <small>{facts[1]}</small>
                      </div>
                      <p>{itemDetail(kind, game.balance ?? activeBalance, language)}</p>
                      <em>{index + 1}</em>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
          <div
            className={`board turn-${displayAccent}${game.phase === "setup" && isItemVariant(game.variant) ? " item-selection-dim" : ""}${game.phase === "over" ? " result-dim" : ""}`}
            data-perspective={perspectiveSlot}
            style={{
              gridTemplateColumns: `repeat(${game.size}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${game.size}, minmax(0, 1fr))`,
            }}
            aria-label={tf("boardAria", { size: game.size })}
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
              const probePush = probe ? blastFx?.pushed[probe] : undefined;
              const probePushMatches = probePush && (
                blastFx?.stage === "settle"
                  ? samePos(pos, { r: probePush.from.r + probePush.dr, c: probePush.from.c + probePush.dc })
                  : samePos(pos, probePush.from)
              );
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
                  {blastFx && blastFx.stage !== "settle" && samePos(pos, blastFx.target) && (
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
                  {pulseFx?.kind === "blast" && samePos(pos, pulseFx.target) && (
                    <span key={`${pulseFx.nonce}-blast-origin`} className="blast-origin-effect">
                      <i className="blast-origin-flash" />
                      <i className="blast-origin-wave wave-a" />
                      <i className="blast-origin-wave wave-b" />
                    </span>
                  )}
                  {pulseFx?.kind === "pulse" && distance(pos, pulseFx.target) <= pulseFx.radius && (
                    <span
                      key={`${pulseFx.nonce}-${r}-${c}`}
                      className={`pulse-blast-cell${samePos(pos, pulseFx.target) ? " origin" : ""}`}
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
                        probePushMatches
                          ? pushForPerspective(probePush, perspectiveSlot)
                          : undefined
                      }
                      settling={blastFx?.stage === "settle" && Boolean(probePushMatches)}
                    />
                  )}
                  {legal && <span className="move-pip" />}
                </button>
              );
            })}
          </div>

          {game.phase === "over" && (
            <section className="result-overlay" role="dialog" aria-modal="true" aria-label="対戦結果">
              <header><small>MATCH RESULT</small><strong>{displayGameMessage}</strong></header>
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
                className="primary-action result-rematch"
                onClick={mode === "online" ? rematchOnlineRoom : restartCurrentGame}
                disabled={mode === "online" && online.pending}
              >
                同じメンバーでもう一度
              </button>
              <AdSlot position="result" />
            </section>
          )}

          <div
            className="action-panel"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {game.phase === "setup" && showTurnActionControls && (
              <div className="switch-setup-controls">
                <span className="action-label">{tf("selectItems", { total: balance.itemHandTotal, same: balance.itemSameMax })}</span>
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
                  {tf("selectedCount", { count: game.itemHands?.[setupPlayer]?.length ?? 0, total: balance.itemHandTotal })}
                </b>
                <span className="setup-confirm-actions">
                  <button
                    className="primary-action compact-action"
                    disabled={(game.itemHands?.[setupPlayer]?.length ?? 0) !== balance.itemHandTotal}
                    onClick={confirmItemLoadout}
                  >
                    {t("confirm")}
                  </button>
                  <button
                    className="secondary-action compact-action"
                    disabled={(game.itemHands?.[setupPlayer]?.length ?? 0) === 0}
                    onClick={cancelItemLoadout}
                  >
                    {t("cancelSelection")}
                  </button>
                </span>
              </div>
            )}
            {game.phase === "place" && showTurnActionControls && (
              <>
                <span className="action-label">{t("meteorToPlace")}</span>
                <button
                  className={`meteor-choice ${game.selected === "small" ? "selected" : ""}`}
                  disabled={game.inventory[game.turn].small === 0}
                  onClick={() => setGame((g) => ({ ...g, selected: "small" }))}
                >
                  <i className="placement-meteor-icon small" aria-hidden="true">●</i>
                  <span>{t("smallMeteor")}</span> <b>{game.inventory[game.turn].small}</b>
                </button>
                <button
                  className={`meteor-choice large ${game.selected === "large" ? "selected" : ""}`}
                  disabled={game.inventory[game.turn].large === 0}
                  onClick={() => setGame((g) => ({ ...g, selected: "large" }))}
                >
                  <i className="placement-meteor-icon large" aria-hidden="true">✦</i>
                  <span>{t("largeMeteor")}</span> <b>{game.inventory[game.turn].large}</b>
                </button>
                <button
                  className="meteor-choice pass-choice"
                  disabled={!(game.passAvailable?.[game.turn] ?? true)}
                  onClick={passPlacement}
                >
                  {t("passPlacement")} <b>{game.passAvailable?.[game.turn] ?? true ? 1 : 0}</b>
                </button>
                {isItemVariant(game.variant) && (game.itemHands?.[game.turn] ?? []).map((kind, index) => (
                  <button
                    key={`${kind}-${index}`}
                    className={`meteor-choice item-choice ${kind}`}
                    disabled={!canUseItem(game, kind)}
                    onClick={() => activateItem(kind)}
                    title={t("itemUseWarning")}
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
                    ? tf("chooseOrbitDirection", { ring: selectedOrbitRing })
                    : t("chooseOrbitRing")}
                </span>
                {selectedOrbitRing && (
                  <span className="orbit-direction-actions">
                    <button onClick={() => resolveOrbit(selectedOrbitRing, true)}>{t("clockwise")}</button>
                    <button onClick={() => resolveOrbit(selectedOrbitRing, false)}>{t("counterclockwise")}</button>
                    <button className="secondary" onClick={() => setSelectedOrbitRing(null)}>{t("chooseRingAgain")}</button>
                  </span>
                )}
                <button className="secondary" onClick={cancelItemTarget}>{t("back")}</button>
              </div>
            )}
            {game.phase === "switch" && showTurnActionControls && game.pendingSwitches?.[0]?.kind !== "orbit" && (
              <div className="switch-target-controls">
                <span className="action-label">
                  {tf("chooseBoardTarget", { kind: game.pendingSwitches?.[0]?.kind.toUpperCase() ?? "ITEM" })}
                </span>
                <button className="secondary" onClick={cancelItemTarget}>{t("back")}</button>
              </div>
            )}
            {game.phase === "move" && showTurnActionControls && moves.length === 0 && (
              <button className="primary-action" onClick={skipBlockedMove}>
                {t("blockedMove")}
              </button>
            )}
            {game.phase === "move" && showTurnActionControls && game.bonusMove && moves.length > 0 && (
              <div className={`bonus-move-callout ${game.turn}`} role="status">
                BONUS MOVE <b>2 / 2</b>
              </div>
            )}
          </div>
        </section>

        <div className="player-stack right-stack">
          <aside className={`player-card blue-card ${(game.phase === "over" ? game.winner === "blue" : game.turn === "blue") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("blue", 2)}</span>
          <h2>BLUE</h2>
          <ProbeIcon color="blue" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.blue} color="blue" items={canSeeLoadout("blue") ? game.itemHands?.blue ?? [] : []} loadoutHidden={!canSeeLoadout("blue")} />
          </aside>
          {activePlayers(game).includes("yellow") && <aside className={`player-card yellow-card ${(game.phase === "over" ? game.winner === "yellow" : game.turn === "yellow") ? "active" : ""}`}><span className="eyebrow">{displayNameForPlayer("yellow", 4)}</span><h2>YELLOW</h2><ProbeIcon color="yellow" teamMode={isTeamVariant(game.variant)} /><InventoryPanel inventory={game.inventory.yellow} color="yellow" items={canSeeLoadout("yellow") ? game.itemHands?.yellow ?? [] : []} loadoutHidden={!canSeeLoadout("yellow")} /></aside>}
        </div>
      </section>

      {!entryStage && mode === "online" && online.code && chatOpen && !chatMuted && (
        <aside className="comms-panel" aria-label="ルームチャット">
          <header><div><small>ROOM {online.code}</small><strong>CHAT</strong></div><button type="button" aria-label="チャットを閉じる" onClick={() => setChatOpen(false)}>×</button></header>
          <div className="comms-log" aria-live="polite">
            {chatMessages.length ? chatMessages.map((item) => <p key={item.id}><b>{item.nickname}</b><span>{item.message}</span></p>) : <em>まだ通信はありません</em>}
          </div>
          <form className="free-comms" onSubmit={(event) => { event.preventDefault(); void sendChat(chatDraft); }}>
            <input aria-label="自由チャット" maxLength={COMMUNITY_SAFETY.chatMaxLength} value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder={`メッセージを入力（${COMMUNITY_SAFETY.chatMaxLength}文字まで）`} disabled={chatPending} />
            <button type="submit" disabled={chatPending || !chatDraft.trim()}>SEND</button>
          </form>
          <div className="quick-comms">{QUICK_CHAT_MESSAGES.map((message) => <button key={message} type="button" disabled={chatPending} onClick={() => void sendQuickChat(message)}>{message}</button>)}</div>
        </aside>
      )}

      <footer className="battle-hud global-hud" aria-label="共通操作バー">
            <button className="hud-player" type="button" onClick={() => setSettingsOpen(true)} aria-label="設定を開く">
              <span className="hud-settings-icon" aria-hidden="true">⚙</span>
              <i className={online.role ?? game.turn} aria-hidden="true" />
              <span><small>PROBE CONTROL</small><b>{mode === "online" ? ownDisplayName || "PLAYER" : nickname.trim() || "GUEST PLAYER"}</b><em>{mode === "online" && online.role ? playerName(online.role) : `${rankTier(rankRating)} ${rankRating}`}</em></span>
            </button>
            <div className="hud-mission">
              <small>{entryStage === "title" ? "REGULA NETWORK READY" : entryStage ? "REGULA / MATCH CONFIGURATION" : onlineLobbyOnly ? "REGULA / ONLINE WAITING ROOM" : game.phase === "over" ? "REGULA / MISSION COMPLETE" : `REGULA / ${turnDisplayName} / ${game.phase.toUpperCase()}`}</small>
              <strong>{entryStage === "title" ? "METEOR RACE" : entryStage ? (setupMode === "online" ? "ONLINEの対戦方式を設定" : setupMode === "cpu" ? "SINGLEの対戦方式を設定" : "LOCALの対戦方式を設定") : onlineLobbyOnly ? (online.code ? `参加待ち ${online.joinedPlayers}/${online.maxPlayers}` : "ルームを作成または参加") : displayGameMessage}</strong>
              {!entryStage && !onlineLobbyOnly && <i className="hud-regula-progress" aria-hidden="true"><b style={{ width: `${regulaProgress}%` }} /></i>}
              {mode === "online" && online.code && <button type="button" onClick={() => void navigator.clipboard?.writeText(online.code)}>ROOM {online.code} / COPY</button>}
              {!entryStage && game.phase === "over" && mode === "online" && online.role && <button type="button" onClick={() => void rematchOnlineRoom()}>REMATCH</button>}
            </div>
            <div className="hud-tools">
              <label className="hud-volume"><button type="button" aria-label={soundEnabled ? "消音する" : "音を出す"} onClick={() => setSoundEnabled((current) => !current)}>{soundEnabled ? "◖))" : "◖×"}</button><input aria-label="全体音量" type="range" min="0" max="100" step="10" value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} /><output>{masterVolume}</output></label>
              <div className="hud-icons">
                {mode === "online" && online.code && <button type="button" className={`chat-toggle ${chatOpen ? "active" : ""}`} aria-label="チャット表示を切り替える" aria-pressed={chatOpen} onClick={() => { setChatOpen((current) => !current); setChatMuted(false); }}>CHAT</button>}
                {mode === "online" && online.code && <button type="button" className={`chat-mute ${chatMuted ? "active danger" : ""}`} aria-label="チャットをミュートする" aria-pressed={chatMuted} onClick={() => { setChatMuted((current) => !current); setChatOpen(false); }}>⊘</button>}
                {mode === "online" && online.code && online.isHost && online.status === "waiting" && <button type="button" className={`room-lock ${online.joinLocked ? "active danger" : ""}`} aria-label={online.joinLocked ? "ルーム参加受付を再開" : "これ以上の参加を締め切る"} aria-pressed={Boolean(online.joinLocked)} disabled={online.pending} onClick={() => void toggleRoomLock()}>{online.joinLocked ? "▣" : "▢"}</button>}
              </div>
            </div>
      </footer>

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
                <span>ROOM CAPACITY</span><strong>{online.roomCount ?? online.memberNames.length}人入室 · {online.joinedPlayers}人参加 · {online.spectatorCount ?? 0}人観戦</strong>
              </div>
            )}
            {online.code && online.isHost && !rankedMode && <div className="room-rule-console"><div><span>ITEM</span><button type="button" className={isItemVariant(variant)?"on":""} onClick={toggleRoomItemMode}>{isItemVariant(variant)?"ON":"OFF"}</button></div><div><span>TEAM</span><button type="button" className={isTeamVariant(variant)?"on":""} onClick={()=>void setRoomTeamMode(!isTeamVariant(variant))}>{isTeamVariant(variant)?"ON":"OFF"}</button></div><label>BOARD<select value={size} onChange={(event)=>{setSize(Number(event.target.value));setNeedsNewGame(true);}}>{(isTeamVariant(variant)?[13,15]:isItemVariant(variant)?[11,13,15]:[9,11]).map((boardSize)=><option key={boardSize} value={boardSize}>{boardSize} × {boardSize}</option>)}</select></label></div>}
            {!online.code && <><input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, COMMUNITY_SAFETY.nicknameMaxLength))} placeholder="NICKNAME" aria-label="ニックネーム" maxLength={COMMUNITY_SAFETY.nicknameMaxLength}/><input value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="ROOM CODE" aria-label="ルームコード" maxLength={6}/><button onClick={createOnlineRoom} disabled={online.pending}>CREATE ROOM</button><button onClick={joinOnlineRoom} disabled={online.pending || !roomCodeInput}>JOIN ROOM</button><button type="button" className="online-main-return" onClick={() => setEntryStage("rule")}>← ゲームモードへ戻る</button></>}
            {online.code && !online.role && (
              <span className="spectator-badge">SPECTATING</span>
            )}
            {online.status === "finished" && online.role && (
              <button onClick={rematchOnlineRoom} disabled={online.pending}>
                SAME ROOM REMATCH
              </button>
            )}
            {online.code && online.isHost && online.status !== "waiting" && <button type="button" onClick={() => void returnOnlineLobby()} disabled={online.pending}>設定を変えて仕切り直す</button>}
            {online.code && <code>{online.code}</code>}
            {online.code && (
              <div className={`room-members ${isTeamVariant(variant)?"team-room-members":""}`} aria-label="ルームメンバー">
                <span>MEMBERS</span>{isTeamVariant(variant)&&<><strong className="team-heading red-team">RED TEAM</strong><strong className="team-heading blue-team">BLUE TEAM</strong></>}
                {online.memberNames.map((name, index) => (
                  <div
                    key={`${name}-${index}`}
                    className={online.memberRoles[index] ?? "spectator"}
                  >
                    <b>{name}{index === 0 ? " / LEADER" : ""}</b><small>{online.memberRoles[index] ? playerName(online.memberRoles[index]!) : "WATCH"}</small>
                    {online.isHost && online.status !== "playing" && <span className="member-actions"><button type="button" onClick={()=>online.memberRoles[index]?void manageRoomMember(index,"spectate"):void manageRoomMember(index,"seat",PLAYER_ORDER.find((player)=>!online.memberRoles.includes(player))??"blue")}>{online.memberRoles[index]?"観戦へ":"選手へ"}</button>{index>0&&<button type="button" onClick={()=>void manageRoomMember(index,"kick")}>退出させる</button>}</span>}
                    {isTeamVariant(variant)&&index!==ownMemberIndex&&online.memberRoles[index]&&online.role&&online.status!=="playing"&&<button type="button" className="team-switch" onClick={()=>void swapOwnRole(online.memberRoles[index]!)}>このメンバーと入れ替え</button>}
                  </div>
                ))}
                {lobbyAiRoles.map((role,index)=><div key={`cpu-${index}`} className={`cpu-member ${role}`}><b>CPU {index+1}</b><small>{isTeamVariant(variant)?teamOf(role)==="sun"?"RED TEAM":"BLUE TEAM":playerName(role)}</small><i>AI</i>{online.role&&online.status!=="playing"&&<button type="button" className="team-switch" onClick={()=>void swapOwnRole(role)}>CPUと入れ替え</button>}</div>)}
              </div>
            )}
            {online.code && online.isHost && (
              <div className="online-count ai-members-card" aria-label="オンライン追加AI人数">
                <div><span>AI MEMBERS</span><small>空席へCPU探査機を追加</small></div><div className="ai-stepper"><button type="button" disabled={onlineAiCount === 0} onClick={() => { setOnlineAiCount((onlineAiCount - 1) as 0|1|2|3); setNeedsNewGame(true); }}>−</button><b>{onlineAiCount}<small> AI</small></b><button type="button" disabled={onlinePlayerCount + onlineAiCount >= 4} onClick={() => { const next=Math.min(3,onlineAiCount+1) as 0|1|2|3; setOnlineAiCount(next); if(onlinePlayerCount+next>2&&size===9)setSize(11); setNeedsNewGame(true); }}>＋</button></div>
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
            {online.error && <small>{online.error}</small>}
          </section>
        )}
        {mode === "lab" && <details className="ai-lab-panel">
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
        </details>}
      </section>
    </main>
  );
}

export default function Home() {
  return <Game />;
}
