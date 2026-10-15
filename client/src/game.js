import Phaser from "phaser";

const W = 960;
const H = 600;
const CELL = 72;
const LEFT = 48;
const TOP = 12;

class ArenaScene extends Phaser.Scene {
  constructor() {
    super("arena");
    this.snapshot = null;
    this.displayPositions = new Map();
    this.graphics = null;
  }

  create() {
    this.graphics = this.add.graphics();
    this.cameras.main.setBackgroundColor("#0b111b");
    this.scale.on("resize", () => this.draw());
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
  }

  update(_time, delta) {
    if (!this.snapshot || !this.graphics) return;
    for (const player of this.snapshot.players) {
      const current = this.displayPositions.get(player.id) ?? { x: player.x, y: player.y };
      const blend = 1 - Math.exp(-delta / 80);
      current.x += (player.x - current.x) * blend;
      current.y += (player.y - current.y) * blend;
      this.displayPositions.set(player.id, current);
    }
    this.draw();
  }

  draw() {
    if (!this.snapshot || !this.graphics) return;
    const graphics = this.graphics;
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

    const pulse = 0.72 + Math.sin(performance.now() / 280) * 0.14;
    graphics.fillStyle(0x4cf4d3, 0.07);
    graphics.fillCircle(W / 2, H / 2, 72);
    graphics.lineStyle(3, 0x4cf4d3, pulse);
    graphics.strokeCircle(W / 2, H / 2, 42);
    graphics.fillStyle(0x76ffe3, 0.9);
    graphics.fillCircle(W / 2, H / 2, 17);
    graphics.fillStyle(0xdffffa, 1);
    graphics.fillCircle(W / 2, H / 2, 7);
    if (this.snapshot.coreShieldRemaining > 0) {
      const shieldPulse = 0.48 + Math.sin(performance.now() / 100) * 0.2;
      graphics.fillStyle(0x5dcfff, 0.08);
      graphics.fillCircle(W / 2, H / 2, 78);
      graphics.lineStyle(4, 0x5dcfff, shieldPulse);
      graphics.strokeCircle(W / 2, H / 2, 72);
      graphics.lineStyle(1, 0xc4f3ff, 0.7);
      graphics.strokeCircle(W / 2, H / 2, 79);
    }

    for (const wall of this.snapshot.walls) {
      const x = wall.x ?? LEFT + wall.column * CELL + CELL / 2;
      const y = wall.y ?? TOP + wall.row * CELL + CELL / 2;
      graphics.fillStyle(0xf4b942, 0.18);
      graphics.fillRoundedRect(x - 25, y - 25, 50, 50, 10);
      graphics.lineStyle(2, 0xf4b942, 0.9);
      graphics.strokeRoundedRect(x - 25, y - 25, 50, 50, 10);
      graphics.lineStyle(2, 0xffd67e, 0.55);
      graphics.lineBetween(x - 13, y, x + 13, y);
    }

    for (const player of this.snapshot.players) {
      const position = this.displayPositions.get(player.id) ?? player;
      const own = player.id === this.snapshot.ownId;
      const color = player.role === "Constructor" ? 0x54dfbe : 0xff627e;
      if (player.dashRemaining > 0) {
        graphics.fillStyle(color, Math.min(0.42, player.dashRemaining / 1200));
        graphics.fillCircle(position.x, position.y, 26 + (player.dashRemaining / 40));
        graphics.lineStyle(2, color, Math.min(0.8, player.dashRemaining / 600));
        graphics.strokeCircle(position.x, position.y, 30 + (player.dashRemaining / 40));
      }
      graphics.fillStyle(color, 0.16);
      graphics.fillCircle(position.x, position.y, own ? 28 : 24);
      graphics.fillStyle(color, 1);
      graphics.fillCircle(position.x, position.y, own ? 17 : 14);
      graphics.lineStyle(2, 0xffffff, own ? 0.95 : 0.55);
      graphics.strokeCircle(position.x, position.y, own ? 20 : 16);
      graphics.fillStyle(0x101722, 1);
      graphics.fillCircle(position.x, position.y, 4);
    }

    if (this.snapshot.modifier === "darkness") {
      graphics.fillStyle(0x03060a, 0.78);
      graphics.fillRect(0, 0, W, H);
      const ownPlayer = this.snapshot.players.find((player) => player.id === this.snapshot.ownId);
      if (ownPlayer) {
        const position = this.displayPositions.get(ownPlayer.id) ?? ownPlayer;
        graphics.fillStyle(0xffffff, 0.06);
        graphics.fillCircle(position.x, position.y, 120);
        graphics.lineStyle(26, 0xffffff, 0.06);
        graphics.strokeCircle(position.x, position.y, 78);
      }
    }
  }
}

export function createArena(container, onAction) {
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
  game.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  return {
    setSnapshot(snapshot) {
      scene.setSnapshot(snapshot);
    },
    destroy() {
      game.destroy(true);
    },
    onAction,
  };
}
