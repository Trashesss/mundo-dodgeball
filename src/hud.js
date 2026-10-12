// DOM 기반 HUD (하단 스킬바, 상단 스코어, 킬피드, 알림, 채팅, 미니맵, 결과 화면)
import { RULES } from './rules.js';

const $ = (id) => document.getElementById(id);

export const HUD = {
  show(on) {
    for (const id of ['topbar', 'corner', 'hud', 'minimap-wrap', 'help']) $(id).classList.toggle('hidden', !on);
  },

  setScore(score, round) {
    $('score-0').textContent = score[0];
    $('score-1').textContent = score[1];
    $('round-label').textContent = `ROUND ${round} · ${RULES.roundsToWin}승 선취`;
    for (const t of [0, 1]) {
      $(`pips-${t}`).innerHTML = Array.from({ length: RULES.roundsToWin }, (_, i) => `<i class="${i < score[t] ? 'on' : ''}"></i>`).join('');
    }
  },

  _skill(id, cd, max, prevReady) {
    const el = $(id);
    const ready = cd <= 0;
    el.querySelector('.cd').style.setProperty('--p', ready ? 1 : 1 - cd / max);
    el.querySelector('.cdtext').textContent = ready ? '' : cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
    el.classList.toggle('ready', ready);
    if (ready && prevReady === false) {
      el.classList.remove('flash-ready'); void el.offsetWidth; el.classList.add('flash-ready');
    }
    return ready;
  },

  _prev: {},
  update(p, fps, clock) {
    const hp = Math.max(0, p.hp);
    $('hp-fill').style.width = `${(hp / RULES.maxHp) * 100}%`;
    $('hp-text').textContent = `${Math.ceil(hp)} / ${RULES.maxHp}`;
    this._prev.q = this._skill('sk-q', p.qCd, RULES.q.cd, this._prev.q);
    this._prev.d = this._skill('sk-d', p.flashCd, RULES.flash.cd, this._prev.d);
    this._prev.f = this._skill('sk-f', p.ghostCd, RULES.ghost.cd, this._prev.f);
    $('st-hit').textContent = p.stats.hits;
    $('st-throw').textContent = p.stats.throws;
    $('st-acc').textContent = p.stats.throws ? `${Math.round((p.stats.hits / p.stats.throws) * 100)}%` : '-';
    $('kda').textContent = `⚔ ${p.stats.kills} / ${p.stats.deaths}`;
    $('fps').textContent = `FPS ${Math.round(fps)}`;
    const s = Math.floor(clock);
    $('clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  },

  announce(text, sub = '', cls = 'neutral') {
    const box = $('announce');
    box.innerHTML = `<div class="msg ${cls}">${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
  },

  countdown(text) {
    $('countdown').innerHTML = text ? `<span class="n">${text}</span>` : '';
  },

  killfeed(killer, victim, playerTeam) {
    const cls = (c) => (c.isPlayer ? 'me' : c.team === 0 ? 'b' : 'r');
    const el = document.createElement('div');
    el.className = 'kf';
    el.innerHTML = `<span class="${cls(killer)}">${killer.name}</span><span class="ico"></span><span class="${cls(victim)}">${victim.name}</span>`;
    const feed = $('killfeed');
    feed.prepend(el);
    while (feed.children.length > 6) feed.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 6000);
    setTimeout(() => el.remove(), 6700);
  },

  chat(who, text) {
    const el = document.createElement('div');
    el.className = 'line';
    if (who) el.innerHTML = `<span class="who ${who.team === 0 ? 'b' : 'r'}">[${who.team === 0 ? '아군' : '적'}] ${who.name}:</span> ${text}`;
    else el.innerHTML = `<span class="sys">${text}</span>`;
    const box = $('chat');
    box.append(el);
    while (box.children.length > 7) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 7000);
    setTimeout(() => el.remove(), 8000);
  },

  clearFeeds() {
    $('killfeed').innerHTML = '';
    $('chat').innerHTML = '';
    $('announce').innerHTML = '';
    $('countdown').innerHTML = '';
  },

  minimap(game) {
    const cv = $('minimap');
    const g = cv.getContext('2d');
    const W = cv.width, H = cv.height, R = RULES.arenaR;
    const k = (W / 2 - 14) / (R + 1);
    const mx = (x) => W / 2 + x * k, mz = (z) => H / 2 + z * k;
    g.fillStyle = '#0b1714'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#26332c';
    g.beginPath(); g.arc(W / 2, H / 2, (R + 2.5) * k, 0, 7); g.fill();
    const grad = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * k);
    grad.addColorStop(0, '#1d6170'); grad.addColorStop(1, '#0c2e3a');
    g.fillStyle = grad;
    g.beginPath(); g.arc(W / 2, H / 2, R * k, 0, 7); g.fill();
    g.fillStyle = '#3a9cff14'; g.fillRect(0, 0, W / 2, H);
    g.fillStyle = '#ff484814'; g.fillRect(W / 2, 0, W / 2, H);
    g.strokeStyle = '#c89bff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2, mz(-R)); g.lineTo(W / 2, mz(R)); g.stroke();
    for (const p of game.cleavers) {
      if (!p.alive) continue;
      g.fillStyle = '#fff';
      g.fillRect(mx(p.x) - 1.5, mz(p.z) - 1.5, 3, 3);
    }
    for (const c of game.champs) {
      const col = c.isPlayer ? '#5fe05f' : c.team === 0 ? '#3a9cff' : '#ff4848';
      g.globalAlpha = c.alive ? 1 : 0.35;
      g.fillStyle = col;
      g.beginPath(); g.arc(mx(c.x), mz(c.z), c.isPlayer ? 7 : 6, 0, 7); g.fill();
      g.strokeStyle = c.isPlayer ? '#fff' : '#000'; g.lineWidth = 1.5; g.stroke();
      if (!c.alive) {
        g.strokeStyle = '#fff'; g.beginPath();
        g.moveTo(mx(c.x) - 4, mz(c.z) - 4); g.lineTo(mx(c.x) + 4, mz(c.z) + 4);
        g.moveTo(mx(c.x) + 4, mz(c.z) - 4); g.lineTo(mx(c.x) - 4, mz(c.z) + 4); g.stroke();
      }
    }
    g.globalAlpha = 1;
    // 카메라 시야
    const v = game.viewRect();
    if (v) {
      g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.strokeRect(mx(v.x0), mz(v.z0), (v.x1 - v.x0) * k, (v.z1 - v.z0) * k);
    }
  },

  result(win, champs, score) {
    $('result-title').textContent = win ? '승리' : '패배';
    $('result-title').className = win ? 'win' : 'lose';
    $('result-sub').textContent = `라운드 ${score[0]} : ${score[1]}`;
    const rows = [...champs].sort((a, b) => a.team - b.team || b.stats.kills - a.stats.kills);
    $('result-table').innerHTML =
      '<tr><th>문도</th><th>처치</th><th>데스</th><th>적중/투척</th><th>명중률</th></tr>' +
      rows.map((c) => {
        const s = c.stats;
        const acc = s.throws ? Math.round((s.hits / s.throws) * 100) + '%' : '-';
        return `<tr class="${c.team === 0 ? 'b' : 'r'} ${c.isPlayer ? 'me' : ''}"><td>${c.name}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.hits}/${s.throws}</td><td>${acc}</td></tr>`;
      }).join('');
    $('result').classList.remove('hidden');
  },
};
