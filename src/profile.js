// 프로필 창: 숙련도(레벨)·경험치 바와 룬 3칸 선택. 저장은 src/profile-state.js
import { RUNES, RUNE_SLOTS } from './rules.js';
import { XP_REWARDS, getProfile, setRune } from './profile-state.js';

const $ = id => document.getElementById(id);
const SLOT_NAMES = { throw: '투척', move: '이동', util: '유틸' };
const SLOT_HINTS = { throw: '공 속도·피해·둔화', move: '이동 속도·맷집·유체화', util: '쿨다운과 회복' };

export function initProfile() {
  const dialog = $('profile-dialog');
  $('profile-xp-win').textContent = `+${XP_REWARDS.win}`;
  $('profile-xp-loss').textContent = `+${XP_REWARDS.loss}`;

  for (const slot of RUNE_SLOTS) {
    const group = document.createElement('fieldset');
    group.className = 'profile-rune-slot';
    group.innerHTML = `<legend><span>${SLOT_NAMES[slot]}</span><small>${SLOT_HINTS[slot]}</small></legend><div class="profile-rune-options"></div>`;
    for (const rune of RUNES[slot]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'profile-rune';
      button.dataset.slot = slot;
      button.dataset.rune = rune.id;
      const effects = rune.id === 'base'
        ? '<span class="rune-neutral">효과 없음</span>'
        : [...rune.pros.map(t => `<span class="rune-pro">${t}</span>`), ...rune.cons.map(t => `<span class="rune-con">${t}</span>`)].join('');
      button.innerHTML = `<strong>${rune.name}</strong><span class="profile-rune-effects">${effects}</span><span class="profile-rune-check" aria-hidden="true"></span>`;
      button.addEventListener('click', () => setRune(slot, rune.id));
      group.querySelector('.profile-rune-options').append(button);
    }
    $('profile-rune-slots').append(group);
  }

  function render() {
    const profile = getProfile();
    $('menu-level').textContent = profile.level;
    $('profile-level').textContent = profile.level;
    $('profile-xp-text').textContent = `${profile.into.toLocaleString('ko-KR')} / ${profile.need.toLocaleString('ko-KR')} XP`;
    $('profile-xp-fill').style.width = `${(profile.into / profile.need) * 100}%`;
    const bar = $('profile-xp-bar');
    bar.setAttribute('aria-valuemax', profile.need);
    bar.setAttribute('aria-valuenow', profile.into);
    for (const button of dialog.querySelectorAll('.profile-rune')) {
      button.setAttribute('aria-pressed', String(profile.runes[button.dataset.slot] === button.dataset.rune));
    }
    $('profile-storage-note').textContent = profile.persistent
      ? '경험치와 룬은 이 브라우저에 저장돼요.'
      : '저장을 사용할 수 없어 이번 방문 동안만 유지돼요.';
  }

  $('profile-open').addEventListener('click', () => { render(); dialog.showModal(); dialog.querySelector('.profile-body').scrollTop = 0; });
  $('profile-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => $('profile-open').focus({ preventScroll: true }));
  window.addEventListener('mundo-profile-change', render);
  render();
}
