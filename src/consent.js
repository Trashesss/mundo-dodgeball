import { getAnalyticsConsent, setAnalyticsConsent } from './analytics.js';

// 첫 방문 동의 팝업. 이후 변경은 설정(src/settings.js)의 플레이 통계 전송 스위치로 한다.
const dialog = document.getElementById('analytics-consent');
const settings = document.getElementById('analytics-settings');
const menu = document.getElementById('menu');
let dismissed = false;

function open() {
  if (!dialog.open) dialog.showModal();
}

function close() {
  dismissed = true;
  dialog.close();
}

function showInitialPrompt() {
  if (!dismissed && getAnalyticsConsent() === null && !menu.classList.contains('hidden')) open();
}

dialog.addEventListener('cancel', () => { dismissed = true; });
dialog.addEventListener('close', () => {
  if (!menu.classList.contains('hidden')) settings.focus({ preventScroll: true });
});
for (const [id, value] of [['analytics-accept', 'accepted'], ['analytics-decline', 'declined']]) {
  document.getElementById(id).addEventListener('click', () => {
    setAnalyticsConsent(value);
    close();
  });
}
window.addEventListener('analytics-consent-change', () => {
  if (getAnalyticsConsent() !== null) close();
  else showInitialPrompt();
});
new MutationObserver(showInitialPrompt).observe(menu, { attributes: true, attributeFilter: ['class'] });
showInitialPrompt();
