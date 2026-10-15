const NOTES = [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61];

export class GameAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.musicTimer = null;
    this.noteIndex = 0;
    this.enabled = true;
    this.volume = 0.35;
    this.started = false;
    try {
      const savedVolume = localStorage.getItem("mtga-volume");
      if (savedVolume !== null && Number.isFinite(Number(savedVolume))) {
        this.volume = Math.max(0, Math.min(1, Number(savedVolume)));
      }
      this.enabled = localStorage.getItem("mtga-sound") !== "off";
    } catch {
      this.volume = 0.35;
    }
  }

  async start() {
    if (!this.enabled) return;
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) throw new Error("Web Audio is unavailable.");
    if (!this.context) {
      this.context = new AudioContextType();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume * 0.18;
      this.master.connect(this.context.destination);
      this.startAmbientLayer(55, 0.08, "sine");
      this.startAmbientLayer(82.41, 0.025, "triangle");
    }
    await this.context.resume();
    if (this.started) return;
    this.started = true;
    this.playMusicNote();
    this.musicTimer = setInterval(() => this.playMusicNote(), 760);
  }

  startAmbientLayer(frequency, gain, type) {
    const oscillator = this.context.createOscillator();
    const layerGain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    layerGain.gain.value = gain;
    oscillator.connect(layerGain);
    layerGain.connect(this.master);
    oscillator.start();
  }

  playMusicNote() {
    if (!this.enabled || !this.context || !this.master) return;
    const frequency = NOTES[this.noteIndex % NOTES.length];
    this.noteIndex += 1;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0.0001, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.07, this.context.currentTime + 0.08);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.65);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.7);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    try {
      localStorage.setItem("mtga-sound", enabled ? "on" : "off");
    } catch {
      this.enabled = enabled;
    }
    if (enabled) {
      if (this.context && this.master) {
        this.master.gain.setTargetAtTime(this.volume * 0.18, this.context.currentTime, 0.08);
      }
      return this.start();
    }
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    }
    return Promise.resolve();
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, Number(volume)));
    try {
      localStorage.setItem("mtga-volume", String(this.volume));
    } catch {
      this.volume = Math.max(0, Math.min(1, Number(volume)));
    }
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.enabled ? this.volume * 0.18 : 0, this.context.currentTime, 0.08);
    }
  }

  play(effect = "action") {
    if (!this.enabled || !this.context || !this.master) return;
    const presets = {
      action: [540, 0.07, "square"],
      build: [380, 0.13, "triangle"],
      hack: [170, 0.2, "sawtooth"],
      shield: [700, 0.36, "sine"],
      dash: [880, 0.17, "triangle"],
      break: [240, 0.12, "square"],
      chaos: [260, 0.5, "sawtooth"],
      victory: [660, 0.8, "sine"],
    };
    const [frequency, duration, type] = presets[effect] || presets.action;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, this.context.currentTime + duration);
    envelope.gain.setValueAtTime(0.0001, this.context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.14, this.context.currentTime + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start();
    oscillator.stop(this.context.currentTime + duration + 0.02);
  }

  renderControls() {
    const soundText = this.enabled ? "SOUND ON" : "SOUND OFF";
    return `<div class="sound-control"><button type="button" class="sound-toggle" aria-label="Sound settings" aria-expanded="false">${this.enabled ? "♫" : "♪"} <span>${soundText}</span></button><div class="sound-popover"><button type="button" class="sound-mute">${this.enabled ? "MUTE SOUND" : "UNMUTE SOUND"}</button><label for="sound-volume">VOLUME <input id="sound-volume" type="range" min="0" max="1" step="0.05" value="${this.volume}" aria-label="Sound volume" /></label></div></div>`;
  }
}

export const gameAudio = new GameAudio();
