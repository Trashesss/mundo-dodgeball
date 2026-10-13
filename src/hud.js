// DOM 기반 HUD (하단 스킬바, 상단 체력, 채팅, 결과 화면)
import { RULES } from './rules.js';

const $ = (id) => document.getElementById(id);

export const HUD = {
  show(on, twins = false) {
    for (const id of ['topbar', 'hud']) $(id).classList.toggle('hidden', !on);
    $('topbar').classList.toggle('twins', twins);
    $('enemy-name').textContent = twins ? '쌍둥이 문도' : '문도 박사';
  },

  updateFight(champs, reset = false) {
    for (const c of champs) {
      const hp = Math.max(0, Math.min(RULES.maxHp, c.hp));
      const track = $(`health-${c.hudSlot}`);
      track.classList.toggle('reset', reset);
      track.style.setProperty('--health', hp / RULES.maxHp);
      track.setAttribute('aria-valuemax', RULES.maxHp);
      track.setAttribute('aria-valuenow', Math.ceil(hp));
      $(`hp-${c.hudSlot}`).textContent = `${Math.ceil(hp)} / ${RULES.maxHp}`;
      track.classList.toggle('knocked-out', !c.alive);
    }
    for (const team of [0, 1]) {
      const side = champs.filter(c => c.team === team);
      if (!side.length) continue;
      const hp = Math.max(...side.map(c => (c.alive ? c.hp : 0)));
      $(`fighter-${team}`).classList.toggle('low-health', hp > 0 && hp <= RULES.maxHp * 0.25);
      $(`fighter-${team}`).classList.toggle('knocked-out', side.every(c => !c.alive));
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
  },

  result(win, difficulty) {
    const names = { easy: '쉬움', normal: '보통', hard: '어려움', faker: '페이커', twins: '쌍둥이' };
    this.show(false);
    this.clearFeeds();
    $('result').dataset.outcome = win ? 'win' : 'lose';
    $('result-title').textContent = `${names[difficulty]} 난이도 ${win ? '클리어!' : '실패'}`;
    $('result').classList.remove('hidden');
  },
};
