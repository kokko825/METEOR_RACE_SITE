"use client";

import Image from "next/image";
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
import { LATEST_RELEASE_NOTES } from "../config/release-notes";
import { useDeferredReveal } from "./hooks/use-deferred-reveal";
import { useUiFeedback } from "./hooks/use-ui-feedback";
import { useResponsiveBoard } from "./hooks/use-responsive-board";
import { SoundMixer, VolumeRange } from "./components/sound-controls";
import { MatchMeta } from "./components/match-meta";
import { uiFormat, uiText } from "./i18n";
import { UI_BEHAVIOR } from "../config/ui-behavior";
import { UI_LAYOUT } from "../config/ui-layout";
import { gameStatusText } from "./game-status";
import { getOrCreatePlayerId, playerRequestHeaders } from "./client-identity";
import {
  STRONG_PLAY_MAX_PER_MATCH,
  detectStrongPlay,
  type StrongPlayCandidate,
} from "./strong-play";
import { COMMUNITY_SAFETY } from "../config/community-safety";
import { ITEM_LORE } from "../config/item-lore";
import { ASSET_PATHS } from "../config/asset-paths";
import { tutorialCopy, type TutorialCopyStep } from "../config/tutorial-copy";
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
type OrbitFx = { ring: number; clockwise: boolean; quarterTurns: 1 | 2; nonce: number };
type PulseFx = { kind: "blast" | "pulse"; target: Pos; radius: number; nonce: number };
type OnlineItemEffect = {
  version: number;
  kind: ItemKind;
  player: Player;
  ring?: number;
  clockwise?: boolean;
  quarterTurns?: 1 | 2;
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
type TutorialStep = "welcome" | "goal" | "first-move" | "first-praise" | "rival" | "rival-moving" | "rival-result" | "second-move" | "meteor" | "meteor-result" | "large" | "free" | "free-play" | "complete";
const QUICK_CHAT_MESSAGES = COMMUNITY_SAFETY.quickChatMessages;


function Game() {
  useSiteTheme();
  const [entryStage, setEntryStage] = useState<"title" | "rule" | "play" | "match" | "setup" | null>("title");
  const [tutorialConfirmOpen, setTutorialConfirmOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [tutorialOpening, setTutorialOpening] = useState<"forward" | "side" | "back">("forward");
  const [tutorialHitRival, setTutorialHitRival] = useState(false);
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
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatToast, setChatToast] = useState<ChatMessage | null>(null);
  const knownChatIds = useRef(new Set<string>());
  const chatInitialized = useRef(false);
  const [chatPending, setChatPending] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatBurst = useRef({ count: 0, lastSentAt: 0 });
  const [chatCooldownUntil, setChatCooldownUntil] = useState(0);
  const [chatCooldownRemaining, setChatCooldownRemaining] = useState(0);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const settingsTriggerRef = useRef<HTMLElement | null>(null);
  const arenaRef = useRef<HTMLElement>(null);
  const actionPanelRef = useRef<HTMLDivElement>(null);
  useResponsiveBoard(
    arenaRef,
    actionPanelRef,
    isItemVariant(game.variant) ? UI_LAYOUT.itemBoardVerticalFill : UI_LAYOUT.classicBoardVerticalFill,
  );
  const {
    nickname, setNickname,
    masterVolume, setMasterVolume,
    bgmVolume, setBgmVolume,
    sfxVolume, setSfxVolume,
    reducedMotion,
    battleTrack, setBattleTrack,
    language, setLanguage,
    textSize, setTextSize,
    strongPlaySharing, setStrongPlaySharing,
  } = useLocalSettings();
  const t = (key: Parameters<typeof uiText>[1]) => uiText(language, key);
  const localize = (ja: string, en: string) => language === "ja" ? ja : en;
  const tf = (key: Parameters<typeof uiText>[1], values: Record<string, string | number>) =>
    uiFormat(language, key, values);
  const displayGameMessage = gameStatusText(game, language);
  const [contactType, setContactType] = useState<"bug" | "feedback" | "other">("bug");
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
  const resultIdentity = `${game.turnCount}:${game.winner ?? "none"}:${game.finishOrder?.join("-") ?? ""}`;
  const resultVisible = useDeferredReveal({
    active: (!tutorialStep || tutorialStep === "complete") && game.phase === "over" && Boolean(game.winner),
    blocked: isAnimating,
    identity: resultIdentity,
    delayMs: UI_BEHAVIOR.resultRevealDelayMs,
  });
  const visibleGameMessage =
    game.phase === "over" && !resultVisible ? t("statusCoreArrival") : displayGameMessage;
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
  const { playVolumeTick } = useUiFeedback({ soundEnabled, masterVolume, sfxVolume });

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
  const playerBoardInputEnabled = canControl && showTurnActionControls && !isAnimating;

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
        difficulty: aiDifficulty,
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
      setAiDifficulty((data.lobbyAiDifficulty ?? "normal") as AiDifficulty);
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
      setAiDifficulty((data.lobbyAiDifficulty ?? "normal") as AiDifficulty);
      setOnlineAiCount((data.state.botPlayers ?? []).length as 0 | 1 | 2 | 3);
      setVariant(data.lobbyVariant ?? data.state.variant ?? "classic");
      setSize(data.lobbySize ?? data.state.size);
      setOnlineAiCount((data.lobbyAiCount ?? data.state.botPlayers?.length ?? 0) as 0 | 1 | 2 | 3);
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
    quarterTurns?: 1 | 2,
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
        quarterTurns,
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

  const commit = (next: GameState) => {
    setGame(next);
  };

  const returnOnlineLobby = async () => {
    if (!online.code) return;
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

  useEffect(() => {
    if (!online.code || !online.isHost || online.status !== "waiting") return;
    const timer = window.setTimeout(() => {
      void roomRequest({
        action: "update_lobby_settings",
        code: online.code,
        variant,
        size,
        aiCount: onlineAiCount,
        difficulty: aiDifficulty,
      }).then((data) => {
        setOnline((current) => ({ ...current, version: data.version, pending: false, error: "" }));
      }).catch((error) => {
        setOnline((current) => ({ ...current, error: error instanceof Error ? error.message : "ルーム設定を同期できませんでした" }));
      });
    }, 160);
    return () => window.clearTimeout(timer);
  }, [online.code, online.isHost, online.status, variant, size, onlineAiCount, aiDifficulty]);

  const swapOwnRole = async (targetRole: Player) => {
    if (!online.code || !online.isHost || !online.role || targetRole === online.role) return;
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
    if (!online.code || chatPending || chatMuted || chatCooldownRemaining > 0) return;
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
      if (!response.ok) {
        if (response.status === 429) {
          const seconds = Number(data.retryAfterSeconds) || COMMUNITY_SAFETY.chatCooldownSeconds;
          chatBurst.current = { count: 0, lastSentAt: 0 };
          setChatCooldownUntil(Date.now() + seconds * 1000);
        }
        throw new Error(data.error ?? "送信できませんでした");
      }
      knownChatIds.current.add(data.message.id);
      setChatMessages((current) => [...current.filter((item) => item.id !== data.message.id), data.message].slice(-40));
      setChatDraft("");
      const now = Date.now();
      const nextBurstCount = now - chatBurst.current.lastSentAt > COMMUNITY_SAFETY.chatPostWindowSeconds * 1000
        ? 1
        : chatBurst.current.count + 1;
      chatBurst.current = { count: nextBurstCount, lastSentAt: now };
      if (nextBurstCount >= COMMUNITY_SAFETY.chatPostLimit) {
        chatBurst.current = { count: 0, lastSentAt: 0 };
        setChatCooldownUntil(now + COMMUNITY_SAFETY.chatCooldownSeconds * 1000);
      }
    } catch (error) {
      setOnline((current) => ({ ...current, error: error instanceof Error ? error.message : "チャットを送信できませんでした" }));
    } finally {
      setChatPending(false);
    }
  };

  useEffect(() => {
    if (!chatCooldownUntil) {
      setChatCooldownRemaining(0);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((chatCooldownUntil - Date.now()) / 1000));
      setChatCooldownRemaining(remaining);
      if (!remaining) setChatCooldownUntil(0);
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [chatCooldownUntil]);

  useEffect(() => {
    if (chatOpen) setChatToast(null);
  }, [chatOpen]);

  useEffect(() => {
    chatBurst.current = { count: 0, lastSentAt: 0 };
    setChatCooldownUntil(0);
  }, [online.code]);

  const sendQuickChat = (message: string) => sendChat(message);

  const playBoom = useCallback(
    () => playBoomSfx(soundEnabled, masterVolume, sfxVolume),
    [soundEnabled, masterVolume, sfxVolume],
  );

  const playItemSound = useCallback((kind: ItemKind) => {
    if (soundEnabled) getMusicManager().dispatch({ type: "ITEM_GET", kind });
    playItemSoundSfx(kind, soundEnabled, masterVolume, sfxVolume);
  }, [soundEnabled, masterVolume, sfxVolume]);

  const startTutorial = () => {
    if (online.code && online.status !== "playing") {
      void roomRequest({ action: "leave", code: online.code }).catch(() => undefined);
      setOnline({
        code: "", role: null, status: "idle", version: 0, maxPlayers: 2,
        joinedPlayers: 0, memberNames: [], memberRoles: [], error: "",
        pending: false, isHost: false, joinLocked: false,
      });
      setRoomCodeInput("");
    }
    const training = initialState(9, "red", 2, false, 0, ["blue"], "classic", activeBalance, false);
    setTutorialConfirmOpen(false);
    setTutorialStep("welcome");
    setTutorialOpening("forward");
    setTutorialHitRival(false);
    setEntryStage(null);
    setMode("human");
    setSetupMode("human");
    setVariant("classic");
    setSize(9);
    setFirst("red");
    setActiveFirst("red");
    setNeedsNewGame(false);
    setAiDifficulty("easy");
    setAiRunning(true);
    setBlastFx(null);
    setIsAnimating(false);
    setGame(training);
  };

  const requestTutorial = () => {
    setManualOpen(false);
    setSettingsOpen(false);
    setTutorialConfirmOpen(true);
  };

  const leaveTutorial = () => {
    setTutorialStep(null);
    setEntryStage("title");
    setNeedsNewGame(true);
  };

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
    const next = applyMove(game, target);
    if (tutorialStep && game.turn === "red") {
      if (tutorialStep === "first-move") {
        const from = game.probes.red;
        setTutorialOpening(target.r < from.r ? "forward" : target.r === from.r ? "side" : "back");
        setTutorialStep("first-praise");
      } else if (tutorialStep === "second-move") {
        setTutorialStep(next.phase === "place" ? "meteor" : "second-move");
      }
      if (next.phase === "over" && next.winner === "red") setTutorialStep("complete");
    }
    commit(next);
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

  const placeMeteor = (target: Pos, sizeOverride?: MeteorSize, useCapsule = false): boolean => {
    const chosenSize: MeteorSize =
      sizeOverride ??
      (game.selected === "obstacle" || game.selected === "capsule"
        ? "small"
        : game.selected);
    if (
      !canControl ||
      isAnimating ||
      game.phase !== "place"
    ) return false;
    try {
      const capsule = useCapsule || game.selected === "capsule";
      const resolution = applyMeteor(game, target, chosenSize, capsule);
      if (tutorialStep && game.turn === "blue" && resolution.state.phase === "over" && resolution.state.winner === "blue") {
        passPlacement();
        return true;
      }
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
        return true;
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
        if (tutorialStep === "meteor" && game.turn === "red") {
          const hitRival = Boolean(resolution.pushed.blue);
          setTutorialHitRival(hitRival);
          setTutorialStep(resolution.state.phase === "over" && resolution.state.winner === "red" ? "complete" : "meteor-result");
        }
        setBlastFx(null);
        setIsAnimating(false);
      }, Math.max(140, Math.round(2020 * effectScale)));
      return true;
    } catch {
      return false;
    }
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
  const resolveOrbit = (ring: number, clockwise: boolean, quarterTurns: 1 | 2 = 1) => {
    const player = game.pendingSwitches?.[0]?.player ?? game.turn;
    const next = applyOrbitSwitch(game, ring, clockwise, quarterTurns);
    showSwitchFx("orbit", player);
    if (mode === "online") void submitOnlineAction("switch_orbit", undefined, undefined, false, ring, clockwise, quarterTurns);
    setSelectedOrbitRing(null);
    setHoveredOrbitRing(null);
    setOrbitFx({ ring, clockwise, quarterTurns, nonce: Date.now() });
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
    if (mode === "online") void submitOnlineAction("switch_recall", undefined, undefined, false, undefined, undefined, undefined, undefined, meteorId);
    commit(next);
  };
  const activateItem = (kind: ItemKind) => {
    if (!canControl || !canUseItem(game, kind)) return;
    try {
      if (kind === "shield" || kind === "booster" || kind === "recall" || kind === "gravity") showSwitchFx(kind, game.turn);
      if (mode === "online") void submitOnlineAction("use_item", undefined, undefined, false, undefined, undefined, undefined, kind);
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
    if (!playerBoardInputEnabled) return;
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
          difficulty: aiDifficulty,
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
    !playerBoardInputEnabled
      ? false
      : game.phase === "setup"
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
    let requestInFlight = false;
    let active = true;
    const poll = window.setInterval(async () => {
      if (isAnimating || online.pending || requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await fetch(`/api/rooms?code=${encodeURIComponent(online.code)}`, {
          headers: playerRequestHeaders(),
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "同期できませんでした");
        if (active && data.version > online.version) {
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
                quarterTurns: remoteItemEffect.quarterTurns ?? 1,
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
          setSize(data.status === "waiting" ? (data.lobbySize ?? data.state.size) : data.state.size);
          setVariant(data.status === "waiting" ? (data.lobbyVariant ?? data.state.variant ?? "classic") : (data.state.variant ?? "classic"));
          if (data.status === "waiting") {
            setOnlineAiCount((data.lobbyAiCount ?? data.state.botPlayers?.length ?? 0) as 0 | 1 | 2 | 3);
            setAiDifficulty((data.lobbyAiDifficulty ?? "normal") as AiDifficulty);
          }
          if (data.kicked) {
            setOnline({ code: "", role: null, status: "idle", version: 0, maxPlayers: 4, joinedPlayers: 0, roomCount: 0, spectatorCount: 0, memberNames: [], memberRoles: [], error: "ルームから退出させられました", pending: false, isHost: false, joinLocked: false });
            setEntryStage("rule");
            return;
          }
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
        if (!active) return;
        setOnline((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "同期できませんでした",
        }));
      } finally {
        requestInFlight = false;
      }
    }, pollInterval);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [mode, online.code, online.version, online.pending, online.status, online.isHost, online.joinedPlayers, isAnimating, playBoom, playItemSound]);

  useEffect(() => {
    if (mode !== "online" || !online.code || chatMuted) {
      setChatMessages([]);
      setUnreadChatCount(0);
      knownChatIds.current.clear();
      chatInitialized.current = false;
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
        if (active && response.ok) {
          const messages = (data.messages ?? []) as ChatMessage[];
          const newMessages = messages.filter((message) => !knownChatIds.current.has(message.id));
          if (chatInitialized.current && !chatOpen && newMessages.length) {
            setUnreadChatCount((current) => Math.min(99, current + newMessages.length));
            const latest = newMessages[newMessages.length - 1];
            setChatToast(latest);
            window.setTimeout(() => setChatToast((current) => current?.id === latest.id ? null : current), 3600);
          }
          messages.forEach((message) => knownChatIds.current.add(message.id));
          chatInitialized.current = true;
          setChatMessages(messages);
        }
      } catch {
        // Chat is optional; a temporary failure must never interrupt the match.
      }
    };
    void loadChat();
    const timer = window.setInterval(loadChat, document.hidden ? 6000 : 2200);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode, online.code, chatMuted, chatOpen]);

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
    if (tutorialStep === "rival-moving" && game.turn === "red" && game.turnCount > 0) {
      setTutorialStep("rival-result");
    }
  }, [tutorialStep, game.turn, game.turnCount]);

  useEffect(() => {
    if (tutorialStep === "free-play" && game.phase === "over" && game.winner === "red") {
      setTutorialStep("complete");
    }
  }, [tutorialStep, game.phase, game.winner]);

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
    if (tutorialStep && tutorialStep !== "rival-moving" && tutorialStep !== "free-play") return;
    const timer = window.setTimeout(() => {
      if (game.phase === "setup") {
        const setupDecision = chooseAiDecision(game, aiDifficulty);
        if (setupDecision.type === "setup") {
          const next = applySetupItem(game, setupDecision.kind);
          if (mode === "online") void submitOnlineAction("setup_item", undefined, undefined, false, undefined, undefined, undefined, setupDecision.kind, undefined, game.turn);
          commit(next);
        } else if (setupDecision.type === "confirm_setup") {
          if (mode === "online") void submitOnlineAction("setup_confirm", undefined, undefined, false, undefined, undefined, undefined, undefined, undefined, game.turn);
          commit(confirmSetupItems(game));
        }
        return;
      }
      if (tutorialStep === "rival-moving" && game.turn === "blue") {
        if (game.phase === "move") {
          const scriptedMove = { r: game.probes.blue.r + 1, c: game.probes.blue.c };
          const target = moves.find((move) => samePos(move, scriptedMove))
            ?? moves.find((move) => move.r !== mid || move.c !== mid);
          if (target) moveProbe(target);
          else skipBlockedMove();
          return;
        }
        if (game.phase === "place") {
          const red = game.probes.red;
          const scriptedTargets = [
            { r: red.r - 2, c: red.c },
            { r: red.r - 2, c: red.c - 1 },
            { r: red.r - 2, c: red.c + 1 },
          ];
          const target = scriptedTargets.find((candidate) => {
            try {
              applyMeteor(game, candidate, "small", false);
              return true;
            } catch {
              return false;
            }
          });
          if (target) placeMeteor(target, "small", false);
          else passPlacement();
          return;
        }
      }
      let decision = chooseAiDecision(game, aiDifficulty);
      if (tutorialStep && game.turn === "blue" && decision.type === "move" && decision.target.r === mid && decision.target.c === mid) {
        const safeMove = moves.find((target) => target.r !== mid || target.c !== mid);
        if (safeMove) decision = { type: "move", target: safeMove };
        else {
          commit({
            ...game,
            phase: "place",
            message: "BLUE：移動を見送り、メテオ配置へ",
            log: [...game.log, "チュートリアルCPUはCORE直前で移動を見送った"],
          });
          return;
        }
      }
      if (decision.type === "move") {
        moveProbe(decision.target);
      } else if (decision.type === "meteor") {
        // The board can change between evaluation and execution online.
        // An invalid cached target must not trap an AI in the placement phase.
        if (!placeMeteor(decision.target, decision.size, decision.useCapsule)) passPlacement();
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
        resolveOrbit(decision.ring, decision.clockwise, decision.quarterTurns);
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
        : mode === "online"
          ? Math.max(UI_BEHAVIOR.aiMinimumDelayMs, aiSpeed)
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
    tutorialStep,
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
      ? localize("10戦以上で傾向を判定します", "PLAY 10+ MATCHES TO IDENTIFY TRENDS")
      : isTeamVariant(game.variant)
        ? Math.abs(teamWinRates.sun - teamWinRates.moon) <= 10
          ? localize("現時点では大きなチーム差なし", "NO SIGNIFICANT TEAM GAP DETECTED")
          : localize(`${teamWinRates.sun > teamWinRates.moon ? "SUN" : "MOON"} TEAM優勢。先攻・初期方向の影響を要観察`, `${teamWinRates.sun > teamWinRates.moon ? "SUN" : "MOON"} TEAM LEADS. REVIEW TURN ORDER AND STARTING DIRECTION.`)
      : labLeaders.length < 2 || labLeaders[0].rate - labLeaders[1].rate <= 10
        ? localize("現時点では大きな陣営差なし", "NO SIGNIFICANT SIDE GAP DETECTED")
        : localize(`${playerName(labLeaders[0].player)}側優勢。先攻・初期方向の影響を要観察`, `${playerName(labLeaders[0].player)} SIDE LEADS. REVIEW TURN ORDER AND STARTING DIRECTION.`);
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
    resultVisible && game.winner && game.winner !== "draw"
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
    setProfileStatus("saving");
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) throw new Error();
      setProfileStatus("saved");
    } catch {
      setProfileStatus("save-error");
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
      setContactStatus(localize("内容を10文字以上で入力してください", "Please enter at least 10 characters."));
      return;
    }
    setContactStatus(localize("送信中…", "Sending…"));
    const playerId = getOrCreatePlayerId();
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-meteor-player-id": playerId },
        body: JSON.stringify({
          type: contactType === "bug" ? "不具合報告" : contactType === "feedback" ? "ご意見・要望" : "その他",
          message: contactMessage,
          nickname,
          version: APP_VERSION,
          roomCode: online.code || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(language === "ja" ? data.error ?? "送信できませんでした" : "Could not send your message");
      setContactMessage("");
      setContactStatus(localize(`送信しました（受付番号 ${data.reference}）`, `Message sent (reference ${data.reference})`));
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : localize("送信できませんでした", "Could not send your message"));
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

  const tutorialPanelCopy = tutorialStep && ["welcome", "goal", "first-move", "first-praise", "rival", "rival-result", "second-move", "meteor", "meteor-result", "large", "free"].includes(tutorialStep)
    ? tutorialCopy(tutorialStep as TutorialCopyStep, language, tutorialOpening, tutorialHitRival)
    : null;

  return (
    <main className={`shell text-size-${textSize} variant-${game.variant}${entryStage ? " entry-active" : ""}${onlineLobbyOnly ? " online-lobby-only" : ""}${!entryStage && !onlineLobbyOnly ? " hud-mode" : ""}${mode === "online" && !online.code ? " room-uncreated" : ""}${switchFx?.kind === "gravity" ? " gravity-active" : ""}${game.ranked ? " ranked-match" : ""}${game.ranked && game.rankedGravityRoundsRemaining === 1 ? " ranked-gravity-warning" : ""}${tutorialStep ? ` tutorial-active tutorial-${tutorialStep}` : ""}${reducedMotion ? " reduced-motion" : ""}`}>
      <div className="phone-portrait-lock" role="status" aria-live="polite">
        <i aria-hidden="true">↻</i>
        <strong>{localize("端末を縦向きにしてください", "ROTATE YOUR DEVICE TO PORTRAIT")}</strong>
        <span>{localize("METEOR RACEはスマートフォンの縦画面に最適化されています。", "METEOR RACE is optimized for portrait play on phones.")}</span>
        <small>PLEASE ROTATE YOUR DEVICE</small>
      </div>
      {entryStage === "title" && (
        <section className="title-screen" aria-label={t("titleAria")}>
          <div className="title-guide-actions"><button className="title-settings title-beginner" type="button" aria-label={localize("チュートリアルを始める", "Start tutorial")} onClick={requestTutorial}>🔰 <span>{localize("チュートリアル", "TUTORIAL")}</span></button><button className="title-settings title-manual" type="button" aria-label={t("openManual")} onClick={() => setManualOpen(true)}>📕 <span>{t("manualLabel")}</span></button></div>
          <div className="title-brand-lockup">
            <div className="title-orbit" aria-hidden="true"><i /><i /></div>
            <div className="title-symbol" aria-hidden="true">
              <Image
                src={ASSET_PATHS.branding.symbol}
                alt=""
                width={1024}
                height={500}
                unoptimized
                onError={(event) => { event.currentTarget.hidden = true; }}
              />
              <b>✦</b>
            </div>
            <div className="title-copy">
              <div className="title-wordmark">
                <Image
                  src={ASSET_PATHS.branding.wordmark}
                  alt=""
                  width={1024}
                  height={200}
                  priority
                  unoptimized
                  onError={(event) => { event.currentTarget.hidden = true; }}
                />
                <h1>METEOR<br/><span>RACE</span></h1>
              </div>
              {language === "ja" && <b className="title-reading">メテオレース</b>}
              <p>{t("titleTagline")}</p>
              <p className="title-description">{t("titleDescription")}</p>
            </div>
          </div>
          <nav>
            <button className="title-start" type="button" onClick={() => setEntryStage("rule")}>{t("gameStart")} <span>▶</span></button>
            <button type="button" onClick={() => setSettingsOpen(true)}>{t("settingsLabel")}</button>
            <a className="title-privacy" href="/policy">{t("privacyLabel")}</a>
          </nav>
          <footer><span>{t("onlineReady")}</span><span>{nickname.trim() || t("guestPlayer")} · {rankTier(rankRating)} {rankRating}</span></footer>
          <AdSlot position="title" />
        </section>
      )}
      {entryStage && entryStage !== "title" && (
        <section className={`entry-flow ${rankedOpen ? "rank-open" : "rank-closed"}`} aria-label={localize("対戦準備", "Match setup")}>
          <div className="title-guide-actions"><button className="title-settings title-beginner" type="button" aria-label={localize("チュートリアルを始める", "Start tutorial")} onClick={requestTutorial}>🔰 <span>{localize("チュートリアル", "TUTORIAL")}</span></button><button className="title-settings title-manual" type="button" aria-label={t("openManual")} onClick={() => setManualOpen(true)}>📕 <span>{t("manualLabel")}</span></button></div>
          <header><button type="button" onClick={() => setEntryStage(entryStage === "rule" || entryStage === "play" ? "title" : "rule")}>{t("back")}</button><div><small>{entryStage === "play" ? t("ruleGuide") : t("gameStart")}</small><b>{entryStage === "play" ? t("howToPlay") : entryStage === "rule" ? "01 / BASIC" : "02 / MATCH SETUP"}</b></div></header>
          {entryStage === "play" && <div className="entry-panel play-guide"><div><small>MISSION</small><h2>{localize("COREへ先に到達せよ", "REACH THE CORE FIRST")}</h2><p>{localize("毎手番、探査機を縦横へ1マス動かし、メテオを置きます。爆風は障害ではなく、探査機を一気に進める推進力です。", "Each turn, move your probe one cell vertically or horizontally, then place a meteor. Blasts are not merely hazards—they are propulsion.")}</p></div><div className="play-guide-grid"><article><b>01</b><strong>MOVE</strong><p>{localize("探査機を縦横へ1マス移動。後退よりCOREへ近づく進路を作ります。", "Move one cell vertically or horizontally and build a route toward the CORE.")}</p></article><article><b>02</b><strong>PLACE</strong><p>{localize("小2個・大1個のメテオを配置。先攻の最初の手番だけ配置できません。", "Place from two small and one large meteor. The first player cannot place one on the opening turn.")}</p></article><article><b>03</b><strong>METEOR</strong><p>{localize("小は周囲1マス、大は中心ほど強い爆風。自分も相手も押し動かします。", "Small meteors blast one surrounding ring. Large blasts are stronger near the center and move any probe.")}</p></article><article><b>04</b><strong>BONUS MOVE</strong><p>{localize("手持ちのメテオをすべて使い切ると、その手番中にもう1回移動できます。", "Use your last meteor to gain one bonus move during that turn.")}</p></article><article><b>GOAL</b><strong>CORE</strong><p>{localize("移動・BOOSTER・爆風・GRAVITYのどれで入っても到達です。", "Movement, BOOSTER, blasts, and GRAVITY can all carry you into the CORE.")}</p></article></div>
<nav className="play-guide-links"><a href="/guide">{localize("遊び方をもっと詳しく", "DETAILED GUIDE")}</a><a href="/items">{localize("アイテム一覧", "ITEM LIST")}</a></nav><button className="entry-confirm" type="button" onClick={() => setEntryStage("rule")}>{t("gameStart")}</button></div>}
          {entryStage === "rule" && <div className="entry-panel compact-flow"><h2>{t("choosePlayStyle")}</h2><p>{t("chooseOpponent")}</p><h3>PLAY STYLE</h3><div className="choice-row three"><button className={setupMode === "cpu" ? "selected" : ""} onClick={() => setSetupMode("cpu")}><strong>SINGLE</strong><span>{t("cpuBattle")}</span></button><button className={setupMode === "human" ? "selected" : ""} onClick={() => setSetupMode("human")}><strong>LOCAL</strong><span>{t("localBattle")}</span></button><button className={setupMode === "online" ? "selected" : ""} onClick={() => setSetupMode("online")}><strong>ONLINE</strong><span>{t("onlineBattle")}</span></button></div><button className="entry-confirm" onClick={() => setEntryStage("match")}>{t("next")}</button></div>}
          {entryStage === "match" && (
            <div className="entry-panel compact-flow">
              <h2>{setupMode === "online" ? t("onlineMatch") : t("matchSetup")}</h2>
              <p>{setupMode === "cpu" ? "SINGLE" : setupMode === "human" ? "LOCAL" : "ONLINE"}</p>
              {setupMode === "online" ? <>
                <h3>ONLINE TYPE</h3>
                <div className="rank-choice">
                  <button className={!rankedMode ? "selected" : ""} onClick={() => setRankedMode(false)}><strong>CASUAL ROOM</strong><span>{t("casualRoomNote")}</span></button>
                  <button className={rankedMode ? "selected" : "locked"} disabled={!rankedOpen} onClick={() => { setRankedMode(true); setVariant(isItemVariant(variant) ? "item" : "classic"); setOnlinePlayerCount(2); setOnlineAiCount(0); }}><strong>{rankedOpen ? t("rankedDuel") : t("rankedClosed")}</strong><span>{rankedOpen ? t("rankedOpen") : language === "en" ? "Daily 08:00–09:00 / 20:00–21:00 JST" : RANKED_SCHEDULE_LABEL}</span></button>
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
      {tutorialConfirmOpen && <div className="tutorial-confirm-backdrop" role="presentation" onPointerDown={() => setTutorialConfirmOpen(false)}><section className="tutorial-confirm" role="dialog" aria-modal="true" aria-labelledby="tutorial-confirm-title" onPointerDown={(event) => event.stopPropagation()}><small>AEQRIS // TRAINING REQUEST</small><h2 id="tutorial-confirm-title">{localize("チュートリアルを開始しますか？", "START THE TUTORIAL?")}</h2><div><button type="button" className="primary-action" autoFocus onClick={startTutorial}>YES</button><button type="button" className="secondary-action" onClick={() => setTutorialConfirmOpen(false)}>NO</button></div></section></div>}
      <header className="topbar">
        <button className="game-back" type="button" onClick={() => tutorialStep ? leaveTutorial() : mode === "online" && online.code ? void (online.status === "waiting" ? leaveOnlineRoom() : returnOnlineLobby()) : setEntryStage("rule")}>{tutorialStep ? localize("← 終了", "← EXIT") : mode === "online" && online.code ? online.status === "waiting" ? t("leaveRoom") : t("lobby") : t("back")}</button>
        <div className="brand">
          <Image
            className="brand-symbol"
            src={ASSET_PATHS.branding.symbol}
            alt=""
            width={1024}
            height={500}
            unoptimized
            aria-hidden="true"
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
          <div>
            <div className="header-wordmark">
              <Image
                src={ASSET_PATHS.branding.wordmark}
                alt=""
                width={1024}
                height={200}
                unoptimized
                onError={(event) => { event.currentTarget.hidden = true; }}
              />
              <h1>METEOR RACE</h1>
            </div>
            <p>{t("titleTagline")}</p>
          </div>
        </div>
        <MatchMeta language={language} progress={regulaProgress} roundLabel={t("round")} roundNumber={Math.floor(game.turnCount / activePlayers(game).length) + 1} rankedDetails={game.ranked ? <><b>{localize("真剣タイマン", "RANKED DUEL")} · {rankTier(rankRating)} {rankRating}</b><em>GRAVITY IN {game.rankedGravityRoundsRemaining ?? balance.rankedGravityRounds} ROUNDS</em></> : undefined} />
        <div className="topbar-guide-actions">
          {!tutorialStep && (mode !== "online" || !online.code) ? <button className="manual-trigger tutorial-trigger" type="button" aria-label={localize("チュートリアルを始める", "Start tutorial")} onClick={requestTutorial}>🔰 <span>{localize("チュートリアル", "TUTORIAL")}</span></button> : null}
          <button className="manual-trigger" type="button" aria-label={manualOpen ? t("closeManual") : t("openManual")} aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}>{manualOpen ? "📖" : "📕"} <span>{t("manualLabel")}</span></button>
        </div>
      </header>

      {settingsOpen && (
        <div className="settings-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label={t("settings")}>
            <header><div><small>METEOR RACE</small><h2>{t("settingsLabel")}</h2></div><button ref={settingsCloseRef} className="icon-close" type="button" aria-label={t("closeSettings")} onClick={() => setSettingsOpen(false)}>×</button></header>
            <section>
              <h3>{t("languageHeading")}</h3>
              <div className="language-switch" role="group" aria-label={t("displayLanguage")}>
                <button type="button" className={language === "ja" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={language === "ja"} onClick={() => setLanguage("ja")}>{t("japaneseLanguage")}</button>
                <button type="button" className={language === "en" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={language === "en"} onClick={() => setLanguage("en")}>{t("englishLanguage")}</button>
              </div>
              <p>{t("languageSaved")}</p>
            </section>
            <section>
              <h3>{t("textSizeHeading")}</h3>
              <div className="text-size-switch" role="group" aria-label={t("textSizeHeading")}>
                <button type="button" className={textSize === "standard" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={textSize === "standard"} onClick={() => setTextSize("standard")}>{t("textSizeStandard")}</button>
                <button type="button" className={textSize === "large" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={textSize === "large"} onClick={() => setTextSize("large")}>{t("textSizeLarge")}</button>
                <button type="button" className={textSize === "xlarge" ? "drawer-toggle active" : "drawer-toggle"} aria-pressed={textSize === "xlarge"} onClick={() => setTextSize("xlarge")}>{t("textSizeExtraLarge")}</button>
              </div>
              <p>{t("textSizeSaved")}</p>
            </section>
            <section>
              <h3>{t("accountHeading")}</h3>
              <label>{t("nickname")}<input maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="PLAYER" /></label>
              <p role="status">{profileStatus ? t(({ synced: "profileSynced", local: "profileLocal", "load-error": "profileLoadError", saving: "profileSaving", saved: "profileSaved", "save-error": "profileSaveError" } as const)[profileStatus]) : t("autoSave")}</p>
              <dl><div><dt>{t("registryNumber")}</dt><dd>{publicPlayerId}<button type="button" onClick={() => void navigator.clipboard?.writeText(publicPlayerId)}>COPY</button></dd></div></dl>
              <p>{t("accountNote")}</p>
            </section>
            <section>
              <h3>{t("soundHeading")}</h3>
              <VolumeRange className="drawer-volume" label={t("masterVolume")} value={masterVolume} onChange={setMasterVolume} onTick={playVolumeTick} />
              <VolumeRange className="drawer-volume" label="BGM" value={bgmVolume} onChange={setBgmVolume} onTick={playVolumeTick} />
              <VolumeRange className="drawer-volume" label={t("soundEffects")} value={sfxVolume} onChange={setSfxVolume} onTick={playVolumeTick} />
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
            <section className="release-summary">
              <h3>{language === "ja" ? "更新履歴" : "UPDATE LOG"}</h3>
              <div className="release-summary-list">
                {LATEST_RELEASE_NOTES.map((note) => <article key={note.version}>
                  <header><b>Version {note.version}</b><time dateTime={note.date}>{note.date}</time></header>
                  <strong>{note.title[language]}</strong><p>{note.summary[language]}</p>
                </article>)}
              </div>
              <a className="release-all-link" href="/updates" target="_blank" rel="noopener noreferrer">{language === "ja" ? "すべて見る" : "VIEW ALL"}<span aria-hidden="true">↗</span></a>
            </section>
            <section>
              <h3>{t("contactHeading")}</h3>
              <select value={contactType} onChange={(event) => setContactType(event.target.value as "bug" | "feedback" | "other")} aria-label={localize("お問い合わせ種別", "Contact category")}><option value="bug">{localize("不具合報告", "BUG REPORT")}</option><option value="feedback">{localize("ご意見・要望", "FEEDBACK")}</option><option value="other">{localize("その他", "OTHER")}</option></select>
              <textarea maxLength={COMMUNITY_SAFETY.contactMaxLength} value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} placeholder={localize("内容を入力してください", "Describe your issue or feedback")} />
              <button type="button" className="contact-send" onClick={() => void sendContact()}>{localize("送信する", "SEND")}</button>
              {contactStatus && <p role="status">{contactStatus}</p>}
              <nav><a href="/policy">{language === "ja" ? "利用規約" : "TERMS & PRIVACY"}</a><span>{APP_VERSION_LABEL}</span></nav>
            </section>
          </aside>
        </div>
      )}

      {manualOpen && (
        <div className="manual-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setManualOpen(false)}>
          <aside className="manual-drawer" role="dialog" aria-modal="true" aria-label={t("manualLabel")}>
            <header><div><small>METEOR RACE / MANUAL</small><h2>{manualPage === "world" ? t("worldHeading") : t("rulesAndItems")}</h2></div><nav className="manual-tabs" aria-label="Manual pages"><button type="button" className={manualPage === "rules" ? "active" : ""} onClick={() => setManualPage("rules")}>{t("manualRulesTab")}</button><button type="button" className={manualPage === "world" ? "active" : ""} onClick={() => setManualPage("world")}>{t("manualWorldTab")}</button></nav><div className="manual-now"><small>NOW</small><strong>{visibleGameMessage}</strong></div><button className="icon-close" type="button" aria-label={t("close")} onClick={() => setManualOpen(false)}>×</button></header>
            {manualPage === "world" ? <div className="manual-world" aria-label={t("worldHeading")}>
              <section className="manual-world-hero"><div className="manual-world-orbit" style={{ "--regula-progress": `${regulaProgress}%` } as CSSProperties} aria-hidden="true"><i /><i /><i /><strong>AEQRIS</strong><span>ASTRA NETWORK</span><b>CORE APPROACH {regulaProgress}%</b></div>
              <div className="manual-world-copy"><small>ARCHIVE / ASTRA ACCORD</small><p>{t("worldEra")}</p><p>{t("worldAccord")}</p><p>{t("worldRegula")}</p><p>{t("worldBroadcast")}</p><strong>{t("worldFinale")}</strong><b>METEOR RACE</b></div></section>
              <section className="authorized-equipment"><header><small>AUTHORIZED EQUIPMENT / OFFICIAL SOURCES</small><h3>{language === "ja" ? "AEQRIS認可競技装備と提供元" : "AEQRIS-AUTHORIZED EQUIPMENT & SOURCES"}</h3><p>{language === "ja" ? "協賛企業の提供装備と、AEQRIS運営技術を競技用に認可。" : "Competition equipment includes partner-supplied units and authorized adaptations of AEQRIS operations technology."}</p></header><div>{ITEM_LORE.map((item) => <article key={item.kind} className={item.kind}><i aria-hidden="true">{ITEM_ICONS[item.kind]}</i><span><small>{language === "ja" ? ("operator" in item && item.operator ? `${item.company} / AEQRIS運営機能` : `${item.company}社 提供`) : ("operator" in item && item.operator ? `${item.company} / AEQRIS OPERATIONS` : `PROVIDED BY ${item.company}`)}</small><b>{item.kind.toUpperCase()}</b><p>{language === "ja" ? item.ja : item.en}</p></span></article>)}</div></section>
              <section className="supplier-proposal"><header><small>NEW SUPPLIER PROGRAM</small><h3>{language === "ja" ? "新規装備提案" : "PROPOSE NEW EQUIPMENT"}</h3><p>{language === "ja" ? "新たなAEQRIS認可競技装備のアイデアを実際に募集しています。採用候補として検討しますので、ぜひあなたの案をお送りください。" : "Submit an idea for new AEQRIS-authorized competition equipment."}</p></header><form onSubmit={(event) => { event.preventDefault(); void sendItemProposal(); }}><label>{language === "ja" ? "アイテム名" : "ITEM NAME"}<input maxLength={40} value={proposalName} onChange={(event) => setProposalName(event.target.value)} required /></label><label>{language === "ja" ? "効果案" : "EFFECT"}<textarea maxLength={300} value={proposalEffect} onChange={(event) => setProposalEffect(event.target.value)} required /></label><label>{language === "ja" ? "面白いと思う理由" : "WHY IT IS FUN"}<textarea maxLength={300} value={proposalReason} onChange={(event) => setProposalReason(event.target.value)} required /></label><label>{language === "ja" ? "強すぎないための制約" : "BALANCE LIMIT"}<textarea maxLength={240} value={proposalLimit} onChange={(event) => setProposalLimit(event.target.value)} required /></label><label>{language === "ja" ? "掲載名（任意）" : "CREDIT NAME (OPTIONAL)"}<input maxLength={24} value={proposalCredit} onChange={(event) => setProposalCredit(event.target.value)} disabled={!proposalCreditAllowed} /></label><label className="proposal-check"><input type="checkbox" checked={proposalCreditAllowed} onChange={(event) => setProposalCreditAllowed(event.target.checked)} />{language === "ja" ? "採用時の名前掲載を許可する" : "Allow this name to be credited if adopted"}</label><p>{language === "ja" ? "提案は調整・改変して採用する場合あり。個人情報や第三者作品の送信は禁止。" : "Ideas may be adjusted before adoption. Do not submit personal information or third-party work."} <a href="/policy#submissions">{language === "ja" ? "投稿規約" : "Policy"}</a></p><button type="submit">{language === "ja" ? "AEQRISへ提案を送る" : "SEND TO AEQRIS"}</button>{proposalStatus && <strong role="status">{proposalStatus}</strong>}</form></section>
            </div> : <div className="manual-onepage">
              <section className="manual-rules"><header><small>01</small><h3>{t("turnLoopHeading")}</h3></header><div className="manual-rule-content"><div className="manual-turn-loop">
                <article><span>01</span><i>✥</i><div><b>MOVE</b><p>{t("manualMove")}</p></div></article><em>↓</em>
                <article><span>02</span><i>◆</i><div><b>METEOR</b><p>{t("manualMeteor")}</p></div></article><em>↓</em>
                <article><span>03</span><i>{ITEM_ICONS.shield}</i><div><b>ITEM</b><p>{t("manualItem")}</p></div></article>
                <strong>{t("manualNext")}</strong>
              </div><div className="manual-notes"><p>{t("noDiagonal")}</p><p>{t("blastPropulsion")}</p><p>{t("anyCoreArrival")}</p><p>{t("firstTurnRule")}</p><p>{t("bonusMoveRule")}</p></div></div></section>
              <section className="manual-items"><header><small>02</small><h3>{t("itemArchiveHeading")}</h3></header><div className="manual-item-grid">{SELECTABLE_ITEMS.map((kind) => <article key={kind} className={kind}><i aria-hidden="true">{ITEM_ICONS[kind]}</i><div><b>{kind.toUpperCase()}</b><p>{itemDetail(kind, balance, language)}</p></div></article>)}</div></section>
            </div>}
          </aside>
        </div>
      )}

      <section className="game-layout">
        <div className="player-stack left-stack">
          <aside className={`player-card red-card ${(resultVisible ? game.winner === "red" : game.turn === "red") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("red", 1)}</span>
          <h2>RED</h2>
          <ProbeIcon color="red" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.red} color="red" items={canSeeLoadout("red") ? game.itemHands?.red ?? [] : []} loadoutHidden={!canSeeLoadout("red")} language={language} />
          </aside>
          {activePlayers(game).includes("green") && <aside className={`player-card green-card ${(resultVisible ? game.winner === "green" : game.turn === "green") ? "active" : ""}`}><span className="eyebrow">{displayNameForPlayer("green", 3)}</span><h2>GREEN</h2><ProbeIcon color="green" teamMode={isTeamVariant(game.variant)} /><InventoryPanel inventory={game.inventory.green} color="green" items={canSeeLoadout("green") ? game.itemHands?.green ?? [] : []} loadoutHidden={!canSeeLoadout("green")} language={language} /></aside>}
        </div>

        <section className="arena" ref={arenaRef}>
          {tutorialStep && tutorialStep !== "rival-moving" && tutorialStep !== "free-play" && tutorialStep !== "complete" && (
            <section className={`tutorial-coach ${["welcome", "goal", "first-praise", "rival", "rival-result", "meteor-result"].includes(tutorialStep) ? "explain" : "guide"}`} role="dialog" aria-live="polite">
              <small>AEQRIS // FIELD TRAINING</small>
              <h2>{tutorialPanelCopy?.title}</h2>
              <p>{tutorialPanelCopy?.body}</p>
              {tutorialStep === "welcome" && <button type="button" onClick={() => setTutorialStep("goal")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "goal" && <button type="button" onClick={() => setTutorialStep("first-move")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "first-praise" && <button type="button" onClick={() => setTutorialStep("rival")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "rival" && <button type="button" onClick={() => setTutorialStep("rival-moving")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "rival-result" && <button type="button" onClick={() => setTutorialStep("second-move")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "meteor-result" && <button type="button" onClick={() => setTutorialStep("large")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "large" && <button type="button" onClick={() => setTutorialStep("free")}>{tutorialPanelCopy?.action}</button>}
              {tutorialStep === "free" && <button type="button" onClick={() => setTutorialStep("free-play")}>{tutorialPanelCopy?.action}</button>}
            </section>
          )}
          {switchFx && (
            <div key={switchFx.nonce} className={`switch-activation ${switchFx.kind} ${switchFx.player}`} role="status">
              <span className="switch-burst" />
              {switchFx.kind === "gravity" && <span className="gravity-well"><i /><i /><i /></span>}
              <b>{switchFx.kind.toUpperCase()}</b>
              <small>{switchFx.kind === "gravity" ? "GRAVITATIONAL PULL" : "ITEM ACTIVATED"}</small>
            </div>
          )}
          <div className={`turn-callout ${displayAccent}`} aria-live="polite">
            <span>{resultPlayer ? localize("WINNER / 勝者", "WINNER") : localize("CURRENT TURN / 現在の手番", "CURRENT TURN")}</span>
            <b>{resultPlayer ? playerName(resultPlayer) : turnDisplayName}</b>
            <i>{playerName(displayAccent)}</i>
          </div>
          <div className="status" aria-live="polite">
            <span className={`status-dot ${displayAccent}`} />
            {visibleGameMessage}
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
            className={`board turn-${displayAccent}${game.phase === "setup" && isItemVariant(game.variant) ? " item-selection-dim" : ""}${resultVisible ? " result-dim" : ""}`}
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
                    const from = orbitFx.quarterTurns === 2
                      ? { r: game.size - 1 - r, c: game.size - 1 - c }
                      : orbitFx.clockwise
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
                playerBoardInputEnabled &&
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
                  aria-label={localize(`座標 ${r},${c}${probe ? ` ${playerName(probe)}探査機` : ""}${meteor ? ` ${meteorName(meteor.size)}` : ""}${obstacle ? " お邪魔メテオ" : ""}${pulseDevice ? " 電磁パルス発生装置" : ""}`, `Cell ${r},${c}${probe ? ` ${playerName(probe)} probe` : ""}${meteor ? ` ${meteor.size} meteor` : ""}${obstacle ? " holo meteor" : ""}${pulseDevice ? " pulse device" : ""}`)}
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
                      language={language}
                    />
                  )}
                  {pulseDevice && <PulseDeviceIcon device={pulseDevice} roundsLeft={Math.max(1, Math.ceil(pulseDevice.turns / activePlayers(game).length))} language={language} />}
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
                      language={language}
                    />
                  )}
                  {legal && <span className="move-pip" />}
                </button>
              );
            })}
          </div>

          {resultVisible && (
            <section className="result-overlay" role="dialog" aria-modal="true" aria-label={localize("対戦結果", "Match result")}>
              <header><small>MATCH RESULT</small><strong>{displayGameMessage}</strong></header>
              {(game.finishOrder?.length ?? 0) > 0 && (
                <ol className="finish-ranking" aria-label={localize("最終順位", "Final ranking")}>
                  {game.finishOrder?.map((player, index) => (
                    <li key={player} className={player}>
                      <b>{localize(`${index + 1}位`, `#${index + 1}`)}</b><span>{playerName(player)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <button
                className="primary-action result-rematch"
                onClick={tutorialStep === "complete" ? leaveTutorial : mode === "online" ? returnOnlineLobby : restartCurrentGame}
                disabled={mode === "online" && online.pending}
              >
                {tutorialStep === "complete" ? localize("チュートリアルを終える", "FINISH TUTORIAL") : mode === "online" ? localize("マッチルームへ戻る", "RETURN TO MATCH ROOM") : localize("同じメンバーでもう一度", "PLAY AGAIN")}
              </button>
              <AdSlot position="result" />
            </section>
          )}

          <div
            className="action-panel"
            ref={actionPanelRef}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {game.phase === "setup" && showTurnActionControls && (
              <div className="switch-setup-controls">
                <span className="action-label">{tf("selectItems", { total: balance.itemHandTotal, same: balance.itemSameMax })}</span>
                {SELECTABLE_ITEMS.map((kind) => (
                  <button
                    key={kind}
                    className={`meteor-choice item-choice ${kind} ${(game.itemHands?.[setupPlayer] ?? []).includes(kind) ? "selected" : ""}`}
                    disabled={!canControl || (game.itemHands?.[setupPlayer] ?? []).filter((entry) => entry === kind).length >= balance.itemSameMax}
                    onClick={() => {
                      try {
                        const next = applySetupItem(game, kind, setupPlayer);
                        if (mode === "online") void submitOnlineAction("setup_item", undefined, undefined, false, undefined, undefined, undefined, kind);
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
                <button
                  className="meteor-choice pass-choice"
                  disabled={!(game.passAvailable?.[game.turn] ?? true)}
                  onClick={passPlacement}
                >
                  {t("passPlacement")} <b>{game.passAvailable?.[game.turn] ?? true ? 1 : 0}</b>
                </button>
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
                    <button onClick={() => resolveOrbit(selectedOrbitRing, true, 2)}>180°</button>
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
            {game.phase === "move" && showTurnActionControls && game.bonusMove && (
              <>
                <div className={`bonus-move-callout ${game.turn}`} role="status">
                  BONUS MOVE <b>{localize("移動／アイテム", "MOVE / ITEM")}</b>
                </div>
                {isItemVariant(game.variant) && (game.itemHands?.[game.turn] ?? []).map((kind, index) => (
                  <button
                    key={`bonus-${kind}-${index}`}
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
          </div>
        </section>

        <div className="player-stack right-stack">
          <aside className={`player-card blue-card ${(resultVisible ? game.winner === "blue" : game.turn === "blue") ? "active" : ""}`}>
          <span className="eyebrow">{displayNameForPlayer("blue", 2)}</span>
          <h2>BLUE</h2>
          <ProbeIcon color="blue" teamMode={isTeamVariant(game.variant)} />
          <InventoryPanel inventory={game.inventory.blue} color="blue" items={canSeeLoadout("blue") ? game.itemHands?.blue ?? [] : []} loadoutHidden={!canSeeLoadout("blue")} language={language} />
          </aside>
          {activePlayers(game).includes("yellow") && <aside className={`player-card yellow-card ${(resultVisible ? game.winner === "yellow" : game.turn === "yellow") ? "active" : ""}`}><span className="eyebrow">{displayNameForPlayer("yellow", 4)}</span><h2>YELLOW</h2><ProbeIcon color="yellow" teamMode={isTeamVariant(game.variant)} /><InventoryPanel inventory={game.inventory.yellow} color="yellow" items={canSeeLoadout("yellow") ? game.itemHands?.yellow ?? [] : []} loadoutHidden={!canSeeLoadout("yellow")} language={language} /></aside>}
        </div>
      </section>

      {!entryStage && mode === "online" && online.code && chatOpen && !chatMuted && (
        <aside className="comms-panel" aria-label={localize("ルームチャット", "Room chat")}>
          <header><div><small>ROOM {online.code}</small><strong>{localize("チャット欄", "CHAT")}</strong></div><button className="icon-close" type="button" aria-label={localize("チャットを閉じる", "Close chat")} onClick={() => setChatOpen(false)}>×</button></header>
          <div className="comms-log" aria-live="polite">
            {chatMessages.length ? chatMessages.map((item) => <p key={item.id}><b>{item.nickname}</b><span>{item.message}</span></p>) : <em>{localize("まだ通信はありません", "NO MESSAGES YET")}</em>}
          </div>
          <form className="free-comms" onSubmit={(event) => { event.preventDefault(); void sendChat(chatDraft); }}>
            <input aria-label={localize("自由チャット", "Chat message")} maxLength={COMMUNITY_SAFETY.chatMaxLength} value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder={chatCooldownRemaining ? localize(`${chatCooldownRemaining}秒後に送信できます`, `Available in ${chatCooldownRemaining}s`) : localize(`メッセージを入力（${COMMUNITY_SAFETY.chatMaxLength}文字まで）`, `Enter a message (up to ${COMMUNITY_SAFETY.chatMaxLength} characters)`)} disabled={chatPending || chatCooldownRemaining > 0} />
            <button type="submit" disabled={chatPending || chatCooldownRemaining > 0 || !chatDraft.trim()}>{chatCooldownRemaining ? `${chatCooldownRemaining}s` : "SEND"}</button>
          </form>
          <div className="quick-comms">{QUICK_CHAT_MESSAGES.map((message, index) => {
            const english = ["Good luck!", "Nice!", "Oops!", "Thinking…", "Rematch!", "GG!"][index] ?? message;
            const label = language === "ja" ? message : english;
            return <button key={message} type="button" disabled={chatPending || chatCooldownRemaining > 0} onClick={() => void sendQuickChat(label)}>{label}</button>;
          })}</div>
        </aside>
      )}
      {!entryStage && mode === "online" && online.code && !chatOpen && !chatMuted && chatToast && (
        <button type="button" className="chat-toast" aria-label={localize(`${chatToast.nickname}からの新着チャットを開く`, `Open new message from ${chatToast.nickname}`)} onClick={() => { setChatOpen(true); setUnreadChatCount(0); setChatToast(null); }}>
          <b>{chatToast.nickname}</b><span>{chatToast.message}</span>
        </button>
      )}

      <footer className="battle-hud global-hud" aria-label={localize("共通操作バー", "Global controls")}>
            <button className="hud-player" type="button" onClick={() => setSettingsOpen(true)} aria-label={localize("設定を開く", "Open settings")}>
              <span className="hud-settings-icon" aria-hidden="true">⚙</span>
              <i className={online.role ?? game.turn} aria-hidden="true" />
              <span><small>PROBE CONTROL</small><b>{mode === "online" ? ownDisplayName || "PLAYER" : nickname.trim() || "GUEST PLAYER"}</b><em>{mode === "online" && online.role ? playerName(online.role) : `${rankTier(rankRating)} ${rankRating}`}</em></span>
            </button>
            <div className="hud-mission">
              <small>{entryStage === "title" ? "AEQRIS NETWORK READY" : entryStage ? "AEQRIS / MATCH CONFIGURATION" : onlineLobbyOnly ? "AEQRIS / ONLINE WAITING ROOM" : resultVisible ? "AEQRIS / MISSION COMPLETE" : game.phase === "over" ? "AEQRIS / CORE ARRIVAL CONFIRMATION" : `AEQRIS / ${turnDisplayName} / ${game.phase.toUpperCase()}`}</small>
              <strong>{entryStage === "title" ? "METEOR RACE" : entryStage ? (setupMode === "online" ? localize("ONLINEの対戦方式を設定", "CONFIGURE ONLINE MATCH") : setupMode === "cpu" ? localize("SINGLEの対戦方式を設定", "CONFIGURE SINGLE MATCH") : localize("LOCALの対戦方式を設定", "CONFIGURE LOCAL MATCH")) : onlineLobbyOnly ? (online.code ? localize(`参加待ち ${online.joinedPlayers}/${online.maxPlayers}`, `WAITING ${online.joinedPlayers}/${online.maxPlayers}`) : localize("ルームを作成または参加", "CREATE OR JOIN A ROOM")) : visibleGameMessage}</strong>
              {!entryStage && !onlineLobbyOnly && <i className="hud-regula-progress" aria-hidden="true"><b style={{ width: `${regulaProgress}%` }} /></i>}
              {mode === "online" && online.code && <button type="button" onClick={() => void navigator.clipboard?.writeText(online.code)}>ROOM {online.code} / COPY</button>}
              {!entryStage && resultVisible && mode === "online" && online.role && <button type="button" data-ui-feedback="confirm" onClick={() => void returnOnlineLobby()}>MATCH ROOM</button>}
            </div>
            <div className="hud-tools">
              <SoundMixer enabled={soundEnabled} masterVolume={masterVolume} bgmVolume={bgmVolume} sfxVolume={sfxVolume} masterLabel={t("masterVolume")} sfxLabel={t("soundEffects")} muteLabel={language === "ja" ? "消音する" : "Mute audio"} unmuteLabel={language === "ja" ? "音を出す" : "Enable audio"} setMasterVolume={setMasterVolume} setBgmVolume={setBgmVolume} setSfxVolume={setSfxVolume} onTick={playVolumeTick} onToggle={() => setSoundEnabled((current) => !current)} />
              <div className="hud-icons">
                {mode === "online" && online.code && <button type="button" className={`chat-toggle ${chatOpen ? "active" : ""} ${unreadChatCount ? "has-unread" : ""}`} aria-label={unreadChatCount ? localize(`チャット欄・新着${unreadChatCount}件`, `Chat · ${unreadChatCount} unread`) : localize("チャット表示を切り替える", "Toggle chat")} aria-pressed={chatOpen} onClick={() => { setChatOpen((current) => !current); setChatMuted(false); setUnreadChatCount(0); setChatToast(null); }}>{localize("チャット欄", "CHAT")}{unreadChatCount > 0 && <i className="chat-unread" aria-hidden="true">{unreadChatCount}</i>}</button>}
                {mode === "online" && online.code && <button type="button" className={`chat-mute ${chatMuted ? "active danger" : ""}`} aria-label={localize("チャットをミュートする", "Mute chat")} aria-pressed={chatMuted} onClick={() => { setChatMuted((current) => !current); setChatOpen(false); }}>⊘</button>}
                {mode === "online" && online.code && online.isHost && online.status === "waiting" && <button type="button" className={`room-lock ${online.joinLocked ? "active danger" : ""}`} aria-label={online.joinLocked ? localize("ルーム参加受付を再開", "Reopen room") : localize("これ以上の参加を締め切る", "Close room to new members")} aria-pressed={Boolean(online.joinLocked)} disabled={online.pending} onClick={() => void toggleRoomLock()}>{online.joinLocked ? "▣" : "▢"}</button>}
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
              <option value="item">{localize("アイテム戦", "ITEM BATTLE")}</option>
              <option value="team-item">{localize("2 VS 2 チームアイテム戦", "2 VS 2 TEAM ITEM")}</option>
            </select>
          </label>
          <label className="ranked-setting">
            {localize("真剣タイマン", "RANKED DUEL")}
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
            <div className="vs-ai-count" aria-label={localize("AI対戦の人数", "AI match player count")}>
              <span>{setupMode === "lab" ? localize("AI LAB人数", "AI LAB PLAYERS") : localize("VS AI人数", "VS AI PLAYERS")}</span>
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
                  {localize(`${count}人`, `${count} PLAYERS`)}
                </button>
              ))}
            </div>
          )}
          {setupMode === "human" && (
            <div className="vs-ai-count" aria-label={localize("追加AI人数", "Additional AI count")}>
              <span>{localize("追加AI", "ADD AI")}</span>
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
                  {localize(`${count}体`, `${count} AI`)}
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
              <select value="random" disabled aria-label={localize("先攻はランダム", "First player is random")}>
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
            {localize("変更内容は次の対戦開始時に反映されます。", "Changes apply when the next match begins.")}
          </div>
        )}
        {mode === "online" && (
          <section className="online-panel" aria-label={localize("オンライン対戦", "Online match")}>
            <div className="online-copy">
              <span>ONLINE MATCH</span>
              <strong>
                {online.code
                  ? online.status === "waiting"
                    ? localize(`参加待ち ${online.joinedPlayers}/${online.maxPlayers}`, `WAITING ${online.joinedPlayers}/${online.maxPlayers}`)
                    : localize(`${online.role ? playerName(online.role) : "観戦"}として参加中`, `JOINED AS ${online.role ? playerName(online.role) : "SPECTATOR"}`)
                  : localize("ルームを作るか、6文字のコードで参加", "CREATE A ROOM OR JOIN WITH A 6-CHARACTER CODE")}
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
              <div className="online-count" aria-label={localize("オンライン対戦の人数", "Online room population")}>
                <span>ROOM CAPACITY</span><strong>{localize(`${online.roomCount ?? online.memberNames.length}人入室 · ${online.joinedPlayers}人参加 · ${online.spectatorCount ?? 0}人観戦`, `${online.roomCount ?? online.memberNames.length} IN ROOM · ${online.joinedPlayers} PLAYING · ${online.spectatorCount ?? 0} WATCHING`)}</strong>
              </div>
            )}
            {online.code && online.isHost && !rankedMode && <div className="room-rule-console"><div><span>ITEM</span><button type="button" className={isItemVariant(variant)?"on":""} onClick={toggleRoomItemMode}>{isItemVariant(variant)?"ON":"OFF"}</button></div><div><span>TEAM</span><button type="button" className={isTeamVariant(variant)?"on":""} onClick={()=>void setRoomTeamMode(!isTeamVariant(variant))}>{isTeamVariant(variant)?"ON":"OFF"}</button></div><label>BOARD<select value={size} onChange={(event)=>{setSize(Number(event.target.value));setNeedsNewGame(true);}}>{(isTeamVariant(variant)?[13,15]:isItemVariant(variant)?[11,13,15]:[9,11]).map((boardSize)=><option key={boardSize} value={boardSize}>{boardSize} × {boardSize}</option>)}</select></label></div>}
            {online.code && <div className="room-settings-summary" aria-label={localize("現在のルーム設定", "Current room settings")}><span>{isTeamVariant(variant) ? "TEAM BATTLE" : "FREE FOR ALL"}</span><b>{isItemVariant(variant) ? "ITEM" : "CLASSIC"}</b><b>{size} × {size}</b><b>CPU {onlineAiCount} · {aiDifficulty.toUpperCase()}</b></div>}
            {!online.code && <><input value={nickname} onChange={(event) => setNickname(event.target.value.slice(0, COMMUNITY_SAFETY.nicknameMaxLength))} placeholder="NICKNAME" aria-label={t("nickname")} maxLength={COMMUNITY_SAFETY.nicknameMaxLength}/><input value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="ROOM CODE" aria-label={localize("ルームコード", "Room code")} maxLength={6}/><button onClick={createOnlineRoom} disabled={online.pending}>CREATE ROOM</button><button onClick={joinOnlineRoom} disabled={online.pending || !roomCodeInput}>JOIN ROOM</button><button type="button" className="online-main-return" onClick={() => setEntryStage("rule")}>{localize("← ゲームモードへ戻る", "← BACK TO GAME MODE")}</button></>}
            {online.code && !online.role && (
              <span className="spectator-badge">SPECTATING</span>
            )}
            {online.status === "finished" && online.role && (
              <button onClick={returnOnlineLobby} disabled={online.pending}>MATCH ROOM</button>
            )}
            {online.code && online.isHost && online.status !== "waiting" && <button type="button" onClick={() => void returnOnlineLobby()} disabled={online.pending}>{localize("設定を変えて仕切り直す", "CHANGE SETTINGS AND RESTART")}</button>}
            {online.code && <code>{online.code}</code>}
            {online.code && (
              <div className={`room-members ${isTeamVariant(variant)?"team-room-members":""}`} aria-label={localize("ルームメンバー", "Room members")}>
                <span>MEMBERS</span>{isTeamVariant(variant)&&<><strong className="team-heading red-team">RED TEAM</strong><strong className="team-heading blue-team">BLUE TEAM</strong></>}
                {online.memberNames.map((name, index) => (
                  <div
                    key={`${name}-${index}`}
                    className={online.memberRoles[index] ?? "spectator"}
                  >
                    <b>{name}{index === 0 ? " / LEADER" : ""}</b><small>{online.memberRoles[index] ? playerName(online.memberRoles[index]!) : "WATCH"}</small>
                    {online.isHost && online.status !== "playing" && <span className="member-actions">{index < 4 && <button type="button" onClick={()=>online.memberRoles[index]?void manageRoomMember(index,"spectate"):void manageRoomMember(index,"seat",PLAYER_ORDER.find((player)=>!online.memberRoles.includes(player))??"blue")}>{online.memberRoles[index]?localize("観戦へ", "SPECTATE"):localize("選手へ", "PLAY")}</button>}{index>0&&<button type="button" onClick={()=>void manageRoomMember(index,"kick")}>{localize("退出させる", "REMOVE")}</button>}</span>}
                    {isTeamVariant(variant)&&index!==ownMemberIndex&&online.memberRoles[index]&&online.isHost&&online.role&&online.status!=="playing"&&<button type="button" className="team-switch" onClick={()=>void swapOwnRole(online.memberRoles[index]!)}>{localize("このメンバーと入れ替え", "SWAP WITH MEMBER")}</button>}
                  </div>
                ))}
                {lobbyAiRoles.map((role,index)=><div key={`cpu-${index}`} className={`cpu-member ${role}`}><b>CPU {index+1}</b><small>{isTeamVariant(variant)?teamOf(role)==="sun"?"RED TEAM":"BLUE TEAM":playerName(role)}</small><i>AI</i>{online.isHost&&online.role&&online.status!=="playing"&&<button type="button" className="team-switch" onClick={()=>void swapOwnRole(role)}>{localize("CPUと入れ替え", "SWAP WITH CPU")}</button>}</div>)}
              </div>
            )}
            {online.code && online.isHost && (
              <div className="online-count ai-members-card" aria-label={localize("オンライン追加AI人数", "Additional online AI count")}>
                <div><span>AI MEMBERS</span><small>{localize("空席へCPU探査機を追加", "Add CPU probes to empty seats")}</small></div><div className="ai-member-controls"><label className="ai-level-inline">LEVEL<select value={aiDifficulty} onChange={(event) => setAiDifficulty(event.target.value as AiDifficulty)}><option value="easy">EASY</option><option value="normal">NORMAL</option><option value="hard">HARD</option></select></label><div className="ai-stepper"><button type="button" disabled={onlineAiCount === 0} onClick={() => { setOnlineAiCount((onlineAiCount - 1) as 0|1|2|3); setNeedsNewGame(true); }}>−</button><b>{onlineAiCount}<small> AI</small></b><button type="button" disabled={onlinePlayerCount + onlineAiCount >= 4} onClick={() => { const next=Math.min(3,onlineAiCount+1) as 0|1|2|3; setOnlineAiCount(next); if(onlinePlayerCount+next>2&&size===9)setSize(11); setNeedsNewGame(true); }}>＋</button></div></div>
              </div>
            )}
            {online.code && online.isHost && (
              <span className="room-leader-badge">ROOM LEADER</span>
            )}
            {online.code && online.isHost && !rankedMode && (
              <button type="button" className="apply-room-settings" onClick={applyNewGameSettings} disabled={online.pending}>
                {localize("ルーム設定を適用して対戦開始", "APPLY ROOM SETTINGS AND START")}
              </button>
            )}
            {online.code && online.isHost && rankedMode && (
              <button type="button" className="apply-room-settings ranked" onClick={applyNewGameSettings} disabled={online.pending || online.joinedPlayers < 2}>
                {online.joinedPlayers < 2 ? localize("対戦相手を待っています", "WAITING FOR AN OPPONENT") : localize(`${isItemVariant(variant) ? "ITEM" : "CLASSIC"} 真剣タイマンを開始`, `START ${isItemVariant(variant) ? "ITEM" : "CLASSIC"} RANKED DUEL`)}
              </button>
            )}
            {online.code && (
              <button
                type="button"
                className="leave-room-button"
                onClick={() => void leaveOnlineRoom()}
                disabled={online.pending}
              >
                {localize("ルーム退出", "LEAVE ROOM")}
              </button>
            )}
            {online.error && <small>{language === "ja" ? online.error : "The online operation could not be completed. Please try again."}</small>}
          </section>
        )}
        {mode === "lab" && <details className="ai-lab-panel">
          <summary><span>AI STRATEGY LAB</span><strong>{strategicRead}</strong><small>OPEN DEBUG DATA</small></summary>
          <section className="ai-lab">
          <div className="lab-stat"><b>{stats.games}</b><span>{localize("対戦数", "MATCHES")}</span></div>
          {isTeamVariant(game.variant) ? (
            <>
              <div className="lab-stat red">
                <b>{teamWinRates.sun}%</b>
                <span>{localize("SUN TEAM勝率", "SUN TEAM WIN RATE")}</span>
              </div>
              <div className="lab-stat blue">
                <b>{teamWinRates.moon}%</b>
                <span>{localize("MOON TEAM勝率", "MOON TEAM WIN RATE")}</span>
              </div>
            </>
          ) : activePlayers(game).map((player) => (
              <div key={player} className={`lab-stat ${player}`}>
                <b>{winRates[player]}%</b>
                <span>{playerName(player)} {localize("勝率", "WIN RATE")}</span>
              </div>
            ))}
          <div className="lab-stat"><b>{averageTurns}</b><span>{localize("平均手数", "AVG. TURNS")}</span></div>
          <div className="strategy-note">
            <b>{localize("AIの基本戦略", "AI BASE STRATEGY")}</b>
            {localize("中央へ近づく移動を優先し、自機を中央へ押す配置、相手を遠ざける配置、相手メテオの破壊を評価します。勝率が一方へ60%以上偏り続ける場合、必勝に近い定石や先後差の候補です。", "The AI prioritizes progress toward the center, propulsion setups, rival displacement, and removing opposing meteors. A sustained win rate above 60% may indicate a strong opening or turn-order advantage.")}
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
