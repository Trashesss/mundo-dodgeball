// 간단한 WebAudio 합성 효과음 (외부 파일 없음)
let ctx = null;
let master = null;
let muted = false;
let musicStarted = false;
const music = document.getElementById('bgm');
music.volume = 0.22;

function syncMusic() {
  music.muted = muted;
  if (!musicStarted || document.hidden || muted) music.pause();
  else if (music.paused) music.play().catch(() => {}); // 다음 사용자 입력에서 재시도
}

function unlock() {
  ensure();
  syncMusic();
}

// 입력은 오디오 잠금만 해제한다. 음악은 경기 진입 시 별도로 시작한다.
document.addEventListener('pointerdown', unlock);
document.addEventListener('keydown', unlock);
document.addEventListener('visibilitychange', syncMusic);

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

// 어택 → 유지 → 감쇠 엔벨로프를 가진 노이즈. flutter를 주면 회전하는 칼날처럼 떨린다.
function swell({ attack = 0.005, hold = 0, release = 0.2, type = 'bandpass', f0 = 800, f1 = 800, q = 1, gain = 0.3, vol = 1, flutter = 0 }) {
  nbuf ??= noiseBuffer();
  const t = ctx.currentTime;
  const end = t + attack + hold + release;
  const src = ctx.createBufferSource();
  src.buffer = nbuf;
  src.loop = true; // 버퍼(0.6초)보다 긴 소리도 끊기지 않게
  const filt = ctx.createBiquadFilter();
  filt.type = type; filt.Q.value = q;
  filt.frequency.setValueAtTime(f0, t);
  filt.frequency.exponentialRampToValueAtTime(f1, end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(gain * vol, t + attack);
  g.gain.setValueAtTime(gain * vol, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.001, end);
  let out = g;
  if (flutter) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const fl = ctx.createGain();
    lfo.frequency.value = flutter;
    depth.gain.value = 0.35;
    fl.gain.value = 0.65;
    lfo.connect(depth).connect(fl.gain);
    g.connect(fl);
    out = fl;
    lfo.start(t); lfo.stop(end + 0.05);
  }
  src.connect(filt).connect(g);
  out.connect(master);
  src.start(t); src.stop(end + 0.05);
}

// drive > 0이면 소프트 클리핑으로 배음을 더해 작은 스피커에서도 쿵이 들리게 한다
const shapers = new Map();
function shaper(drive) {
  if (!shapers.has(drive)) {
    const ws = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    ws.curve = curve;
    ws.connect(master);
    shapers.set(drive, ws);
  }
  return shapers.get(drive);
}

function tone({ dur = 0.2, type = 'sine', f0 = 440, f1 = 440, gain = 0.2, vol = 1, drive = 0, pitchDur = dur, attack = 0 }) {
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + pitchDur);
  const g = ctx.createGain();
  if (attack) {
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(gain * vol, t + attack);
  } else g.gain.setValueAtTime(gain * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(drive ? shaper(drive) : master);
  o.start(t); o.stop(t + dur + 0.05);
}

const play = (fn) => (vol = 1) => { if (muted) return; ensure(); fn(vol); };

export const Sound = {
  unlock,
  startMusic: () => {
    musicStarted = true;
    document.querySelector('.music-credit').classList.remove('hidden');
    unlock();
  },
  stopMusic: () => {
    musicStarted = false;
    syncMusic();
    music.currentTime = 0;
    document.querySelector('.music-credit').classList.add('hidden');
  },
  toggleMute: () => {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    syncMusic();
    return muted;
  },
  get muted() { return muted; },
  // 칼날이 공기를 가르는 "슈우욱": 40ms에 차오르고 높은 대역에서 아래로 미끄러지며 빠진다
  // 무거운 칼날이 공기를 가르는 "후우웅": 바람 소리를 낮추고 저역 휘두름을 깔았다
  throw: play((vol) => {
    // 세 층이 같은 엔벨로프로 함께 차오르고 함께 빠져 한 번의 휘두름으로 들린다
    swell({ attack: 0.06, hold: 0.1, release: 0.24, f0: 2400, f1: 1200, q: 0.8, gain: 0.18, vol });
    swell({ attack: 0.06, hold: 0.1, release: 0.24, type: 'lowpass', f0: 1000, f1: 400, q: 1.2, gain: 0.4, vol });
    tone({ attack: 0.06, dur: 0.4, type: 'sine', f0: 110, f1: 60, gain: 0.18, vol, drive: 1.5 });
  }),
  // 박히는 "콰직": 날카로운 첫 타격음 + 찌그러진 킥 + 묵직한 몸통 + 짧은 고역 잔향
  hit: play((vol) => {
    swell({ attack: 0.001, release: 0.035, type: 'highpass', f0: 2500, f1: 1500, q: 0.7, gain: 0.55, vol });
    tone({ dur: 0.26, type: 'sine', f0: 190, f1: 42, pitchDur: 0.12, gain: 0.8, vol, drive: 3 });
    tone({ dur: 0.2, type: 'triangle', f0: 95, f1: 40, gain: 0.35, vol });
    swell({ attack: 0.002, hold: 0.04, release: 0.22, f0: 700, f1: 250, q: 0.8, gain: 0.45, vol });
    swell({ attack: 0.002, hold: 0.05, release: 0.22, f0: 3600, f1: 2000, q: 0.5, gain: 0.22, vol });
  }),
  // 빗나간 식칼이 물에 꽂히는 "첨벙": 적중보다 가볍게, 음정 있는 톤 없이 낮게 깔리는 물 튀는 노이즈 + 작은 둔탁음
  splash: play((vol) => {
    swell({ attack: 0.004, hold: 0.03, release: 0.26, type: 'lowpass', f0: 1200, f1: 300, q: 0.7, gain: 0.4, vol });
    swell({ attack: 0.01, hold: 0.02, release: 0.3, f0: 900, f1: 400, q: 0.6, gain: 0.12, vol });
    tone({ dur: 0.12, type: 'sine', f0: 140, f1: 70, gain: 0.18, vol });
  }),
  // 암벽에 꽂히는 "툭": 울림 없이 짧게 끝나는 바위 부딪힘
  clank: play((vol) => {
    swell({ attack: 0.001, release: 0.05, f0: 1400, f1: 700, q: 0.8, gain: 0.3, vol });
    swell({ attack: 0.002, release: 0.12, type: 'lowpass', f0: 700, f1: 250, q: 0.7, gain: 0.3, vol });
    tone({ dur: 0.1, type: 'sine', f0: 160, f1: 80, gain: 0.22, vol });
  }),
  death: play((vol) => { tone({ dur: 0.7, type: 'sawtooth', f0: 260, f1: 60, gain: 0.12, vol }); }),
  // 점멸 "탕—": 전 대역이 한 번에 터지는 크랙 + 뒤따르는 깊은 붐 + 메아리처럼 남는 노이즈 꼬리
  flash: play((vol) => {
    swell({ attack: 0.001, hold: 0.015, release: 0.08, type: 'highpass', f0: 1500, f1: 1200, q: 0.7, gain: 0.4, vol });
    swell({ attack: 0.001, hold: 0.04, release: 0.18, f0: 420, f1: 200, q: 0.8, gain: 0.55, vol });
    tone({ dur: 0.5, type: 'sine', f0: 110, f1: 40, pitchDur: 0.2, gain: 0.8, vol, drive: 3 });
    tone({ dur: 0.45, type: 'triangle', f0: 70, f1: 35, gain: 0.35, vol });
    swell({ attack: 0.005, hold: 0.04, release: 0.6, f0: 2500, f1: 1500, q: 0.6, gain: 0.12, vol });
  }),
  // 유체화 "후와아—": 빠르게 차오르는 바람 소리가 4kHz에서 1kHz로 가라앉으며 1.3초 안에 흩어진다
  ghost: play((vol) => {
    swell({ attack: 0.05, hold: 0.33, release: 0.92, f0: 4200, f1: 1000, q: 0.7, gain: 0.35, vol });
    swell({ attack: 0.05, hold: 0.26, release: 0.72, type: 'lowpass', f0: 800, f1: 300, q: 0.7, gain: 0.2, vol });
  }),
  tick: play(() => { tone({ dur: 0.12, type: 'square', f0: 660, f1: 660, gain: 0.06 }); }),
  go: play(() => { tone({ dur: 0.35, type: 'square', f0: 880, f1: 880, gain: 0.07 }); }),
  ready: play(() => { tone({ dur: 0.08, f0: 1200, f1: 1500, gain: 0.05 }); }),
  win: play(() => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone({ dur: 0.3, type: 'triangle', f0: f, f1: f, gain: 0.12 }), i * 110)); }),
  lose: play(() => { [392, 330, 262].forEach((f, i) => setTimeout(() => tone({ dur: 0.4, type: 'triangle', f0: f, f1: f * 0.98, gain: 0.12 }), i * 160)); }),
};
