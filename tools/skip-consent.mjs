// 게임 검사에서는 첫 방문 팝업이 화면을 가리지 않도록 미리 확인 처리한다.
import { UPDATE_NOTICE, UPDATE_NOTICE_STORAGE_KEY } from '../src/updates-data.js';
const CONSENT_KEY = 'mundo-analytics-consent-v1'; // src/analytics.js 와 같은 키

export const skipConsent = (page) => page.evaluateOnNewDocument((key, updateKey, updateId) => {
  try { localStorage.setItem(key, 'declined'); } catch {}
  try { localStorage.setItem(updateKey, updateId); } catch {}
}, CONSENT_KEY, UPDATE_NOTICE_STORAGE_KEY, UPDATE_NOTICE.id);
