const WORLD = { width: 960, height: 600, columns: 12, rows: 8, cell: 72, left: 48, top: 12 };
const CORE = { x: 480, y: 300, radius: 62 };
const ACTION_COOLDOWN = 900;
const MAX_WALLS = 18;
const CORE_SHIELD_DURATION = 4000;
const ABILITY_COOLDOWNS = { Constructor: 22000, Glitcher: 8000 };
const CHAOS_INTERVALS = { chill: 90000, standard: 60000, wild: 45000 };
const PLAYER_ID = "solo-player";

function nearestGridCell(x, y) {
  const column = Math.max(0, Math.min(WORLD.columns - 1, Math.round((x - WORLD.left - WORLD.cell / 2) / WORLD.cell)));
  const row = Math.max(0, Math.min(WORLD.rows - 1, Math.round((y - WORLD.top - WORLD.cell / 2) / WORLD.cell)));
  return {
    column,
    row,
    x: WORLD.left + column * WORLD.cell + WORLD.cell / 2,
    y: WORLD.top + row * WORLD.cell + WORLD.cell / 2,
  };
}

function makePlayer(id, name, role, teamIndex, teamSize) {
  return {
    id,
    name,
    role,
    score: 0,
    x: WORLD.width / 2 + (teamIndex - (teamSize - 1) / 2) * 60,
    y: role === "Constructor" ? 54 : WORLD.height - 54,
    input: { up: false, down: false, left: false, right: false },
    lastActionAt: 0,
    botActionReadyAt: 0,
    abilityReadyAt: 0,
    dashUntil: 0,
    dashX: 0,
    dashY: 0,
  };
}

export function createLocalMatch({ playerName, role, duration, chaos, onState, onAction, onAbility, onEvent, onFinish }) {
  const otherRole = role === "Constructor" ? "Glitcher" : "Constructor";
  const teamRoles = role === "Constructor"
    ? ["Constructor", "Glitcher", "Constructor", "Glitcher"]
    : ["Glitcher", "Constructor", "Glitcher", "Constructor"];
  const teamIndexes = { Constructor: 0, Glitcher: 0 };
  const players = [
    makePlayer(PLAYER_ID, playerName, role, 0, 2),
    ...["Nova", "Byte", "Echo"].map((name, index) => {
      const botRole = teamRoles[index + 1] === otherRole ? otherRole : role;
      const teamIndex = teamIndexes[botRole]++;
      return makePlayer(`bot-${index}`, name, botRole, teamIndex, 2);
    }),
  ];
  const state = {
    players,
    walls: [],
    coreHealth: 100,
    timeRemaining: duration,
    modifier: null,
    modifierRemaining: 0,
    coreShieldRemaining: 0,
  };
  const startedAt = Date.now();
  let lastTickAt = startedAt;
  let lastChaosAt = startedAt;
  let modifierUntil = 0;
  let coreShieldUntil = 0;
  let finished = false;

  function snapshot(now) {
    state.timeRemaining = Math.max(0, Math.ceil((duration * 1000 - (now - startedAt)) / 1000));
    state.modifierRemaining = Math.max(0, Math.ceil((modifierUntil - now) / 1000));
    state.coreShieldRemaining = Math.max(0, Math.ceil((coreShieldUntil - now) / 1000));
    state.players = players.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      x: player.x,
      y: player.y,
      score: player.score,
      abilityRemaining: Math.max(0, Math.ceil((player.abilityReadyAt - now) / 1000)),
      dashRemaining: Math.max(0, player.dashUntil - now),
    }));
    return state;
  }

  function doAction(player, now) {
    if (now - player.lastActionAt < ACTION_COOLDOWN) return null;
    player.lastActionAt = now;
    if (player.role === "Constructor") {
      if (state.walls.length >= MAX_WALLS) return null;
      const cell = nearestGridCell(player.x, player.y);
      if (Math.hypot(cell.x - CORE.x, cell.y - CORE.y) < CORE.radius + 30) return null;
      if (Math.hypot(cell.x - CORE.x, cell.y - CORE.y) > 300) return null;
      if (state.walls.some((wall) => wall.column === cell.column && wall.row === cell.row)) return null;
      state.walls.push({ ...cell });
      player.score += 1;
      return "build";
    }
    if (Math.hypot(player.x - CORE.x, player.y - CORE.y) <= CORE.radius + 38) {
      if (coreShieldUntil > now) return null;
      state.coreHealth = Math.max(0, state.coreHealth - 8);
      player.score += 8;
      return "hack";
    }
    const wallIndex = state.walls.findIndex((wall) => Math.hypot(player.x - wall.x, player.y - wall.y) <= 76);
    if (wallIndex >= 0) {
      state.walls.splice(wallIndex, 1);
      player.score += 3;
      return "break";
    }
    return null;
  }

  function botAction(player, now) {
    if (player.botActionReadyAt > now) return null;
    if (player.role === "Glitcher") {
      const nearCore = Math.hypot(player.x - CORE.x, player.y - CORE.y) <= CORE.radius + 38;
      const nearWall = state.walls.some((wall) => Math.hypot(player.x - wall.x, player.y - wall.y) <= 76);
      if (nearCore || nearWall) {
        const action = doAction(player, now);
        if (action) player.botActionReadyAt = now + 3500;
        return action;
      }
    } else if (Math.hypot(player.x - CORE.x, player.y - CORE.y) < 285 && state.walls.length < MAX_WALLS) {
      const action = doAction(player, now);
      if (action) {
        player.botActionReadyAt = now + 3500;
        return action;
      }
    }
    return null;
  }

  function chooseBotInput(player) {
    const target = player.role === "Glitcher"
      ? CORE
      : { x: CORE.x, y: player.y < CORE.y ? CORE.y - 240 : CORE.y + 240 };
    const distance = Math.hypot(target.x - player.x, target.y - player.y);
    if (player.role === "Glitcher" && distance <= CORE.radius + 30) {
      player.input = { up: false, down: false, left: false, right: false };
      return;
    }
    const directions = [
      { up: true, down: false, left: false, right: false, x: 0, y: -1 },
      { up: false, down: true, left: false, right: false, x: 0, y: 1 },
      { up: false, down: false, left: true, right: false, x: -1, y: 0 },
      { up: false, down: false, left: false, right: true, x: 1, y: 0 },
    ];
    const candidates = directions
      .map((direction) => {
        const x = Math.max(26, Math.min(WORLD.width - 26, player.x + direction.x * 18));
        const y = Math.max(26, Math.min(WORLD.height - 26, player.y + direction.y * 18));
        const blocked = state.walls.some((wall) => Math.hypot(x - wall.x, y - wall.y) < 38);
        return { direction, score: blocked ? Infinity : Math.hypot(target.x - x, target.y - y) };
      })
      .sort((a, b) => a.score - b.score);
    player.input = candidates[0].score < distance
      ? { up: candidates[0].direction.up, down: candidates[0].direction.down, left: candidates[0].direction.left, right: candidates[0].direction.right }
      : { up: false, down: false, left: false, right: false };
  }

  function tick() {
    if (finished) return;
    const now = Date.now();
    const deltaMs = Math.min(now - lastTickAt, 200);
    lastTickAt = now;
    if (modifierUntil <= now) state.modifier = null;
    if (chaos !== "off" && now - lastChaosAt >= CHAOS_INTERVALS[chaos]) {
      lastChaosAt = now;
      state.modifier = ["gravity", "darkness", "surge"][Math.floor(Math.random() * 3)];
      modifierUntil = now + 12000;
      onEvent(state.modifier, 12);
    }

    for (const player of players) {
      if (player.id !== PLAYER_ID) {
        chooseBotInput(player);
        const action = botAction(player, now);
        if (action) onAction(action, player.id);
      }
      let horizontal = Number(player.input.right) - Number(player.input.left);
      let vertical = Number(player.input.down) - Number(player.input.up);
      if (player.dashUntil > now) {
        horizontal = player.dashX;
        vertical = player.dashY;
      }
      if (state.modifier === "gravity") {
        horizontal *= -1;
        vertical *= -1;
      }
      const magnitude = Math.hypot(horizontal, vertical) || 1;
      const speed = (state.modifier === "surge" ? 1.55 : 1) * (player.dashUntil > now ? 3.25 : 1);
      const distance = 180 * speed * Math.min(deltaMs, 200) / 1000;
      const nextX = Math.max(26, Math.min(WORLD.width - 26, player.x + (horizontal / magnitude) * distance));
      const nextY = Math.max(26, Math.min(WORLD.height - 26, player.y + (vertical / magnitude) * distance));
      if (!state.walls.some((wall) => Math.hypot(nextX - wall.x, nextY - wall.y) < 38)) {
        player.x = nextX;
        player.y = nextY;
      }
    }

    if (state.coreHealth <= 0 || now - startedAt >= duration * 1000) {
      finished = true;
      const winner = state.coreHealth <= 0 ? "Glitchers" : "Constructors";
      onState(snapshot(now));
      onFinish({
        winner,
        coreHealth: state.coreHealth,
        results: players.map(({ name, role, score }) => ({ name, role, score })),
      });
      return;
    }
    onState(snapshot(now));
  }

  const interval = setInterval(tick, 100);
  onState(snapshot(startedAt));
  onEvent("start", 0);

  return {
    input(value) {
      const player = players[0];
      player.input = { up: value.up === true, down: value.down === true, left: value.left === true, right: value.right === true };
    },
    action() {
      if (finished) return;
      const action = doAction(players[0], Date.now());
      if (action) onAction(action, PLAYER_ID);
    },
    ability() {
      if (finished) return;
      const player = players[0];
      const now = Date.now();
      if (player.abilityReadyAt > now) return;
      if (role === "Constructor") {
        coreShieldUntil = Math.max(coreShieldUntil, now) + CORE_SHIELD_DURATION;
        player.abilityReadyAt = now + ABILITY_COOLDOWNS.Constructor;
        onAbility("shield");
      } else {
        let horizontal = Number(player.input.right) - Number(player.input.left);
        let vertical = Number(player.input.down) - Number(player.input.up);
        if (horizontal === 0 && vertical === 0) {
          horizontal = CORE.x - player.x;
          vertical = CORE.y - player.y;
        }
        const magnitude = Math.hypot(horizontal, vertical) || 1;
        player.dashX = horizontal / magnitude;
        player.dashY = vertical / magnitude;
        player.dashUntil = now + 500;
        player.abilityReadyAt = now + ABILITY_COOLDOWNS.Glitcher;
        onAbility("dash");
      }
    },
    stop() {
      finished = true;
      clearInterval(interval);
    },
  };
}
