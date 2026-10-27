// 프로필 창: 숙련도(레벨)·경험치 바. 저장은 src/profile-state.js
import { XP_REWARDS, getProfile } from './profile-state.js';

const $ = id => document.getElementById(id);

export function initProfile() {
  const dialog = $('profile-dialog');
  $('profile-xp-win').textContent = `+${XP_REWARDS.win}`;
  $('profile-xp-loss').textContent = `+${XP_REWARDS.loss}`;

  function render() {
    const profile = getProfile();
    $('menu-level').textContent = profile.level;
    $('profile-level').textContent = profile.level;
    $('profile-xp-text').textContent = `${profile.into.toLocaleString('ko-KR')} / ${profile.need.toLocaleString('ko-KR')} XP`;
    $('profile-xp-fill').style.width = `${(profile.into / profile.need) * 100}%`;
    const bar = $('profile-xp-bar');
    bar.setAttribute('aria-valuemax', profile.need);
    bar.setAttribute('aria-valuenow', profile.into);
    $('profile-storage-note').textContent = profile.persistent
      ? '경험치는 이 브라우저에 저장돼요.'
      : '저장을 사용할 수 없어 이번 방문 동안만 유지돼요.';
  }

  $('profile-open').addEventListener('click', () => { render(); dialog.showModal(); dialog.querySelector('.profile-body').scrollTop = 0; });
  $('profile-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => $('profile-open').focus({ preventScroll: true }));
  window.addEventListener('mundo-profile-change', render);
  render();
}
