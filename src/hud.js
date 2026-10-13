// DOM 기반 HUD (하단 스킬바, 상단 체력, 알림, 채팅, 결과 화면)
import { RULES } from './rules.js';

const $ = (id) => document.getElementById(id);

export const HUD = {
  show(on) {
    for (const id of ['topbar', 'hud']) $(id).classList.toggle('hidden', !on);
  },

  updateFight(champs, reset = false) {
    for (const c of champs) {
      const hp = Math.max(0, Math.min(RULES.maxHp, c.hp));
      const track = $(`health-${c.team}`);
      track.classList.toggle('reset', reset);
      track.style.setProperty('--health', hp / RULES.maxHp);
      track.setAttribute('aria-valuemax', RULES.maxHp);
      track.setAttribute('aria-valuenow', Math.ceil(hp));
      $(`hp-${c.team}`).textContent = `${Math.ceil(hp)} / ${RULES.maxHp}`;
      $(`fighter-${c.team}`).classList.toggle('low-health', hp > 0 && hp <= RULES.maxHp * 0.25);
      $(`fighter-${c.team}`).classList.toggle('knocked-out', !c.alive);
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
  update(p) {
    this._prev.q = this._skill('sk-q', p.qCd, RULES.q.cd, this._prev.q);
    this._prev.d = this._skill('sk-d', p.flashCd, RULES.flash.cd, this._prev.d);
    this._prev.f = this._skill('sk-f', p.ghostCd, RULES.ghost.cd, this._prev.f);
    $('hud').classList.toggle('unavailable', !p.alive);
  },

  announce(text, sub = '', cls = 'neutral') {
    const box = $('announce');
    box.innerHTML = `<div class="msg ${cls}">${text}${sub ? `<small>${sub}</small>` : ''}</div>`;
  },

  countdown(text) {
    $('countdown').innerHTML = text ? `<span class="n">${text}</span>` : '';
  },

  chat(text) {
    const el = document.createElement('div');
    el.className = 'line';
    el.innerHTML = `<span class="sys">${text}</span>`;
    const box = $('chat');
    box.append(el);
    while (box.children.length > 7) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 7000);
    setTimeout(() => el.remove(), 8000);
  },

  clearFeeds() {
    $('chat').innerHTML = '';
    $('announce').innerHTML = '';
    $('countdown').innerHTML = '';
  },

  result(win, champs, score) {
    $('result-title').textContent = win ? '승리' : '패배';
    $('result-title').className = win ? 'win' : 'lose';
    $('result-sub').textContent = `라운드 ${score[0]} : ${score[1]}`;
    const rows = [...champs].sort((a, b) => a.team - b.team);
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
