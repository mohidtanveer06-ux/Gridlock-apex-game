import { io } from "socket.io-client";
import { gameAudio } from "./audio.js";
import "./style.css";

const app = document.querySelector("#app");
const multiplayerServerUrl = import.meta.env.VITE_SERVER_URL?.trim();
const vercelFrontend = location.hostname.endsWith(".vercel.app");
const connection = io(multiplayerServerUrl || undefined, { autoConnect: false, reconnection: true });
const pendingRoom = new URLSearchParams(location.search).get("room");
let myName = "";
let currentRoom = null;
let arena = null;
let startAttempted = false;
const input = { up: false, down: false, left: false, right: false };
const directionKeys = {
  w: "up",
  ArrowUp: "up",
  s: "down",
  ArrowDown: "down",
  a: "left",
  ArrowLeft: "left",
  d: "right",
  ArrowRight: "right",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function request(event, payload) {
  return new Promise((resolve, reject) => {
    connection.timeout(5000).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error("The server did not respond. Check your connection and try again."));
      } else if (!response?.ok) {
        reject(new Error(response?.error || "That action could not be completed."));
      } else {
        resolve(response);
      }
    });
  });
}

function showToast(message, type = "error") {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

function renderIntro() {
  app.innerHTML = `
    <main class="intro-screen">
      <div class="intro-grid" aria-hidden="true"></div>
      <div class="intro-glow intro-glow-one" aria-hidden="true"></div>
      <div class="intro-glow intro-glow-two" aria-hidden="true"></div>
      <div class="intro-brand">
        <div class="brand-mark"><span>MT</span><i></i></div>
        <div class="brand-kicker">A GRID-BASED TEAM ARENA</div>
        <h1><span>GRIDLOCK</span><b>APEX</b></h1>
        <p class="brand-studio">MT GRIDLOCK: APEX</p>
        <p class="intro-tagline">BUILD THE GRID. BREAK THE CORE.</p>
        <button class="button button-primary intro-enter" id="enter-arena"><span>ENTER THE ARENA</span><b>↗</b></button>
        <div class="intro-foot"><span>ONLINE MULTIPLAYER</span><span>DESKTOP + MOBILE</span><span>NO DOWNLOAD NEEDED</span></div>
      </div>
      <div class="intro-version">APEX / 001</div>
    </main>
    <div id="toast" role="status" aria-live="polite"></div>
  `;
  document.querySelector("#enter-arena").addEventListener("click", async () => {
    try {
      await gameAudio.start();
    } catch {
      showToast("Background sound is unavailable in this browser.");
    }
    renderHome();
  });
}

function renderHome() {
  if (arena) {
    arena.destroy();
    arena = null;
  }
  app.innerHTML = `
    <main class="site-shell">
      <header class="topbar">
        <a class="wordmark" href="#" aria-label="MT GridLock Apex home"><span class="wordmark-icon">MT</span><span>GRIDLOCK<b>APEX</b></span></a>
        <div class="topbar-right"><span class="live-indicator"><i></i> LIVE ARENA</span>${gameAudio.renderControls()}<span class="version-tag">SEASON 01</span></div>
      </header>
      <section class="home-layout">
        <div class="home-copy">
          <div class="eyebrow"><span></span> TWO SIDES. ONE CORE.</div>
          <h1>BUILD TO<br /><em>DEFEND.</em><br />MOVE TO<br /><strong>DESTROY.</strong></h1>
          <p>Fortify the core as a Constructor. Slip through the grid as a Glitcher. Your crew decides what happens next.</p>
          <div class="feature-chips"><span>4—8 PLAYERS</span><span>2 MIN MATCHES</span><span>FREE TO PLAY</span></div>
          <div class="roles-preview">
            <div><i class="role-dot constructor-dot"></i><span><b>CONSTRUCTORS</b><small>BUILD · HOLD · OUTLAST</small></span></div>
            <div><i class="role-dot glitcher-dot"></i><span><b>GLITCHERS</b><small>INFILTRATE · HACK · CORRUPT</small></span></div>
          </div>
        </div>
        <section class="play-card panel">
          <div class="card-index">01 / CREATE OR JOIN</div>
          <h2>Find your grid.</h2>
          <p class="card-subtitle">Jump in as a guest. No account, no download.</p>
          <label class="field-label" for="nickname">YOUR CALLSIGN</label>
          <input id="nickname" class="text-input" maxlength="16" autocomplete="nickname" placeholder="e.g. NeonFox" value="Pilot${Math.floor(100 + Math.random() * 900)}" />
          <div class="divider"><span>CREATE A ROOM</span></div>
          <div class="settings-row">
            <label>PLAYERS
              <select id="max-players" class="select-input">
                <option value="4">4 players</option><option value="6">6 players</option><option value="8">8 players</option>
              </select>
            </label>
            <label>ROUND
              <select id="duration" class="select-input">
                <option value="90">90 sec</option><option value="120" selected>2 min</option><option value="150">2.5 min</option><option value="180">3 min</option>
              </select>
            </label>
          </div>
          <label class="field-label chaos-label" for="chaos">CHAOS EVENTS
            <select id="chaos" class="select-input">
              <option value="off">Off</option><option value="chill">Chill · every 90 sec</option><option value="standard" selected>Standard · every 60 sec</option><option value="wild">Wild · every 45 sec</option>
            </select>
          </label>
          <button class="button button-primary button-wide" id="create-room"><span>CREATE PRIVATE ROOM</span><b>↗</b></button>
          <div class="divider join-divider"><span>OR JOIN YOUR CREW</span></div>
          <div class="join-row">
            <input id="room-code" class="text-input code-input" maxlength="5" autocapitalize="characters" placeholder="ROOM CODE" />
            <button class="button button-outline" id="join-room">JOIN</button>
          </div>
          <div class="play-card-foot"><span>PRIVATE ROOMS</span><span>SHARE A LINK</span><span>GUEST READY</span></div>
        </section>
      </section>
      <footer class="home-footer"><span>MT GRIDLOCK: APEX</span><span>POWERED BY YOUR SQUAD</span><span>V 1.0.0</span></footer>
    </main>
    <div id="toast" role="status" aria-live="polite"></div>
  `;
  document.querySelector(".wordmark").addEventListener("click", (event) => {
    event.preventDefault();
    renderIntro();
  });
  bindSoundControls();
  document.querySelector("#create-room").addEventListener("click", createRoom);
  document.querySelector("#join-room").addEventListener("click", joinRoom);
  const codeInput = document.querySelector("#room-code");
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });
  document.querySelector("#nickname").addEventListener("keydown", onSubmitKey);
  codeInput.addEventListener("keydown", onSubmitKey);
  if (pendingRoom) {
    codeInput.value = pendingRoom.toUpperCase();
    if (myName) joinRoom();
  }
}

function onSubmitKey(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.currentTarget.id === "room-code" && event.currentTarget.value) joinRoom();
    else createRoom();
  }
}

function getName() {
  const field = document.querySelector("#nickname");
  const name = field?.value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 16);
  if (!name) {
    field?.focus();
    showToast("Add a callsign before entering the arena.");
    return null;
  }
  myName = name;
  return name;
}

async function connect() {
  if (vercelFrontend && !multiplayerServerUrl) {
    throw new Error("Multiplayer server is not connected to this Vercel site yet. Set VITE_SERVER_URL to the Node game server URL in Vercel and redeploy.");
  }
  if (connection.connected) return;
  await new Promise((resolve, reject) => {
    const timeoutMs = multiplayerServerUrl?.includes(".onrender.com") ? 90000 : 12000;
    const timeout = setTimeout(() => {
      connection.off("connect", onConnect);
      connection.off("connect_error", onError);
      connection.disconnect();
      reject(new Error("Could not reach the multiplayer server. Check its health page and try again."));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timeout);
      connection.off("connect_error", onError);
      resolve();
    };
    const onError = (error) => {
      clearTimeout(timeout);
      connection.off("connect", onConnect);
      reject(new Error(`Connection failed: ${error.message}`));
    };
    connection.once("connect", onConnect);
    connection.once("connect_error", onError);
    connection.connect();
  });
}

async function createRoom() {
  const name = getName();
  if (!name) return;
  const button = document.querySelector("#create-room");
  button.disabled = true;
  button.querySelector("span").textContent = "CONNECTING...";
  try {
    await connect();
    const settings = {
      maxPlayers: Number(document.querySelector("#max-players").value),
      duration: Number(document.querySelector("#duration").value),
      chaos: document.querySelector("#chaos").value,
    };
    const response = await request("room:create", { name, settings });
    currentRoom = response.room;
    renderLobby();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.querySelector("span").textContent = "CREATE PRIVATE ROOM";
    }
  }
}

async function joinRoom() {
  const name = getName();
  if (!name) return;
  const code = document.querySelector("#room-code")?.value.trim().toUpperCase() || pendingRoom?.toUpperCase();
  if (!code) {
    showToast("Enter the five-character room code.");
    return;
  }
  const button = document.querySelector("#join-room");
  if (button) {
    button.disabled = true;
    button.textContent = "WAIT";
  }
  try {
    await connect();
    const response = await request("room:join", { name, code });
    currentRoom = response.room;
    renderLobby();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = "JOIN";
    }
  }
}

function renderLobby() {
  const isHost = currentRoom.hostId === connection.id;
  const allReady = currentRoom.players.every((player) => player.ready);
  const canStart = currentRoom.players.length >= 4 && allReady && currentRoom.players.length % 2 === 0;
  const players = Array.from({ length: currentRoom.settings.maxPlayers }, (_, index) => {
    const player = currentRoom.players[index];
    if (!player) return `<div class="player-slot empty"><span class="slot-number">0${index + 1}</span><span class="empty-name">AWAITING PLAYER</span><i></i></div>`;
    const you = player.id === connection.id;
    return `<div class="player-slot ${player.ready ? "is-ready" : ""}"><span class="slot-number">0${index + 1}</span><span class="player-avatar">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</span><span class="player-name">${escapeHtml(player.name)}${you ? ' <small>(YOU)</small>' : ""}${player.id === currentRoom.hostId ? ' <b class="host-tag">HOST</b>' : ""}</span><span class="player-status">${player.ready ? "READY" : "NOT READY"}</span></div>`;
  }).join("");
  const chaosNames = { off: "OFF", chill: "CHILL · 90S", standard: "STANDARD · 60S", wild: "WILD · 45S" };
  app.innerHTML = `
    <main class="site-shell lobby-shell">
      <header class="topbar">
        <a class="wordmark" href="#"><span class="wordmark-icon">MT</span><span>GRIDLOCK<b>APEX</b></span></a>
        <div class="topbar-right"><span class="lobby-label">PRIVATE LOBBY</span>${gameAudio.renderControls()}<button class="text-button" id="leave-room">LEAVE ROOM ↗</button></div>
      </header>
      <section class="lobby-layout">
        <div class="lobby-main">
          <div class="eyebrow"><span></span> SQUAD UP</div>
          <h1>YOUR GRID.<br /><em>YOUR RULES.</em></h1>
          <p class="lobby-description">Share the code. Get your crew in. The arena is almost live.</p>
          <div class="room-share panel">
            <div><small>ROOM CODE</small><strong>${escapeHtml(currentRoom.code)}</strong></div>
            <button class="button button-outline" id="copy-room">COPY INVITE LINK</button>
          </div>
          <div class="section-heading"><h2>THE CREW <span>${currentRoom.players.length} / ${currentRoom.settings.maxPlayers}</span></h2><div class="team-key"><i class="constructor-dot"></i> CONSTRUCTOR <i class="glitcher-dot"></i> GLITCHER</div></div>
          <div class="player-list">${players}</div>
          <div class="lobby-actions">
            <button class="button button-outline" id="ready-button">${currentRoom.players.find((player) => player.id === connection.id)?.ready ? "NOT READY" : "READY UP"}</button>
            ${isHost ? `<button class="button button-primary" id="start-game" ${canStart ? "" : "disabled"}><span>START MATCH</span><b>↗</b></button>` : '<div class="waiting-label"><i></i> WAITING FOR HOST</div>'}
          </div>
          <p class="lobby-hint">${currentRoom.players.length < 4 ? `Need ${4 - currentRoom.players.length} more player${currentRoom.players.length === 3 ? "" : "s"} to launch.` : currentRoom.players.length % 2 !== 0 ? "Add one more player to balance the teams." : allReady ? "All players ready. Let the grid begin." : "Everyone needs to ready up before launch."}</p>
        </div>
        <aside class="lobby-side">
          <section class="settings-card panel">
            <div class="card-index">ROOM CONFIGURATION</div><h2>Match settings</h2>
            <label class="field-label" for="lobby-capacity">PLAYER CAPACITY
              <select id="lobby-capacity" class="select-input" ${isHost ? "" : "disabled"}>
                ${[4, 6, 8].map((count) => `<option value="${count}" ${currentRoom.settings.maxPlayers === count ? "selected" : ""}>${count} players</option>`).join("")}
              </select>
            </label>
            <label class="field-label" for="lobby-duration">ROUND LENGTH
              <select id="lobby-duration" class="select-input" ${isHost ? "" : "disabled"}>
                ${[[90, "90 sec"], [120, "2 min"], [150, "2.5 min"], [180, "3 min"]].map(([seconds, label]) => `<option value="${seconds}" ${currentRoom.settings.duration === seconds ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            <label class="field-label" for="lobby-chaos">CHAOS EVENTS
              <select id="lobby-chaos" class="select-input" ${isHost ? "" : "disabled"}>
                ${Object.entries(chaosNames).map(([key, label]) => `<option value="${key}" ${currentRoom.settings.chaos === key ? "selected" : ""}>${label}</option>`).join("")}
              </select>
            </label>
            ${isHost ? '<p class="settings-note">Settings sync to every player in this room.</p>' : '<p class="settings-note">Only the host can edit this room’s settings.</p>'}
          </section>
          <section class="how-card panel"><div class="card-index">THE OBJECTIVE</div><div class="objective-row"><i class="role-dot constructor-dot"></i><span><b>CONSTRUCTORS</b><small>Protect the core until time runs out.</small></span></div><div class="objective-row"><i class="role-dot glitcher-dot"></i><span><b>GLITCHERS</b><small>Get close. Hack the core to zero.</small></span></div></section>
        </aside>
      </section>
      <footer class="home-footer"><span>MT GRIDLOCK: APEX</span><span>ROOM ${escapeHtml(currentRoom.code)}</span><span>V 1.0.0</span></footer>
    </main>
    <div id="toast" role="status" aria-live="polite"></div>
  `;
  document.querySelector(".wordmark").addEventListener("click", (event) => {
    event.preventDefault();
    leaveRoom();
  });
  bindSoundControls();
  document.querySelector("#leave-room").addEventListener("click", leaveRoom);
  document.querySelector("#copy-room").addEventListener("click", copyInvite);
  document.querySelector("#ready-button").addEventListener("click", toggleReady);
  document.querySelector("#start-game")?.addEventListener("click", startGame);
  for (const field of ["#lobby-capacity", "#lobby-duration", "#lobby-chaos"]) {
    document.querySelector(field)?.addEventListener("change", updateSettings);
  }
}

async function copyInvite() {
  const link = new URL(location.href);
  link.searchParams.set("room", currentRoom.code);
  try {
    await navigator.clipboard.writeText(link.toString());
    showToast("Invite link copied. Send it to your crew!", "success");
  } catch {
    showToast(`Share this room code: ${currentRoom.code}`, "success");
  }
}

function bindSoundControls() {
  const toggle = document.querySelector(".sound-toggle");
  const popover = document.querySelector(".sound-popover");
  const mute = document.querySelector(".sound-mute");
  const slider = document.querySelector("#sound-volume");
  if (!toggle || !popover || !mute || !slider) return;
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    popover.classList.toggle("sound-open", !expanded);
  });
  mute.addEventListener("click", async () => {
    try {
      await gameAudio.setEnabled(!gameAudio.enabled);
      toggle.innerHTML = `${gameAudio.enabled ? "♫" : "♪"} <span>${gameAudio.enabled ? "SOUND ON" : "SOUND OFF"}</span>`;
      mute.textContent = gameAudio.enabled ? "MUTE SOUND" : "UNMUTE SOUND";
    } catch {
      showToast("Background sound could not be started.");
    }
  });
  slider.addEventListener("input", () => gameAudio.setVolume(slider.value));
}

async function toggleReady() {
  const player = currentRoom.players.find((entry) => entry.id === connection.id);
  try {
    await request("room:ready", !player?.ready);
  } catch (error) {
    showToast(error.message);
  }
}

async function updateSettings() {
  const settings = {
    maxPlayers: Number(document.querySelector("#lobby-capacity").value),
    duration: Number(document.querySelector("#lobby-duration").value),
    chaos: document.querySelector("#lobby-chaos").value,
  };
  try {
    await request("room:settings", settings);
  } catch (error) {
    showToast(error.message);
    renderLobby();
  }
}

async function startGame() {
  const button = document.querySelector("#start-game");
  if (button) button.disabled = true;
  startAttempted = true;
  try {
    await request("game:start", {});
  } catch (error) {
    startAttempted = false;
    showToast(error.message);
    if (button?.isConnected) button.disabled = false;
  }
}

async function leaveRoom() {
  try {
    if (connection.connected) await request("room:leave", {});
  } catch (error) {
    showToast(error.message);
  }
  currentRoom = null;
  connection.disconnect();
  const url = new URL(location.href);
  url.searchParams.delete("room");
  history.replaceState({}, "", url);
  renderHome();
}

async function renderArena() {
  app.innerHTML = `
    <main class="game-shell">
      <header class="game-topbar">
        <a class="wordmark" href="#"><span class="wordmark-icon">MT</span><span>GRIDLOCK<b>APEX</b></span></a>
        <div class="game-top-center"><span class="match-live"><i></i> MATCH LIVE</span><span class="game-room-code">ROOM ${escapeHtml(currentRoom.code)}</span></div>
        <div class="game-tools">${gameAudio.renderControls()}<button class="text-button" id="fullscreen-button">FULL SCREEN</button><button class="text-button" id="game-leave">LEAVE MATCH</button></div>
      </header>
      <section class="match-layout">
        <div class="match-heading"><div><div class="eyebrow"><span></span> THE CORE IS LIVE</div><h1>HOLD YOUR <em>GROUND.</em></h1></div><div class="match-timer" id="match-timer">02:00</div></div>
        <div class="arena-frame panel">
          <div class="arena-head"><span class="team-label"><i class="role-dot constructor-dot"></i> CONSTRUCTORS</span><div class="core-status"><span>CORE INTEGRITY</span><strong id="core-value">100%</strong><small id="shield-status"></small></div><span class="team-label glitch-team"><i class="role-dot glitcher-dot"></i> GLITCHERS</span></div>
          <div class="arena-wrap">
            <div id="arena-canvas"></div>
            <div class="arena-overlay" id="arena-overlay" aria-live="polite"></div>
          </div>
          <div class="arena-foot"><span>MOVE <b>WASD</b> / <b>↑ ↓ ← →</b></span><span>ACTION <b>E</b></span><span id="modifier-label">NO ACTIVE MODIFIER</span></div>
        </div>
        <div class="match-controls">
          <div class="players-mini" id="players-mini"></div>
          <div class="control-right"><div class="control-hint"><i class="role-dot" id="my-role-dot"></i><span><b id="my-role">CONNECTING</b><small id="role-action">Move with WASD. Press E to use your role action.</small></span></div><button class="ability-button" id="ability-button"><span>Q · ABILITY</span><small id="ability-cooldown">READY</small></button></div>
        </div>
        <div class="touch-controls" aria-label="Touch movement controls">
          <button class="touch-key up" data-direction="up" aria-label="Move up">▲</button>
          <button class="touch-key left" data-direction="left" aria-label="Move left">◀</button>
          <button class="touch-key down" data-direction="down" aria-label="Move down">▼</button>
          <button class="touch-key right" data-direction="right" aria-label="Move right">▶</button>
          <button class="touch-action" id="touch-action">ACTION</button>
          <button class="touch-ability" id="touch-ability">Q · ABILITY</button>
        </div>
      </section>
      <div class="event-toast" id="event-toast"></div>
    </main>
    <div id="toast" role="status" aria-live="polite"></div>
  `;
  const { createArena } = await import("./game.js");
  const canvasHost = document.querySelector("#arena-canvas");
  if (!canvasHost || currentRoom?.phase !== "match") return;
  arena = createArena(canvasHost);
  bindSoundControls();
  document.querySelector("#game-leave").addEventListener("click", leaveRoom);
  document.querySelector("#ability-button").addEventListener("click", useAbility);
  document.querySelector("#touch-ability").addEventListener("click", useAbility);
  document.querySelector("#fullscreen-button").addEventListener("click", toggleFullscreen);
  document.querySelector(".game-shell .wordmark").addEventListener("click", (event) => {
    event.preventDefault();
    leaveRoom();
  });
  document.querySelector("#touch-action").addEventListener("click", doAction);
  document.querySelectorAll(".touch-key").forEach((button) => {
    const direction = button.dataset.direction;
    const press = (event) => {
      event.preventDefault();
      input[direction] = true;
      button.classList.add("pressed");
      navigator.vibrate?.(8);
      button.setPointerCapture?.(event.pointerId);
    };
    const release = (event) => {
      event.preventDefault();
      input[direction] = false;
      button.classList.remove("pressed");
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });
  requestAnimationFrame(() => {
    const canvas = document.querySelector("#arena-canvas canvas");
    if (canvas) canvas.style.touchAction = "none";
  });
}

function updateFullscreenButton() {
  const button = document.querySelector("#fullscreen-button");
  if (button) button.textContent = document.fullscreenElement ? "EXIT FULL SCREEN" : "FULL SCREEN";
}

function updateGameUI(state) {
  const own = state.players.find((player) => player.id === connection.id);
  const seconds = state.timeRemaining;
  const timer = document.querySelector("#match-timer");
  if (!timer) return;
  timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  timer.classList.toggle("timer-danger", seconds <= 20);
  document.querySelector("#core-value").textContent = `${state.coreHealth}%`;
  const coreStatus = document.querySelector(".core-status");
  coreStatus.style.setProperty("--health", `${state.coreHealth}%`);
  coreStatus.classList.toggle("core-shielded", state.coreShieldRemaining > 0);
  document.querySelector("#shield-status").textContent = state.coreShieldRemaining > 0
    ? `SHIELDED · ${state.coreShieldRemaining}S`
    : "";
  const modifierText = {
    gravity: `GRAVITY FLIP · ${state.modifierRemaining}S`,
    darkness: `TOTAL DARKNESS · ${state.modifierRemaining}S`,
    surge: `SPEED SURGE · ${state.modifierRemaining}S`,
  };
  document.querySelector("#modifier-label").textContent = modifierText[state.modifier] || "NO ACTIVE MODIFIER";
  const roleEl = document.querySelector("#my-role");
  const roleDot = document.querySelector("#my-role-dot");
  if (own && roleEl) {
    roleEl.textContent = own.role.toUpperCase();
    roleDot.className = `role-dot ${own.role === "Constructor" ? "constructor-dot" : "glitcher-dot"}`;
    document.querySelector("#role-action").textContent = own.role === "Constructor"
      ? "E builds a barrier · Q shields the core for 4 seconds."
      : "E hacks the core · Q phase-dashes toward the core.";
    document.querySelector(".control-hint").classList.toggle("glitcher-hint", own.role === "Glitcher");
    const abilityName = own.role === "Constructor" ? "CORE SHIELD" : "PHASE DASH";
    const cooldown = own.abilityRemaining || 0;
    const abilityButton = document.querySelector("#ability-button");
    const touchAbility = document.querySelector("#touch-ability");
    abilityButton.disabled = cooldown > 0;
    touchAbility.disabled = cooldown > 0;
    abilityButton.querySelector("span").textContent = `Q · ${abilityName}`;
    abilityButton.querySelector("small").textContent = cooldown > 0 ? `${cooldown}S` : "READY";
    touchAbility.textContent = cooldown > 0 ? `${abilityName} · ${cooldown}S` : `Q · ${abilityName}`;
    abilityButton.classList.toggle("ability-glitcher", own.role === "Glitcher");
    touchAbility.classList.toggle("ability-glitcher", own.role === "Glitcher");
  }
  document.querySelector("#players-mini").innerHTML = state.players.map((player) =>
    `<span class="mini-player ${player.role === "Glitcher" ? "mini-glitcher" : ""} ${player.id === connection.id ? "mini-own" : ""}" title="${escapeHtml(player.name)}">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</span>`,
  ).join("");
  if (arena) arena.setSnapshot({ ...state, ownId: connection.id });
  const shell = document.querySelector(".game-shell");
  shell.classList.toggle("modifier-gravity", state.modifier === "gravity");
  shell.classList.toggle("modifier-darkness", state.modifier === "darkness");
  shell.classList.toggle("modifier-surge", state.modifier === "surge");
}

function doAction() {
  if (connection.connected && currentRoom?.phase === "match") {
    connection.emit("game:action");
  }
}

async function useAbility() {
  if (!connection.connected || currentRoom?.phase !== "match") return;
  try {
    await request("game:ability", {});
  } catch (error) {
    if (!error.message.includes("recharging")) showToast(error.message);
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector(".game-shell").requestFullscreen();
  } catch {
    showToast("Full screen is not available in this browser.");
  }
}

function installInputHandlers() {
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    const direction = directionKeys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction) {
      input[direction] = true;
      event.preventDefault();
    }
    if (event.key.toLowerCase() === "e" && !event.repeat) doAction();
    if (event.key.toLowerCase() === "q" && !event.repeat) useAbility();
  });
  window.addEventListener("keyup", (event) => {
    const direction = directionKeys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (direction) input[direction] = false;
  });
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInput();
  });
  setInterval(() => {
    if (connection.connected && currentRoom?.phase === "match") connection.emit("game:input", input);
  }, 50);
}

function clearInput() {
  for (const direction of Object.keys(input)) input[direction] = false;
}

connection.on("room:update", (room) => {
  if (currentRoom?.code !== room.code) return;
  currentRoom = room;
  if (room.phase === "match") {
    startAttempted = false;
    if (!document.querySelector("#arena-canvas")) renderArena();
  } else if (room.phase === "lobby") {
    if (document.querySelector("#arena-canvas") || startAttempted) {
      startAttempted = false;
      renderLobby();
    } else if (document.querySelector(".lobby-shell")) {
      renderLobby();
    }
  }
});

connection.on("game:state", (state) => {
  updateGameUI(state);
});

connection.on("game:event", ({ modifier, duration }) => {
  const messages = {
    gravity: "GRAVITY FLIP — controls reversed!",
    darkness: "TOTAL DARKNESS — keep your bearings.",
    surge: "SPEED SURGE — move fast!",
  };
  gameAudio.play("chaos");
  const toast = document.querySelector("#event-toast");
  if (!toast) return;
  toast.textContent = messages[modifier] || "CHAOS EVENT";
  toast.classList.add("event-visible");
  clearTimeout(connection.eventTimer);
  connection.eventTimer = setTimeout(() => toast.classList.remove("event-visible"), duration * 1000);
});

connection.on("game:over", ({ winner, coreHealth, results }) => {
  clearInput();
  gameAudio.play("victory");
  const own = currentRoom?.players.find((player) => player.id === connection.id);
  const won = own?.role === winner.slice(0, -1) || (winner === "Constructors" && own?.role === "Constructor") || (winner === "Glitchers" && own?.role === "Glitcher");
  const details = results.map((result) => `<div class="result-row"><span class="result-role ${result.role === "Glitcher" ? "result-glitcher" : ""}">${escapeHtml(result.role)}</span><b>${escapeHtml(result.name)}</b><span>${result.score} PTS</span></div>`).join("");
  const overlay = document.querySelector("#arena-overlay");
  if (!overlay) return;
  overlay.innerHTML = `<section class="result-card panel"><div class="eyebrow"><span></span> MATCH COMPLETE</div><h2>${won ? "GRID SECURED." : "GRID CORRUPTED."}</h2><p class="result-summary"><b>${escapeHtml(winner)} win</b> · Core integrity ${coreHealth}%</p><div class="result-list">${details}</div>${currentRoom?.hostId === connection.id ? '<button class="button button-primary button-wide" id="return-lobby"><span>RETURN TO LOBBY</span><b>↗</b></button>' : '<p class="result-wait">Waiting for the host to reset the room…</p>'}</section>`;
  document.querySelector("#return-lobby")?.addEventListener("click", async () => {
    try {
      await request("room:return", {});
    } catch (error) {
      showToast(error.message);
    }
  });
});

connection.on("game:ability", ({ playerId, ability }) => {
  gameAudio.play(ability);
  if (playerId === connection.id) {
    showToast(ability === "shield" ? "Core shield online!" : "Phase dash engaged!", "success");
  }
});

connection.on("game:action", ({ action }) => {
  gameAudio.play(action);
});

connection.on("connect_error", () => {
  if (currentRoom) showToast("Connection lost. Reconnecting to your room…");
});

connection.on("connect", () => {
  if (!currentRoom || currentRoom.players.some((player) => player.id === connection.id)) return;
  if (currentRoom.phase !== "lobby") {
    currentRoom = null;
    renderHome();
    showToast("You disconnected from that match. Join a new room to play again.");
    return;
  }
  request("room:join", { name: myName, code: currentRoom.code })
    .then(({ room }) => {
      currentRoom = room;
      renderLobby();
      showToast("Reconnected to your room.", "success");
    })
    .catch((error) => {
      currentRoom = null;
      renderHome();
      showToast(error.message);
    });
});

renderIntro();
installInputHandlers();

document.addEventListener("click", (event) => {
  if (event.target?.id === "enter-arena" && pendingRoom) {
    setTimeout(() => {
      const nameField = document.querySelector("#nickname");
      if (nameField?.value.trim()) joinRoom();
    }, 0);
  }
});
