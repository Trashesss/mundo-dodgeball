import { getAnalyticsConsent, setAnalyticsConsent } from './analytics.js';

const dialog = document.getElementById('analytics-consent');
const settings = document.getElementById('analytics-settings');
const menu = document.getElementById('menu');
let dismissed = false;

function open() {
  if (!dialog.open) dialog.showModal();
  settings.setAttribute('aria-expanded', 'true');
}

function close() {
  dismissed = true;
  dialog.close();
}

function showInitialPrompt() {
  if (!dismissed && getAnalyticsConsent() === null && !menu.classList.contains('hidden')) open();
}

settings.addEventListener('click', open);
dialog.addEventListener('cancel', () => { dismissed = true; });
dialog.addEventListener('close', () => {
  settings.setAttribute('aria-expanded', 'false');
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
