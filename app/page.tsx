"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Player = "red" | "blue";
type MeteorSize = "small" | "large";
type Pos = { r: number; c: number };
type Meteor = Pos & { owner: Player; size: MeteorSize; id: number };
type Inventory = Record<Player, Record<MeteorSize, number>>;
type Phase = "move" | "place" | "over";
type Mode = "human" | "cpu" | "lab";
type BlastFx = {
  target: Pos;
  owner: Player;
  size: MeteorSize;
  destroyedIds: number[];
  pushed: Partial<Record<Player, { from: Pos; dr: number; dc: number }>>;
};

type GameState = {
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

const other = (player: Player): Player => (player === "red" ? "blue" : "red");
const samePos = (a: Pos, b: Pos) => a.r === b.r && a.c === b.c;
const distance = (a: Pos, b: Pos) =>
  Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
const playerName = (p: Player) => (p === "red" ? "RED" : "BLUE");
const meteorName = (s: MeteorSize) => (s === "small" ? "小メテオ" : "大メテオ");

function initialState(size: number, first: Player): GameState {
  const mid = Math.floor(size / 2);
  const probes: Record<Player, Pos> =
    first === "red"
      ? { red: { r: size - 1, c: mid }, blue: { r: 0, c: mid } }
      : { red: { r: size - 1, c: mid }, blue: { r: 0, c: mid } };
  return {
    size,
    turn: first,
    phase: "move",
    turnCount: 0,
    probes,
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

function legalMoves(state: GameState, player = state.turn): Pos[] {
  const p = state.probes[player];
  return [
    { r: p.r - 1, c: p.c },
    { r: p.r + 1, c: p.c },
    { r: p.r, c: p.c - 1 },
    { r: p.r, c: p.c + 1 },
  ].filter(
    (q) =>
      q.r >= 0 &&
      q.c >= 0 &&
      q.r < state.size &&
      q.c < state.size &&
      !samePos(q, state.probes[other(player)]) &&
      !state.meteors.some((m) => samePos(m, q)),
  );
}

function stateKey(state: GameState, nextTurn: Player) {
  const ms = [...state.meteors]
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map((m) => `${m.r},${m.c},${m.owner},${m.size}`)
    .join("|");
  return [
    nextTurn,
    `${state.probes.red.r},${state.probes.red.c}`,
    `${state.probes.blue.r},${state.probes.blue.c}`,
    ms,
    JSON.stringify(state.inventory),
  ].join("/");
}

function Game() {
  const [size, setSize] = useState(9);
  const [first, setFirst] = useState<Player>("red");
  const [game, setGame] = useState<GameState>(() => initialState(9, "red"));
  const [history, setHistory] = useState<GameState[]>([]);
  const [mode, setMode] = useState<Mode>("human");
  const [aiRunning, setAiRunning] = useState(true);
  const [aiSpeed, setAiSpeed] = useState(420);
  const [blastFx, setBlastFx] = useState<BlastFx | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [stats, setStats] = useState({ games: 0, red: 0, blue: 0, draw: 0, turns: 0 });
  const recordedOutcome = useRef("");
  const mid = Math.floor(game.size / 2);
  const moves = useMemo(() => legalMoves(game), [game]);

  const commit = (next: GameState) => {
    setHistory((h) => [...h, game]);
    setGame(next);
  };

  const playBoom = () => {
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

  const finishTurn = (draft: GameState, extraLog?: string): GameState => {
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
      selected:
        draft.inventory[nextTurn].small > 0 ? "small" : "large",
      message: `${playerName(nextTurn)}：探査機を1マス移動`,
      log: [...draft.log, ...(extraLog ? [extraLog] : [])],
    };
  };

  const moveProbe = (target: Pos) => {
    if (game.phase !== "move" || !moves.some((p) => samePos(p, target))) return;
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
      game.inventory[game.turn].small + game.inventory[game.turn].large > 0;
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
      game.inventory[game.turn].small + game.inventory[game.turn].large > 0;
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
    const chosenSize = sizeOverride ?? game.selected;
    if (
      isAnimating ||
      game.phase !== "place" ||
      samePos(target, { r: mid, c: mid }) ||
      samePos(target, game.probes.red) ||
      samePos(target, game.probes.blue) ||
      game.meteors.some((m) => samePos(m, target)) ||
      game.inventory[game.turn][chosenSize] <= 0
    )
      return;

    const blastRadius = chosenSize === "small" ? 1 : 2;
    const destroyed = game.meteors.filter((m) => distance(m, target) <= blastRadius);
    const survivors = game.meteors.filter((m) => distance(m, target) > blastRadius);
    const placed: Meteor = {
      ...target,
      owner: game.turn,
      size: chosenSize,
      id: game.nextMeteorId,
    };
    const inventory: Inventory = {
      red: { ...game.inventory.red },
      blue: { ...game.inventory.blue },
    };
    inventory[game.turn][chosenSize] -= 1;
    destroyed.forEach((m) => {
      inventory[m.owner][m.size] += 1;
    });
    const remaining = [...survivors, placed];
    const before = game.probes;
    const probes: Record<Player, Pos> = {
      red: { ...before.red },
      blue: { ...before.blue },
    };
    const reached: Player[] = [];

    (["red", "blue"] as Player[]).forEach((player) => {
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
          remaining.some((m) => samePos(m, next)) ||
          samePos(next, before[other(player)]);
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
      const winner = reached.length === 1 ? reached[0] : "draw";
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
      target,
      owner: game.turn,
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
    });
    playBoom();
    window.setTimeout(() => commit(resolved), 820);
    window.setTimeout(() => {
      setBlastFx(null);
      setIsAnimating(false);
    }, 1080);
  };

  const handleCell = (r: number, c: number) => {
    if (isAnimating) return;
    if (game.phase === "move") moveProbe({ r, c });
    if (game.phase === "place") placeMeteor({ r, c });
  };

  const reset = () => {
    setBlastFx(null);
    setIsAnimating(false);
    setHistory([]);
    setGame(initialState(size, first));
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setGame(previous);
    setHistory((h) => h.slice(0, -1));
  };

  const validPlacement = (r: number, c: number) =>
    game.phase === "place" &&
    !(r === mid && c === mid) &&
    !samePos({ r, c }, game.probes.red) &&
    !samePos({ r, c }, game.probes.blue) &&
    !game.meteors.some((m) => m.r === r && m.c === c);

  const isAiTurn =
    mode === "lab" || (mode === "cpu" && game.turn === "blue");

  useEffect(() => {
    if (game.phase !== "over" || !game.winner) return;
    const key = `${game.turnCount}-${game.log.length}-${game.winner}`;
    if (recordedOutcome.current === key) return;
    recordedOutcome.current = key;
    setStats((s) => ({
      games: s.games + 1,
      red: s.red + (game.winner === "red" ? 1 : 0),
      blue: s.blue + (game.winner === "blue" ? 1 : 0),
      draw: s.draw + (game.winner === "draw" ? 1 : 0),
      turns: s.turns + game.turnCount,
    }));
  }, [game.phase, game.winner, game.turnCount, game.log.length]);

  useEffect(() => {
    if (mode !== "lab" || !aiRunning || game.phase !== "over") return;
    const timer = window.setTimeout(() => {
      const nextFirst: Player = stats.games % 2 === 0 ? "blue" : "red";
      setFirst(nextFirst);
      setHistory([]);
      recordedOutcome.current = "";
      setGame(initialState(size, nextFirst));
    }, Math.max(120, aiSpeed));
    return () => window.clearTimeout(timer);
  }, [mode, aiRunning, game.phase, aiSpeed, size, stats.games]);

  useEffect(() => {
    if (!isAiTurn || !aiRunning || isAnimating || game.phase === "over") return;
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

      const options: { p: Pos; size: MeteorSize; score: number }[] = [];
      const center = { r: mid, c: mid };
      const me = game.turn;
      const foe = other(me);
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
              if (distance(m, p) <= radius) score += m.owner === foe ? 5 : -1.5;
            });
            ([
              [me, 1],
              [foe, -1],
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
              const gain = coreDistance(start) - coreDistance(projected);
              score += polarity * gain * 9;
              if (samePos(projected, center)) score += polarity * 1000;
            });
            options.push({ p, size: meteorSize, score });
          }
        }
      });
      options.sort((a, b) => b.score - a.score);
      if (options[0]) placeMeteor(options[0].p, options[0].size);
    }, aiSpeed);
    return () => window.clearTimeout(timer);
  }, [game, mode, aiRunning, aiSpeed, isAiTurn, isAnimating, moves, mid]);

  const redRate = stats.games ? Math.round((stats.red / stats.games) * 100) : 0;
  const blueRate = stats.games ? Math.round((stats.blue / stats.games) * 100) : 0;
  const averageTurns = stats.games ? (stats.turns / stats.games).toFixed(1) : "—";
  const strategicRead =
    stats.games < 10
      ? "10戦以上で傾向を判定します"
      : Math.abs(redRate - blueRate) <= 10
        ? "現時点では大きな陣営差なし"
        : redRate > blueRate
          ? "赤側優勢。先後・初期方向の影響を要観察"
          : "青側優勢。後攻の初手メテオが有力";

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
          <div className="status" aria-live="polite">
            <span className={`status-dot ${game.turn}`} />
            {game.message}
          </div>
          <div
            className="board"
            style={{ gridTemplateColumns: `repeat(${game.size}, 1fr)` }}
            aria-label={`${game.size}×${game.size} ゲーム盤`}
          >
            {Array.from({ length: game.size * game.size }, (_, index) => {
              const r = Math.floor(index / game.size);
              const c = index % game.size;
              const pos = { r, c };
              const probe = samePos(pos, game.probes.red)
                ? "red"
                : samePos(pos, game.probes.blue)
                  ? "blue"
                  : null;
              const meteor = game.meteors.find((m) => samePos(m, pos));
              const legal = game.phase === "move" && moves.some((m) => samePos(m, pos));
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
                  aria-label={`座標 ${r},${c}${probe ? ` ${playerName(probe)}探査機` : ""}${meteor ? ` ${meteorName(meteor.size)}` : ""}`}
                >
                  {r === mid && c === mid && <span className="core-ring"><b>CORE</b></span>}
                  {blastFx && samePos(pos, blastFx.target) && (
                    <>
                      <span className={`impact-flash ${blastFx.owner}`} />
                      <span className={`shockwave ${blastFx.size}`} />
                      <MeteorIcon
                        meteor={{ ...blastFx.target, owner: blastFx.owner, size: blastFx.size, id: -1 }}
                        falling
                      />
                    </>
                  )}
                  {meteor && (
                    <MeteorIcon
                      meteor={meteor}
                      destroyed={blastFx?.destroyedIds.includes(meteor.id)}
                    />
                  )}
                  {probe && (
                    <ProbeToken
                      player={probe}
                      push={
                        blastFx?.pushed[probe] &&
                        samePos(pos, blastFx.pushed[probe].from)
                          ? blastFx.pushed[probe]
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
              </>
            )}
            {game.phase === "move" && moves.length === 0 && (
              <button className="primary-action" onClick={skipBlockedMove}>
                移動不能 — メテオ配置へ
              </button>
            )}
            {game.phase === "over" && (
              <button className="primary-action" onClick={reset}>もう一度プレイ</button>
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

      <section className="control-strip">
        <div className="settings">
          <label>
            MODE
            <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="human">2 PLAYERS</option>
              <option value="cpu">VS BLUE AI</option>
              <option value="lab">AI vs AI LAB</option>
            </select>
          </label>
          <label>
            BOARD
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
              <option value={9}>9 × 9</option>
              <option value={11}>11 × 11</option>
            </select>
          </label>
          <label>
            FIRST
            <select value={first} onChange={(e) => setFirst(e.target.value as Player)}>
              <option value="red">RED</option>
              <option value="blue">BLUE</option>
            </select>
          </label>
          <button onClick={reset}>NEW GAME</button>
          <button onClick={undo} disabled={!history.length}>UNDO</button>
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
        <section className="ai-lab">
          <div className="lab-title">
            <span>AI STRATEGY LAB</span>
            <strong>{strategicRead}</strong>
          </div>
          <div className="lab-stat"><b>{stats.games}</b><span>対戦数</span></div>
          <div className="lab-stat red"><b>{redRate}%</b><span>RED勝率</span></div>
          <div className="lab-stat blue"><b>{blueRate}%</b><span>BLUE勝率</span></div>
          <div className="lab-stat"><b>{averageTurns}</b><span>平均手数</span></div>
          <div className="strategy-note">
            <b>AIの基本戦略</b>
            中央へ近づく移動を優先し、自機を中央へ押す配置、相手を遠ざける配置、相手メテオの破壊を評価します。
            勝率が一方へ60%以上偏り続ける場合、必勝に近い定石や先後差の候補です。
          </div>
          <button className="reset-stats" onClick={() => setStats({ games: 0, red: 0, blue: 0, draw: 0, turns: 0 })}>RESET DATA</button>
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
  push,
}: {
  player: Player;
  push?: { from: Pos; dr: number; dc: number };
}) {
  return (
    <span
      className={`probe-token ${player}${push ? " blast-lift" : ""}`}
      style={
        push
          ? ({
              "--push-x": `${push.dc * 147}%`,
              "--push-y": `${push.dr * 147}%`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <i>▲</i>
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
