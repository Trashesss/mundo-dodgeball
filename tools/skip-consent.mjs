// 검사용 페이지는 분석 동의 팝업이 화면을 가리지 않도록 '거절'로 미리 답해 둔다
const CONSENT_KEY = 'mundo-analytics-consent-v1'; // src/analytics.js 와 같은 키

export const skipConsent = (page) => page.evaluateOnNewDocument((key) => {
  try { localStorage.setItem(key, 'declined'); } catch {}
}, CONSENT_KEY);
