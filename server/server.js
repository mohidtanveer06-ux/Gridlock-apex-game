import express from "express";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

const PORT = Number(process.env.PORT) || 3000;
const WORLD = { width: 960, height: 600, columns: 12, rows: 8, cell: 72, left: 48, top: 12 };
const CORE = { x: 480, y: 300, radius: 62 };
const ROOM_CAPACITIES = new Set([4, 6, 8, 10]);
const MATCH_DURATIONS = new Set([90, 120, 150, 180]);
const CHAOS_LEVELS = new Set(["off", "chill", "standard", "wild"]);
const CHAOS_INTERVALS = { chill: 90000, standard: 60000, wild: 45000 };
const rooms = new Map();
const ACTION_COOLDOWN = 900;
const QUICK_PLAY_SETTINGS = { maxPlayers: 8, duration: 120, chaos: "standard" };
const MIN_MATCH_PLAYERS = 2;
const AUTO_START_MIN_PLAYERS = 3;
const AUTO_START_DELAY = 12000;
const RESULT_LINGER = 20000;
const MAX_WALLS = 18;
const ABILITY_COOLDOWNS = { Constructor: 22000, Glitcher: 8000 };
const CORE_SHIELD_DURATION = 4000;
const DASH_DURATION = 500;

app.get("/health", (_request, response) => {
  response.json({ status: "ok", rooms: rooms.size });
});

if (process.env.NODE_ENV === "production") {
  const dist = join(here, "..", "dist");
  app.use(express.static(dist));
  app.get("/{*path}", (_request, response) => response.sendFile(join(dist, "index.html")));
}

function sanitizeName(value) {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 16);
  return name || null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSettings(candidate = {}) {
  if (!isRecord(candidate)) return null;
  const maxPlayers = Number(candidate.maxPlayers ?? 4);
  const duration = Number(candidate.duration ?? 120);
  const chaos = candidate.chaos ?? "standard";
  if (!ROOM_CAPACITIES.has(maxPlayers) || !MATCH_DURATIONS.has(duration) || !CHAOS_LEVELS.has(chaos)) {
    return null;
  }
  return { maxPlayers, duration, chaos };
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function roomFor(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    isPublic: room.isPublic,
    autoStartIn: room.autoStartAt ? Math.max(0, Math.ceil((room.autoStartAt - Date.now()) / 1000)) : null,
    minPlayers: room.isPublic ? AUTO_START_MIN_PLAYERS : MIN_MATCH_PLAYERS,
    settings: room.settings,
    players: room.players.map(({ id, name, ready, role, score }) => ({ id, name, ready, role, score })),
  };
}

function lobbySummary(room) {
  return {
    code: room.code,
    host: room.players.find((player) => player.id === room.hostId)?.name ?? "Host",
    players: room.players.length,
    maxPlayers: room.settings.maxPlayers,
    duration: room.settings.duration,
    chaos: room.settings.chaos,
    autoStartIn: room.autoStartAt ? Math.max(0, Math.ceil((room.autoStartAt - Date.now()) / 1000)) : null,
  };
}

function publishRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function ackError(ack, message) {
  if (typeof ack === "function") ack({ ok: false, error: message });
}

function createRoom(hostId, settings, isPublic = false) {
  const room = {
    code: makeCode(),
    hostId,
    players: [],
    settings,
    isPublic,
    phase: "lobby",
    walls: [],
    coreHealth: 100,
    startedAt: 0,
    lastChaosAt: 0,
    modifier: null,
    modifierUntil: 0,
    coreShieldUntil: 0,
    autoStartAt: null,
    autoStartSecond: -1,
    cleanupTimer: null,
  };
  rooms.set(room.code, room);
  return room;
}

function bestPublicRoom() {
  let best = null;
  for (const room of rooms.values()) {
    if (!room.isPublic || room.phase !== "lobby") continue;
    if (room.players.length >= room.settings.maxPlayers) continue;
    if (!best || room.players.length > best.players.length) best = room;
  }
  return best;
}

function attachPlayer(socket, room, name, ready = null) {
  const player = {
    id: socket.id,
    name,
    ready: ready ?? socket.id === room.hostId,
    role: null,
    score: 0,
    x: WORLD.width / 2,
    y: 50,
    input: { up: false, down: false, left: false, right: false },
    lastActionAt: 0,
    abilityReadyAt: 0,
    dashUntil: 0,
    dashX: 0,
    dashY: 0,
  };
  room.players.push(player);
  socket.data.roomCode = room.code;
  socket.join(room.code);
  return player;
}

function removePlayer(socket) {
  const room = roomFor(socket);
  if (!room) return;
  room.players = room.players.filter((player) => player.id !== socket.id);
  socket.leave(room.code);
  delete socket.data.roomCode;
  if (!room.players.length) {
    clearTimeout(room.cleanupTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === socket.id) {
    room.hostId = room.players[0].id;
    room.players[0].ready = true;
  }
  if (room.phase === "match") {
    const hasConstructors = room.players.some((player) => player.role === "Constructor");
    const hasGlitchers = room.players.some((player) => player.role === "Glitcher");
    if (!hasGlitchers) finishMatch(room, "Constructors");
    else if (!hasConstructors) finishMatch(room, "Glitchers");
    else publishRoom(room);
  } else publishRoom(room);
}

function setUpMatch(room) {
  room.phase = "match";
  room.startedAt = Date.now();
  room.lastChaosAt = room.startedAt;
  room.autoStartAt = null;
  room.modifier = null;
  room.modifierUntil = 0;
  room.coreShieldUntil = 0;
  room.coreHealth = 100;
  room.walls = [];
  const ordered = [...room.players].sort((a, b) => a.id.localeCompare(b.id));
  const constructorCount = Math.ceil(ordered.length / 2);
  ordered.forEach((player, index) => {
    player.role = index < constructorCount ? "Constructor" : "Glitcher";
    player.score = 0;
    player.input = { up: false, down: false, left: false, right: false };
    const teamIndex = index % constructorCount;
    player.x = WORLD.width / 2 + (teamIndex - (constructorCount - 1) / 2) * 60;
    player.y = player.role === "Constructor" ? 54 : WORLD.height - 54;
    player.lastActionAt = 0;
    player.abilityReadyAt = 0;
    player.dashUntil = 0;
    player.dashX = 0;
    player.dashY = 0;
  });
  publishRoom(room);
}

function finishMatch(room, winner) {
  if (room.phase !== "match") return;
  room.phase = "result";
  room.winner = winner;
  room.autoStartAt = null;
  io.to(room.code).emit("game:over", {
    winner,
    coreHealth: room.coreHealth,
    results: room.players.map(({ name, role, score }) => ({ name, role, score })),
  });
  publishRoom(room);
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    if (room.phase === "result") resetToLobby(room);
  }, RESULT_LINGER);
  room.cleanupTimer.unref?.();
}

function resetToLobby(room) {
  clearTimeout(room.cleanupTimer);
  room.phase = "lobby";
  room.winner = null;
  room.autoStartAt = null;
  room.autoStartSecond = -1;
  room.walls = [];
  room.coreHealth = 100;
  room.players.forEach((player) => {
    player.role = null;
    player.ready = room.isPublic ? true : player.id === room.hostId;
    player.score = 0;
  });
  publishRoom(room);
}

function currentState(room) {
  const now = Date.now();
  return {
    walls: room.walls,
    coreHealth: room.coreHealth,
    timeRemaining: Math.max(0, Math.ceil((room.settings.duration * 1000 - (now - room.startedAt)) / 1000)),
    modifier: room.modifier,
    modifierRemaining: Math.max(0, Math.ceil((room.modifierUntil - now) / 1000)),
    coreShieldRemaining: Math.max(0, Math.ceil((room.coreShieldUntil - now) / 1000)),
    eventInterval: CHAOS_INTERVALS[room.settings.chaos] ?? null,
    players: room.players.map(({ id, name, role, x, y, score, abilityReadyAt, dashUntil }) => ({
      id,
      name,
      role,
      x,
      y,
      score,
      abilityRemaining: Math.max(0, Math.ceil((abilityReadyAt - now) / 1000)),
      dashRemaining: Math.max(0, dashUntil - now),
    })),
  };
}

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

function doAction(room, player) {
  const now = Date.now();
  if (now - player.lastActionAt < ACTION_COOLDOWN) return null;
  player.lastActionAt = now;
  if (player.role === "Constructor") {
    if (room.walls.length >= MAX_WALLS) return null;
    const cell = nearestGridCell(player.x, player.y);
    if (Math.hypot(cell.x - CORE.x, cell.y - CORE.y) < CORE.radius + 30) return null;
    if (Math.hypot(cell.x - CORE.x, cell.y - CORE.y) > 300) return null;
    if (room.walls.some((wall) => wall.column === cell.column && wall.row === cell.row)) return null;
    room.walls.push({ column: cell.column, row: cell.row, x: cell.x, y: cell.y });
    player.score += 1;
    return "build";
  }
  if (player.role === "Glitcher") {
    if (Math.hypot(player.x - CORE.x, player.y - CORE.y) <= CORE.radius + 38) {
      if (room.coreShieldUntil > now) return null;
      room.coreHealth = Math.max(0, room.coreHealth - 8);
      player.score += 8;
      return "hack";
    }
    const wallIndex = room.walls.findIndex((wall) => Math.hypot(player.x - wall.x, player.y - wall.y) <= 76);
    if (wallIndex >= 0) {
      room.walls.splice(wallIndex, 1);
      player.score += 3;
      return "break";
    }
  }
  return null;
}

function launchChaos(room, now) {
  if (room.settings.chaos === "off") return;
  const interval = CHAOS_INTERVALS[room.settings.chaos];
  if (!interval || now - room.lastChaosAt < interval) return;
  room.lastChaosAt = now;
  const events = ["gravity", "darkness", "surge"];
  room.modifier = events[Math.floor(Math.random() * events.length)];
  room.modifierUntil = now + 12000;
  io.to(room.code).emit("game:event", { modifier: room.modifier, duration: 12 });
}

function stepMatch(room, deltaMs, now) {
  launchChaos(room, now);
  if (room.modifierUntil <= now) room.modifier = null;
  const speedMultiplier = room.modifier === "surge" ? 1.55 : 1;
  for (const player of room.players) {
    let horizontal = Number(player.input.right) - Number(player.input.left);
    let vertical = Number(player.input.down) - Number(player.input.up);
    if (player.dashUntil > now) {
      horizontal = player.dashX;
      vertical = player.dashY;
    }
    if (room.modifier === "gravity") {
      horizontal *= -1;
      vertical *= -1;
    }
    const magnitude = Math.hypot(horizontal, vertical) || 1;
    const dashMultiplier = player.dashUntil > now ? 3.25 : 1;
    const distance = 180 * speedMultiplier * dashMultiplier * Math.min(deltaMs, 200) / 1000;
    const nextX = Math.max(26, Math.min(WORLD.width - 26, player.x + (horizontal / magnitude) * distance));
    const nextY = Math.max(26, Math.min(WORLD.height - 26, player.y + (vertical / magnitude) * distance));
    const blocked = room.walls.some((wall) => Math.hypot(nextX - wall.x, nextY - wall.y) < 38);
    if (!blocked) {
      player.x = nextX;
      player.y = nextY;
    }
  }
  if (room.coreHealth <= 0) finishMatch(room, "Glitchers");
  else if (now - room.startedAt >= room.settings.duration * 1000) finishMatch(room, "Constructors");
  io.to(room.code).emit("game:state", currentState(room));
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload, ack) => {
    if (!isRecord(payload)) return ackError(ack, "Room details are required.");
    const { name, settings } = payload;
    const playerName = sanitizeName(name);
    const roomSettings = normalizeSettings(settings);
    if (!playerName) return ackError(ack, "Enter a nickname up to 16 characters.");
    if (!roomSettings) return ackError(ack, "Choose valid room settings.");
    removePlayer(socket);
    const room = createRoom(socket.id, roomSettings);
    attachPlayer(socket, room, playerName);
    if (typeof ack === "function") ack({ ok: true, room: publicRoom(room) });
    publishRoom(room);
  });

  socket.on("room:quickplay", (payload, ack) => {
    const playerName = sanitizeName(isRecord(payload) ? payload.name : null);
    if (!playerName) return ackError(ack, "Enter a nickname up to 16 characters.");
    removePlayer(socket);
    const room = bestPublicRoom() ?? createRoom(socket.id, { ...QUICK_PLAY_SETTINGS }, true);
    attachPlayer(socket, room, playerName, true);
    if (typeof ack === "function") ack({ ok: true, room: publicRoom(room) });
    publishRoom(room);
  });

  socket.on("rooms:list", (_payload, ack) => {
    if (typeof ack !== "function") return;
    const open = [...rooms.values()]
      .filter((room) => room.isPublic && room.phase === "lobby" && room.players.length < room.settings.maxPlayers)
      .sort((a, b) => b.players.length - a.players.length)
      .slice(0, 12)
      .map(lobbySummary);
    ack({ ok: true, rooms: open, online: io.engine.clientsCount });
  });

  socket.on("room:join", (payload, ack) => {
    if (!isRecord(payload)) return ackError(ack, "Enter your nickname and a room code.");
    const { name, code } = payload;
    const playerName = sanitizeName(name);
    const roomCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    const room = rooms.get(roomCode);
    if (!playerName) return ackError(ack, "Enter a nickname up to 16 characters.");
    if (!room) return ackError(ack, "That room code is not active.");
    if (room.phase !== "lobby") return ackError(ack, "That match has already started.");
    if (room.players.length >= room.settings.maxPlayers) return ackError(ack, "That room is full.");
    removePlayer(socket);
    attachPlayer(socket, room, playerName, room.isPublic ? true : null);
    if (typeof ack === "function") ack({ ok: true, room: publicRoom(room) });
    publishRoom(room);
  });

  socket.on("room:ready", (ready, ack) => {
    const room = roomFor(socket);
    const player = room?.players.find((entry) => entry.id === socket.id);
    if (!room || room.phase !== "lobby" || !player) return ackError(ack, "You are not in an open lobby.");
    player.ready = Boolean(ready);
    if (typeof ack === "function") ack({ ok: true });
    publishRoom(room);
  });

  socket.on("room:settings", (candidate, ack) => {
    const room = roomFor(socket);
    if (!room || room.phase !== "lobby") return ackError(ack, "Room settings are only available in the lobby.");
    if (room.hostId !== socket.id) return ackError(ack, "Only the room host can change settings.");
    const settings = normalizeSettings(candidate);
    if (!settings) return ackError(ack, "Those room settings are not supported.");
    if (room.players.length > settings.maxPlayers) return ackError(ack, "The player limit cannot be lower than the current lobby size.");
    room.settings = settings;
    if (typeof ack === "function") ack({ ok: true });
    publishRoom(room);
  });

  socket.on("game:start", (_payload, ack) => {
    const room = roomFor(socket);
    if (!room || room.phase !== "lobby") return ackError(ack, "There is no open lobby to start.");
    if (room.hostId !== socket.id) return ackError(ack, "Only the room host can start the match.");
    if (room.players.length < MIN_MATCH_PLAYERS) return ackError(ack, `At least ${MIN_MATCH_PLAYERS} players are required.`);
    if (room.players.length > room.settings.maxPlayers) return ackError(ack, "The lobby is over its selected player limit.");
    if (room.players.some((player) => !player.ready)) return ackError(ack, "Everyone must ready up before the match starts.");
    setUpMatch(room);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("room:return", (_payload, ack) => {
    const room = roomFor(socket);
    if (!room || room.phase !== "result" || room.hostId !== socket.id) {
      return ackError(ack, "Only the host can return this room to the lobby.");
    }
    resetToLobby(room);
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("game:input", (payload) => {
    const room = roomFor(socket);
    const player = room?.players.find((entry) => entry.id === socket.id);
    if (!room || room.phase !== "match" || !player || !isRecord(payload)) return;
    player.input = {
      up: payload.up === true,
      down: payload.down === true,
      left: payload.left === true,
      right: payload.right === true,
    };
  });

  socket.on("game:action", () => {
    const room = roomFor(socket);
    const player = room?.players.find((entry) => entry.id === socket.id);
    if (room?.phase === "match" && player) {
      const action = doAction(room, player);
      if (action) io.to(room.code).emit("game:action", { playerId: player.id, action });
    }
  });

  socket.on("game:ability", (_payload, ack) => {
    const room = roomFor(socket);
    const player = room?.players.find((entry) => entry.id === socket.id);
    if (!room || room.phase !== "match" || !player) return ackError(ack, "You are not in an active match.");
    const now = Date.now();
    if (player.abilityReadyAt > now) return ackError(ack, `Ability recharging: ${Math.ceil((player.abilityReadyAt - now) / 1000)}s.`);
    if (player.role === "Constructor") {
      room.coreShieldUntil = Math.max(room.coreShieldUntil, now) + CORE_SHIELD_DURATION;
      player.abilityReadyAt = now + ABILITY_COOLDOWNS.Constructor;
      io.to(room.code).emit("game:ability", { playerId: player.id, ability: "shield", duration: CORE_SHIELD_DURATION / 1000 });
    } else if (player.role === "Glitcher") {
      let horizontal = Number(player.input.right) - Number(player.input.left);
      let vertical = Number(player.input.down) - Number(player.input.up);
      if (horizontal === 0 && vertical === 0) {
        horizontal = CORE.x - player.x;
        vertical = CORE.y - player.y;
      }
      const magnitude = Math.hypot(horizontal, vertical) || 1;
      player.dashX = horizontal / magnitude;
      player.dashY = vertical / magnitude;
      player.dashUntil = now + DASH_DURATION;
      player.abilityReadyAt = now + ABILITY_COOLDOWNS.Glitcher;
      io.to(room.code).emit("game:ability", { playerId: player.id, ability: "dash", duration: DASH_DURATION / 1000 });
    } else {
      return ackError(ack, "Your role ability is not available.");
    }
    if (typeof ack === "function") ack({ ok: true });
  });

  socket.on("room:leave", (_payload, ack) => {
    removePlayer(socket);
    if (typeof ack === "function") ack({ ok: true });
  });
  socket.on("disconnect", () => removePlayer(socket));
});

function updatePublicRooms(now) {
  for (const room of rooms.values()) {
    if (!room.isPublic || room.phase !== "lobby") continue;
    if (room.players.length < AUTO_START_MIN_PLAYERS) {
      if (room.autoStartAt) {
        room.autoStartAt = null;
        room.autoStartSecond = -1;
        publishRoom(room);
      }
      continue;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      setUpMatch(room);
      continue;
    }
    if (!room.autoStartAt) room.autoStartAt = now + AUTO_START_DELAY;
    const secondsLeft = Math.max(0, Math.ceil((room.autoStartAt - now) / 1000));
    if (now >= room.autoStartAt) {
      setUpMatch(room);
    } else if (secondsLeft !== room.autoStartSecond) {
      room.autoStartSecond = secondsLeft;
      publishRoom(room);
    }
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === "match") stepMatch(room, 100, now);
  }
  updatePublicRooms(now);
}, 100).unref();

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`MT GridLock: Apex server listening on ${PORT}`);
});
