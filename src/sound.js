// 간단한 WebAudio 합성 효과음 (외부 파일 없음)
let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer() {
  const len = ctx.sampleRate * 0.6;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
let nbuf = null;

function noise({ dur = 0.2, type = 'bandpass', f0 = 800, f1 = 800, q = 1, gain = 0.3, vol = 1 }) {
  nbuf ??= noiseBuffer();
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = nbuf;
  const filt = ctx.createBiquadFilter();
  filt.type = type; filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

function tone({ dur = 0.2, type = 'sine', f0 = 440, f1 = 440, gain = 0.2, vol = 1 }) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const play = (fn) => (vol = 1) => { if (muted) return; ensure(); fn(vol); };

export const Sound = {
  unlock: () => ensure(),
  toggleMute: () => (muted = !muted),
  get muted() { return muted; },
  throw: play((vol) => { noise({ dur: 0.25, f0: 600, f1: 2600, q: 2, gain: 0.25, vol }); }),
  hit: play((vol) => {
    tone({ dur: 0.22, type: 'sine', f0: 140, f1: 45, gain: 0.6, vol });
    noise({ dur: 0.12, type: 'lowpass', f0: 2400, f1: 300, gain: 0.35, vol });
  }),
  death: play((vol) => { tone({ dur: 0.7, type: 'sawtooth', f0: 260, f1: 60, gain: 0.12, vol }); }),
  flash: play((vol) => { tone({ dur: 0.18, f0: 500, f1: 1600, gain: 0.15, vol }); noise({ dur: 0.15, f0: 3000, f1: 6000, gain: 0.1, vol }); }),
  ghost: play((vol) => { tone({ dur: 0.4, type: 'triangle', f0: 300, f1: 700, gain: 0.12, vol }); }),
  tick: play(() => { tone({ dur: 0.12, type: 'square', f0: 660, f1: 660, gain: 0.06 }); }),
  go: play(() => { tone({ dur: 0.35, type: 'square', f0: 880, f1: 880, gain: 0.07 }); }),
  ready: play(() => { tone({ dur: 0.08, f0: 1200, f1: 1500, gain: 0.05 }); }),
  win: play(() => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ dur: 0.3, type: 'triangle', f0: f, f1: f, gain: 0.12 }), i * 110)); }),
  lose: play(() => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ dur: 0.4, type: 'triangle', f0: f, f1: f * 0.98, gain: 0.12 }), i * 160)); }),
};
