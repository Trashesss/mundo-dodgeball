// 메인 화면 오른쪽 위 설정: 소리 켜고 끄기, 플레이 통계 전송 동의 켜고 끄기
import { Sound } from './sound.js';
// import { getAnalyticsConsent, setAnalyticsConsent } from './analytics.js';

const $ = (id) => document.getElementById(id);
const dialog = $('settings-dialog');
const button = $('analytics-settings');

function render() {
  const on = !Sound.muted;
  $('sound-toggle').setAttribute('aria-checked', String(on));
  // $('analytics-toggle').setAttribute('aria-checked', String(getAnalyticsConsent() === 'accepted'));
}

button.addEventListener('click', () => {
  render();
  if (!dialog.open) dialog.showModal();
  button.setAttribute('aria-expanded', 'true');
});
dialog.addEventListener('close', () => {
  button.setAttribute('aria-expanded', 'false');
  button.focus({ preventScroll: true });
});
$('sound-toggle').addEventListener('click', () => {
  Sound.setMuted(!Sound.muted);
  render();
});
// 플레이 통계 전송 스위치 일시 중단
// // 아직 고르지 않았으면 꺼진 상태로 보이고, 켜면 동의로 저장된다
// $('analytics-toggle').addEventListener('click', () => {
//   setAnalyticsConsent(getAnalyticsConsent() === 'accepted' ? 'declined' : 'accepted');
//   render();
// });
// window.addEventListener('analytics-consent-change', render);
$('settings-close').addEventListener('click', () => dialog.close());
