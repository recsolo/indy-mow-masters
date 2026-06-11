"use strict";

/* ============================================================
 * HighFrequency — real-time brainwave-entrainment audio engine
 *
 * Binaural mode : two sine oscillators panned hard left/right;
 *                 the frequency difference (the "beat") is what
 *                 the brain perceives. Requires headphones.
 * Isochronic    : a single centered tone whose volume is pulsed
 *                 at the beat rate. Works on speakers.
 * ============================================================ */

const STATES = {
  focus:    { name: "Focus",    band: "Beta",        beat: 18,  carrier: 220, color: [108, 140, 255] },
  calm:     { name: "Calm",     band: "Alpha",       beat: 10,  carrier: 200, color: [ 86, 207, 175] },
  flow:     { name: "Flow",     band: "Alpha–Theta", beat: 8,   carrier: 180, color: [155, 108, 255] },
  meditate: { name: "Meditate", band: "Theta",       beat: 6,   carrier: 160, color: [255, 156, 108] },
  sleep:    { name: "Sleep",    band: "Delta",       beat: 2.5, carrier: 120, color: [ 96, 130, 220] },
};

const RAMP = 2.5;       // seconds to glide between states
const FADE_IN = 1.5;    // seconds
const FADE_OUT = 1.2;   // seconds

class Engine {
  constructor() {
    this.ctx = null;
    this.mode = "binaural";
    this.playing = false;
    this.toneLevel = 0.55;
    this.noiseLevel = 0.25;
    this.current = null; // state key
  }

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // tone bus (scaled by the "Frequency level" slider)
    this.toneBus = ctx.createGain();
    this.toneBus.gain.value = this.toneLevel;
    this.toneBus.connect(this.master);

    // --- binaural pair ---
    this.panL = ctx.createStereoPanner();
    this.panR = ctx.createStereoPanner();
    this.panL.pan.value = -1;
    this.panR.pan.value = 1;
    this.binauralGain = ctx.createGain();
    this.panL.connect(this.binauralGain);
    this.panR.connect(this.binauralGain);
    this.binauralGain.connect(this.toneBus);

    this.oscL = ctx.createOscillator();
    this.oscR = ctx.createOscillator();
    this.oscL.connect(this.panL);
    this.oscR.connect(this.panR);
    this.oscL.start();
    this.oscR.start();

    // --- isochronic chain: osc -> pulsed gain -> bus ---
    // pulse gain = 0.5 (DC offset) + 0.5 * sin(beat)  ->  swings 0..1
    this.isoOsc = ctx.createOscillator();
    this.isoPulse = ctx.createGain();
    this.isoPulse.gain.value = 0;
    this.isoGain = ctx.createGain();
    this.isoOsc.connect(this.isoPulse);
    this.isoPulse.connect(this.isoGain);
    this.isoGain.connect(this.toneBus);
    this.isoOsc.start();

    this.lfo = ctx.createOscillator();
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 0.5;
    this.dcOffset = ctx.createConstantSource();
    this.dcOffset.offset.value = 0.5;
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.isoPulse.gain);
    this.dcOffset.connect(this.isoPulse.gain);
    this.lfo.start();
    this.dcOffset.start();

    // --- pink noise bed ---
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = this.noiseLevel;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1200;
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = makePinkNoise(ctx, 4);
    this.noiseSrc.loop = true;
    this.noiseSrc.connect(lowpass);
    lowpass.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    this.noiseSrc.start();

    this.applyMode();
  }

  applyMode() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const bin = this.mode === "binaural" ? 1 : 0;
    this.binauralGain.gain.setTargetAtTime(bin, t, 0.1);
    this.isoGain.gain.setTargetAtTime(1 - bin, t, 0.1);
  }

  /* Glide every frequency-bearing node to the given state. */
  setState(key, rampSec = RAMP) {
    this.ensureContext();
    const s = STATES[key];
    const t = this.ctx.currentTime;
    const half = s.beat / 2;

    glide(this.oscL.frequency, s.carrier - half, t, rampSec);
    glide(this.oscR.frequency, s.carrier + half, t, rampSec);
    glide(this.isoOsc.frequency, s.carrier, t, rampSec);
    glide(this.lfo.frequency, s.beat, t, rampSec);

    this.current = key;
  }

  /* The 60-second reset: start in high-beta and glide down into alpha. */
  startResetSweep(durationSec) {
    this.ensureContext();
    const t = this.ctx.currentTime;
    const from = { beat: 16, carrier: 220 };
    const to = STATES.calm;
    const sweep = durationSec * 0.6; // settle into alpha for the last 40%

    setNow(this.oscL.frequency, from.carrier - from.beat / 2, t);
    setNow(this.oscR.frequency, from.carrier + from.beat / 2, t);
    setNow(this.isoOsc.frequency, from.carrier, t);
    setNow(this.lfo.frequency, from.beat, t);

    this.oscL.frequency.linearRampToValueAtTime(to.carrier - to.beat / 2, t + sweep);
    this.oscR.frequency.linearRampToValueAtTime(to.carrier + to.beat / 2, t + sweep);
    this.isoOsc.frequency.linearRampToValueAtTime(to.carrier, t + sweep);
    this.lfo.frequency.linearRampToValueAtTime(to.beat, t + sweep);

    this.current = "calm";
  }

  async play() {
    this.ensureContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(1, t + FADE_IN);
    this.playing = true;
  }

  pause() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + FADE_OUT);
    this.playing = false;
  }

  setToneLevel(v) {
    this.toneLevel = v;
    if (this.ctx) this.toneBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setNoiseLevel(v) {
    this.noiseLevel = v;
    if (this.ctx) this.noiseGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
}

function glide(param, value, t, rampSec) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  param.linearRampToValueAtTime(value, t + rampSec);
}

function setNow(param, value, t) {
  param.cancelScheduledValues(t);
  param.setValueAtTime(value, t);
}

/* Pink noise via the Paul Kellet filter approximation. */
function makePinkNoise(ctx, seconds) {
  const len = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  }
  return buffer;
}

/* ============================================================
 * Session timer + training stats
 * ============================================================ */

const stats = {
  KEY: "hf-stats",
  load() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch { return {}; }
  },
  save(s) { localStorage.setItem(this.KEY, JSON.stringify(s)); },
  recordSession(minutes) {
    const s = this.load();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (s.lastDay !== today) {
      s.streak = s.lastDay === yesterday ? (s.streak || 0) + 1 : 1;
      s.lastDay = today;
    }
    s.sessions = (s.sessions || 0) + 1;
    s.minutes = Math.round(((s.minutes || 0) + minutes) * 10) / 10;
    this.save(s);
    renderStats();
  },
};

function renderStats() {
  const s = stats.load();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const streakAlive = s.lastDay === today || s.lastDay === yesterday;
  document.getElementById("stat-streak").textContent = streakAlive ? (s.streak || 0) : 0;
  document.getElementById("stat-sessions").textContent = s.sessions || 0;
  document.getElementById("stat-minutes").textContent = Math.round(s.minutes || 0);
}

/* ============================================================
 * UI wiring
 * ============================================================ */

const engine = new Engine();

let durationMin = 20;       // 0 = infinite
let remainingSec = null;
let elapsedSec = 0;
let tickHandle = null;
let resetMode = false;

const el = (id) => document.getElementById(id);
const readoutState = el("readout-state");
const readoutFreq = el("readout-freq");
const readoutTimer = el("readout-timer");
const playBtn = el("play-btn");
const iconPlay = el("icon-play");
const iconPause = el("icon-pause");

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateReadout() {
  const s = STATES[engine.current];
  if (!s) return;
  readoutState.textContent = resetMode ? "Reset" : s.name;
  readoutFreq.textContent = resetMode
    ? "Sweeping 16 Hz → 10 Hz · settling into Alpha"
    : `${s.band} · ${s.beat} Hz beat · ${s.carrier} Hz carrier`;
  document.documentElement.style.setProperty("--glow", s.color.join(", "));
}

function selectState(key, { autoplay = true } = {}) {
  resetMode = false;
  engine.setState(key);
  document.querySelectorAll(".state-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.state === key)
  );
  updateReadout();
  if (autoplay && !engine.playing) startSession();
  else if (!engine.playing) readoutTimer.textContent = "--:--";
}

function startSession(seconds = null) {
  engine.play();
  iconPlay.classList.add("hidden");
  iconPause.classList.remove("hidden");
  remainingSec = seconds ?? (durationMin > 0 ? durationMin * 60 : null);
  elapsedSec = 0;
  clearInterval(tickHandle);
  tickHandle = setInterval(tick, 1000);
  tick(0);
}

function tick(step = 1) {
  elapsedSec += step;
  if (remainingSec !== null) {
    remainingSec -= step;
    if (remainingSec <= 0) { endSession(); return; }
    readoutTimer.textContent = fmt(remainingSec);
  } else {
    readoutTimer.textContent = fmt(elapsedSec);
  }
}

function endSession() {
  clearInterval(tickHandle);
  tickHandle = null;
  engine.pause();
  iconPause.classList.add("hidden");
  iconPlay.classList.remove("hidden");
  if (elapsedSec >= 30) stats.recordSession(elapsedSec / 60);
  readoutTimer.textContent = "--:--";
  resetMode = false;
  updateReadout();
}

playBtn.addEventListener("click", () => {
  if (engine.playing) { endSession(); return; }
  if (!engine.current) selectState("focus", { autoplay: false });
  startSession();
});

document.querySelectorAll(".state-btn").forEach((btn) =>
  btn.addEventListener("click", () => selectState(btn.dataset.state))
);

el("reset-btn").addEventListener("click", () => {
  if (engine.playing) endSession();
  resetMode = true;
  engine.startResetSweep(60);
  document.querySelectorAll(".state-btn").forEach((b) => b.classList.remove("active"));
  updateReadout();
  startSession(60);
});

el("durations").addEventListener("click", (e) => {
  const btn = e.target.closest(".dur");
  if (!btn) return;
  durationMin = Number(btn.dataset.min);
  document.querySelectorAll(".dur").forEach((b) => b.classList.toggle("active", b === btn));
  if (engine.playing && !resetMode) {
    remainingSec = durationMin > 0 ? durationMin * 60 : null;
  }
});

el("vol-tone").addEventListener("input", (e) => engine.setToneLevel(e.target.value / 100));
el("vol-noise").addEventListener("input", (e) => engine.setNoiseLevel(e.target.value / 100));

el("mode-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-opt");
  if (!btn) return;
  engine.mode = btn.dataset.mode;
  engine.applyMode();
  document.querySelectorAll(".mode-opt").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  });
  el("hint").textContent = engine.mode === "binaural"
    ? "Binaural mode requires stereo headphones — each ear receives a slightly different tone and your brain perceives the difference as a rhythmic beat."
    : "Isochronic mode pulses a single tone at the target rate, so it works on regular speakers — no headphones needed.";
});

/* ============================================================
 * Orb visualizer — pulses with the active beat frequency
 * ============================================================ */

const canvas = el("orb");
const g = canvas.getContext("2d");
let phase = 0;
let lastT = performance.now();

function drawOrb(now) {
  const dt = (now - lastT) / 1000;
  lastT = now;

  const s = STATES[engine.current] || STATES.focus;
  const [r, gr, b] = s.color;
  const beat = engine.playing ? s.beat : 0.15;          // idle = slow breathing
  phase += dt * beat * 2 * Math.PI;

  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  // fast beat shimmer layered on a slow breath, kept subtle at high Hz
  const breath = Math.sin(now / 2400) * 8;
  const shimmer = Math.sin(phase) * (engine.playing ? Math.min(10, 24 / Math.sqrt(beat)) : 4);
  const base = W * 0.21 + breath + shimmer;

  g.clearRect(0, 0, W, H);

  for (let i = 4; i >= 1; i--) {
    const rad = base + i * 26;
    const alpha = (engine.playing ? 0.10 : 0.05) / i;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.strokeStyle = `rgba(${r}, ${gr}, ${b}, ${alpha * 2})`;
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = `rgba(${r}, ${gr}, ${b}, ${alpha * 0.5})`;
    g.fill();
  }

  const grad = g.createRadialGradient(cx, cy, base * 0.1, cx, cy, base);
  grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${engine.playing ? 0.85 : 0.45})`);
  grad.addColorStop(0.7, `rgba(${r}, ${gr}, ${b}, 0.18)`);
  grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
  g.beginPath();
  g.arc(cx, cy, base, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();

  requestAnimationFrame(drawOrb);
}

renderStats();
requestAnimationFrame(drawOrb);
