import Phaser from "phaser";

const W = 960;
const H = 600;
const CELL = 72;
const LEFT = 48;
const TOP = 12;
const CORE = { x: W / 2, y: H / 2 };
const MAX_PARTICLES = 460;

const COLORS = {
  constructor: 0x54dfbe,
  glitcher: 0xff627e,
  amber: 0xf4b942,
  core: 0x4cf4d3,
  danger: 0xff4d6d,
  shield: 0x5dcfff,
  white: 0xffffff,
};

function coreColor(health) {
  if (health > 60) return COLORS.core;
  if (health > 30) return COLORS.amber;
  return COLORS.danger;
}

class ArenaScene extends Phaser.Scene {
  constructor() {
    super("arena");
    this.snapshot = null;
    this.displayPositions = new Map();
    this.labels = new Map();
    this.particles = [];
    this.graphics = null;
    this.coreHit = 0;
    this.banner = null;
  }

  create() {
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#0b111b");
    this.banner = this.add
      .text(W / 2, CORE.y - 108, "", {
        fontFamily: '"Barlow Condensed", Impact, sans-serif',
        fontSize: "30px",
        fontStyle: "900",
        color: "#f0f4f8",
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0);
    this.scale.on("resize", () => this.draw());
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
  }

  burst(x, y, color, count = 12, power = 200, spread = 700) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: spread * (0.55 + Math.random() * 0.65),
        maxLife: spread,
        size: 2 + Math.random() * 3.4,
        color,
      });
    }
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  positionOf(id) {
    return this.displayPositions.get(id) ?? this.snapshot?.players.find((player) => player.id === id);
  }

  burstAtPlayer(id, color, count = 14, power = 210) {
    const position = this.positionOf(id);
    if (position) this.burst(position.x, position.y, color, count, power);
  }

  burstAtCore(color, count = 22) {
    this.burst(CORE.x, CORE.y, color, count, 310, 900);
    this.coreHit = 360;
  }

  announce(text, color = "#f0f4f8") {
    if (!this.banner) return;
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.86);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: "Back.out" });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1400, duration: 520 });
  }

  shake(intensity = 0.007, duration = 170) {
    this.cameras.main.shake(duration, intensity);
  }

  flash(tint, duration = 160) {
    const red = (tint >> 16) & 0xff;
    const green = (tint >> 8) & 0xff;
    const blue = tint & 0xff;
    this.cameras.main.flash(duration, red, green, blue, false);
  }

  labelFor(player) {
    const label = this.add
      .text(0, 0, player.name.slice(0, 7).toUpperCase(), {
        fontFamily: '"Barlow Condensed", Impact, sans-serif',
        fontSize: "13px",
        fontStyle: "700",
        color: player.role === "Glitcher" ? "#ffb3c0" : "#b6f6e6",
      })
      .setOrigin(0.5, 0)
      .setDepth(2);
    this.labels.set(player.id, label);
    return label;
  }

  update(_time, delta) {
    if (!this.snapshot || !this.graphics) return;
    const step = Math.min(delta, 50) / 1000;

    for (const player of this.snapshot.players) {
      const current = this.displayPositions.get(player.id) ?? { x: player.x, y: player.y };
      const blend = 1 - Math.exp(-delta / 80);
      current.x += (player.x - current.x) * blend;
      current.y += (player.y - current.y) * blend;
      this.displayPositions.set(player.id, current);
      if (player.dashRemaining > 0 && Math.random() < 0.5) {
        this.burst(current.x, current.y, player.role === "Glitcher" ? COLORS.glitcher : COLORS.constructor, 1, 60, 380);
      }
    }

    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      particle.life -= delta;
      if (particle.life <= 0) this.particles.splice(index, 1);
    }

    this.coreHit = Math.max(0, this.coreHit - delta);
    this.updateLabels();
    this.draw();
  }

  updateLabels() {
    const alive = new Set();
    for (const player of this.snapshot.players) {
      alive.add(player.id);
      const position = this.displayPositions.get(player.id) ?? player;
      const label = this.labels.get(player.id) ?? this.labelFor(player);
      label.setPosition(position.x, position.y + 20);
      const dimmed = this.snapshot.modifier === "darkness" && player.id !== this.snapshot.ownId;
      label.setAlpha(dimmed ? 0 : player.id === this.snapshot.ownId ? 1 : 0.72);
    }
    for (const [id, label] of this.labels) {
      if (!alive.has(id)) {
        label.destroy();
        this.labels.delete(id);
      }
    }
  }

  draw() {
    if (!this.snapshot || !this.graphics) return;
    const graphics = this.graphics;
    const now = performance.now();
    graphics.clear();

    graphics.fillStyle(0x0b111b, 1);
    graphics.fillRect(0, 0, W, H);

    graphics.lineStyle(1, 0x253246, 0.7);
    for (let column = 0; column <= 12; column += 1) {
      const x = LEFT + column * CELL;
      graphics.lineBetween(x, TOP, x, TOP + CELL * 8);
    }
    for (let row = 0; row <= 8; row += 1) {
      const y = TOP + row * CELL;
      graphics.lineBetween(LEFT, y, LEFT + CELL * 12, y);
    }

    const defence = Math.max(0, Math.min(1, this.snapshot.coreHealth / 100));
    const tint = coreColor(this.snapshot.coreHealth);
    const pulse = 0.72 + Math.sin(now / 280) * 0.14;
    const hitBoost = this.coreHit / 360;

    graphics.fillStyle(tint, 0.07 + hitBoost * 0.16);
    graphics.fillCircle(CORE.x, CORE.y, 76 + hitBoost * 22);
    graphics.lineStyle(3, tint, Math.min(1, pulse + hitBoost * 0.3));
    graphics.strokeCircle(CORE.x, CORE.y, 42);
    graphics.fillStyle(tint, 0.95);
    graphics.fillCircle(CORE.x, CORE.y, 17);
    graphics.fillStyle(0xdffffa, 1);
    graphics.fillCircle(CORE.x, CORE.y, 7);

    if (defence < 1) {
      graphics.lineStyle(6, tint, 0.5);
      graphics.beginPath();
      graphics.arc(CORE.x, CORE.y, 52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * defence);
      graphics.strokePath();
    }

    if (this.snapshot.coreShieldRemaining > 0) {
      const shieldPulse = 0.48 + Math.sin(now / 100) * 0.2;
      graphics.fillStyle(COLORS.shield, 0.08);
      graphics.fillCircle(CORE.x, CORE.y, 78);
      graphics.lineStyle(4, COLORS.shield, shieldPulse);
      graphics.strokeCircle(CORE.x, CORE.y, 72);
      graphics.lineStyle(1, 0xc4f3ff, 0.7);
      graphics.strokeCircle(CORE.x, CORE.y, 79);
    }

    for (const wall of this.snapshot.walls) {
      const x = wall.x ?? LEFT + wall.column * CELL + CELL / 2;
      const y = wall.y ?? TOP + wall.row * CELL + CELL / 2;
      graphics.fillStyle(COLORS.amber, 0.18);
      graphics.fillRoundedRect(x - 25, y - 25, 50, 50, 10);
      graphics.lineStyle(2, COLORS.amber, 0.9);
      graphics.strokeRoundedRect(x - 25, y - 25, 50, 50, 10);
      graphics.lineStyle(2, 0xffd67e, 0.55);
      graphics.lineBetween(x - 13, y, x + 13, y);
    }

    for (const player of this.snapshot.players) {
      const position = this.displayPositions.get(player.id) ?? player;
      const own = player.id === this.snapshot.ownId;
      const color = player.role === "Constructor" ? COLORS.constructor : COLORS.glitcher;
      if (player.dashRemaining > 0) {
        graphics.fillStyle(color, Math.min(0.42, player.dashRemaining / 1200));
        graphics.fillCircle(position.x, position.y, 26 + player.dashRemaining / 40);
        graphics.lineStyle(2, color, Math.min(0.8, player.dashRemaining / 600));
        graphics.strokeCircle(position.x, position.y, 30 + player.dashRemaining / 40);
      }
      if (own) {
        graphics.lineStyle(2, COLORS.white, 0.32 + Math.sin(now / 220) * 0.16);
        graphics.strokeCircle(position.x, position.y, 24);
      }
      graphics.fillStyle(color, 0.16);
      graphics.fillCircle(position.x, position.y, own ? 28 : 24);
      graphics.fillStyle(color, 1);
      graphics.fillCircle(position.x, position.y, own ? 17 : 14);
      graphics.lineStyle(2, COLORS.white, own ? 0.95 : 0.55);
      graphics.strokeCircle(position.x, position.y, own ? 20 : 16);
      graphics.fillStyle(0x101722, 1);
      graphics.fillCircle(position.x, position.y, 4);
    }

    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      graphics.fillStyle(particle.color, alpha);
      graphics.fillCircle(particle.x, particle.y, particle.size * (0.4 + alpha * 0.8));
    }

    if (this.snapshot.modifier === "gravity") {
      graphics.lineStyle(3, COLORS.glitcher, 0.34);
      graphics.strokeRect(2, 2, W - 4, H - 4);
    }

    if (this.snapshot.modifier === "darkness") {
      graphics.fillStyle(0x03060a, 0.78);
      graphics.fillRect(0, 0, W, H);
      const ownPlayer = this.snapshot.players.find((player) => player.id === this.snapshot.ownId);
      if (ownPlayer) {
        const position = this.displayPositions.get(ownPlayer.id) ?? ownPlayer;
        graphics.fillStyle(COLORS.white, 0.06);
        graphics.fillCircle(position.x, position.y, 120);
        graphics.lineStyle(26, COLORS.white, 0.06);
        graphics.strokeCircle(position.x, position.y, 78);
      }
    }
  }
}

export function createArena(container) {
  const scene = new ArenaScene();
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    width: W,
    height: H,
    backgroundColor: "#0b111b",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene: [scene],
  });

  game.canvas.setAttribute("aria-label", "MT GridLock: Apex live arena");
  return {
    setSnapshot(snapshot) {
      scene.setSnapshot(snapshot);
    },
    burstAtPlayer(id, colorName = "constructor", count, power) {
      scene.burstAtPlayer(id, COLORS[colorName] ?? COLORS.white, count, power);
    },
    burstAtCore(colorName = "core", count) {
      scene.burstAtCore(COLORS[colorName] ?? COLORS.core, count);
    },
    announce(text, colorName = "white") {
      const hex = `#${(COLORS[colorName] ?? COLORS.white).toString(16).padStart(6, "0")}`;
      scene.announce(text, hex);
    },
    shake(intensity, duration) {
      scene.shake(intensity, duration);
    },
    flash(colorName = "danger", duration) {
      scene.flash(COLORS[colorName] ?? COLORS.danger, duration);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
